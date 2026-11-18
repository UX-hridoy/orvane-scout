import {
  FIRST_ORDER_SHARE, MARKETPLACE_FEE, MARKETS, ORIGIN_NAME, CATEGORY_ORDER, PRIORITIES, PRODUCTS, SPLITS, SUPPLIERS, productById, productsIn,
} from './data';
import { list, money, money0, monthLabel, pct, round2, trendText } from './format';
import type {
  CategoryId, Diff, Evidence, Market, MarketId, Move, Origin, Product, ProductResult, Profile, Quote, Run, Split, Stack, SupRun, SupTier, Supplier, SupplierResult, Tier, Verdict,
} from './types';

/**
 * Scout's reasoning engine. Pure functions over the simulated data:
 * the same code feeds the interface, Scout's built-in answers and the
 * tools the live model calls, so no two places can disagree on a number.
 */

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const theMarket = (m: Market) => m.the;

export const capFor = (budget: number, share = FIRST_ORDER_SHARE) => Math.round(budget * share);
/** The seller's split: what they chose, or Scout's pick for their experience. */
export const splitOf = (p: Profile): Split => p.split ?? (p.experience === 'existing' ? 'stock' : 'balanced');
export const shareOf = (p: Profile) => SPLITS[splitOf(p)].share;
/** The most this seller's first order may cost. Every limit in the app comes from here. */
export const capOf = (p: Profile) => capFor(p.budget, shareOf(p));

/* ───────────────────────── One sale, every cost ───────────────────────── */

export interface StackOpts {
  cost?: number;
  ship?: number;
  origin?: Origin;
  moq?: number;
  price?: number;
  ad?: number;
}

export function stackFor(p: Product, profile: Profile, o: StackOpts = {}): Stack {
  const m = MARKETS[profile.market];
  const onMarketplace = profile.channel === 'marketplace';
  const price = o.price ?? p.price[profile.market];
  const net = round2(price / (1 + m.vat));
  const tax = round2(price - net);
  const cost = o.cost ?? p.cost;
  const ship = round2((o.ship ?? p.ship) * m.shipMult);
  const duty = round2(cost * m.duty[o.origin ?? 'CN']);
  const fees = onMarketplace ? round2(price * MARKETPLACE_FEE) : round2(price * m.pay.pct + m.pay.fixed);
  const ad = o.ad ?? (onMarketplace ? m.adMarketplace : m.adOwn);
  const returns = round2(price * (p.returns + m.refusals));
  const profit = round2(net - cost - ship - duty - fees - ad - returns);
  const landed = round2(cost + ship + duty);
  const moq = o.moq ?? p.moq;
  const firstOrder = round2(moq * landed);
  const perUnitBack = profit + landed;
  return {
    price, tax, net, cost, ship, duty, fees, ad, returns, profit,
    margin: profit / price,
    landed, moq, firstOrder,
    breakEvenUnits: perUnitBack > 0 ? Math.ceil(firstOrder / perUnitBack) : Infinity,
    breakEvenAd: round2(ad + profit),
  };
}

/* ───────────────────────── Ranking and verdicts ───────────────────────── */

export const FACTOR_NAMES: Record<string, string> = {
  profit: 'profit per sale', trend: 'demand growth', level: 'size of demand', crowd: 'light competition',
  returns: 'low returns', stable: 'steady demand', cushion: 'room for error', headroom: 'budget to spare', moq: 'a small first order',
};

export function weightsFor(profile: Profile) {
  const w: Record<string, number> = { profit: 3, trend: 1, level: 1, crowd: 1, returns: 1, stable: 1, cushion: 1, headroom: 0.5, moq: 0 };
  for (const p of profile.priorities) {
    if (p === 'risk') { w.returns += 0.75; w.cushion += 1.25; w.crowd += 0.75; }
    if (p === 'steady') { w.stable += 1; w.level += 0.5; }
    if (p === 'profit') { w.profit += 2.5; }
    if (p === 'growth') { w.trend += 2.5; w.level += 0.5; }
    if (p === 'simple') { w.headroom += 1.5; w.moq += 1; }
  }
  return w;
}

const TIER_LABEL: Record<Tier, string> = { worth: 'Worth testing', care: 'Test with care', skip: 'Skip for now', out: 'Out of budget' };
const TIER_ORDER: Record<Tier, number> = { worth: 0, care: 1, skip: 2, out: 3 };

function verdictFor(p: Product, s: Stack, profile: Profile, cap: number): Verdict {
  const m = MARKETS[profile.market];
  const d = p.demand[profile.market];
  const cautious = profile.priorities.includes('risk') || profile.priorities.includes('steady');
  const v = (tier: Tier, reason: string): Verdict => ({ tier, label: TIER_LABEL[tier], reason });

  if (s.firstOrder > cap) return v('out', `first order ${money0(s.firstOrder)} is over your ${money0(cap)} limit`);
  if (s.profit <= 0) return v('skip', `loses ${money(-s.profit)} per sale after ${profile.channel === 'marketplace' ? 'fees' : 'ad costs'}`);
  if (s.profit < 3 * m.scale || s.margin < 0.12) return v('skip', `profit too thin at ${money(s.profit)} per sale`);
  if (d.trend < 0 && cautious) return v('skip', `falling demand, down ${-d.trend}% in a year`);
  if (d.shape === 'summer' && d.vol >= 0.7) return v('care', 'sells mostly in summer');
  if (d.shape === 'spike' && d.vol >= 0.7) return v('care', 'demand is a recent spike that may not last');
  if (p.returns >= 0.08) return v('care', `${pct(p.returns)} returns eat into profit`);
  if (s.profit < 5 * m.scale) return v('care', 'thin profit leaves little room for error');
  if (d.trend < 3 && d.level < 45) return v('care', `weak demand in ${theMarket(m)}`);
  if (p.crowd[profile.market] >= 80) return v('care', 'very crowded, hard to stand out');
  if (d.trend < 0) return v('care', `demand is down ${-d.trend}% in a year`);
  return v('worth', '');
}

export interface EvalOpts {
  /** Ad cost per sale to assume instead of the market estimate. */
  ad?: number;
  /** Shelf price to assume for one product. */
  price?: { id: string; value: number };
}

export function evaluate(profile: Profile, o: EvalOpts = {}): Run {
  const cap = capOf(profile);
  const w = weightsFor(profile);
  const wSum = Object.values(w).reduce((a, b) => a + b, 0);

  const results: ProductResult[] = productsIn(profile.category ?? 'pet').map((product) => {
    const stack = stackFor(product, profile, { ad: o.ad, price: o.price?.id === product.id ? o.price.value : undefined });
    const demand = product.demand[profile.market];
    const crowd = product.crowd[profile.market];
    const factors = {
      profit: clamp(stack.profit / (12 * MARKETS[profile.market].scale)),
      trend: clamp(demand.trend / 20),
      level: demand.level / 100,
      crowd: 1 - crowd / 100,
      returns: clamp(1 - product.returns / 0.1),
      stable: 1 - demand.vol,
      cushion: clamp(stack.profit / stack.ad / 1.5),
      headroom: clamp(1 - stack.firstOrder / cap),
      moq: clamp(1 - stack.moq / 600),
    };
    const score = (100 * Object.entries(factors).reduce((a, [k, f]) => a + f * w[k], 0)) / wSum;
    return {
      product, stack, demand, crowd, factors, score,
      verdict: verdictFor(product, stack, profile, cap),
      rank: null,
      needsBudget: Math.ceil(stack.firstOrder / shareOf(profile) / 100) * 100,
    };
  });

  const fits = results
    .filter((r) => r.verdict.tier !== 'out')
    .sort((a, b) =>
      TIER_ORDER[a.verdict.tier] - TIER_ORDER[b.verdict.tier] ||
      Number(a.stack.profit <= 0) - Number(b.stack.profit <= 0) ||
      b.score - a.score);
  fits.forEach((r, i) => { r.rank = i + 1; });
  const over = results.filter((r) => r.verdict.tier === 'out').sort((a, b) => a.needsBudget - b.needsBudget);

  const bestProfit = Math.max(...fits.map((r) => r.stack.profit), -Infinity);
  for (const r of fits) {
    if (r.verdict.tier !== 'worth') continue;
    const strengths: string[] = [];
    if (r.stack.profit === bestProfit) strengths.push('highest profit that fits your budget');
    if (r.demand.trend >= 10) strengths.push(`demand up ${r.demand.trend}%`);
    if (r.product.returns <= 0.03) strengths.push('few returns');
    if (r.demand.vol <= 0.2) strengths.push('sells all year');
    if (r.factors.headroom >= 0.2) strengths.push('leaves budget to spare');
    if (r.crowd <= 45) strengths.push('room to stand out');
    r.verdict.reason = strengths.slice(0, 2).join(', ') || 'solid on every check';
  }

  return { profile, cap, results: [...fits, ...over], fits, over, weights: w };
}

/* ───────────────────────── Demand over 12 months ───────────────────────── */

export const MONTH_LABELS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Twelve monthly demand index values, oldest first, ending this month. */
export function demandSeries(p: Product, market: Profile['market']): number[] {
  const d = p.demand[market];
  const end = d.level;
  const start = end / (1 + d.trend / 100);
  return MONTH_LABELS.map((month, i) => {
    const t = i / 11;
    let v = start + (end - start) * t;
    if (d.shape === 'spike') v = i < 8 ? start * (1 + 0.04 * i) : start + (end - start) * ((i - 7) / 4) ** 1.4;
    if (d.shape === 'winter') v *= ['Nov', 'Dec', 'Jan', 'Feb'].includes(month) ? 1.28 : ['Oct', 'Mar'].includes(month) ? 1.05 : 0.82;
    if (d.shape === 'summer') v *= ['Jun', 'Jul', 'Aug'].includes(month) ? 1.9 : ['May', 'Sep'].includes(month) ? 0.9 : 0.32;
    const noise = (hash(`${p.id}${market}${i}`) - 0.5) * 0.07;
    return Math.max(1, round2(v * (1 + noise)));
  });
}

export function demandNote(r: ProductResult): string {
  const d = r.demand;
  if (d.shape === 'spike') return 'a short spike';
  if (d.shape === 'summer') return 'summer only';
  if (d.shape === 'winter') return 'peaks in winter';
  if (r.crowd >= 80) return 'very crowded';
  if (d.level < 45 && d.trend < 3) return 'low volume';
  return 'steady through the year';
}

/* ───────────────────────── Reasons, risk and insights ───────────────────────── */

export interface Point { text: string; ev: Evidence; good: boolean }
export interface Explain { points: Point[]; risk: Point; insights: string[] }

export function explain(r: ProductResult, run: Run): Explain {
  const { product: p, stack: s, demand: d } = r;
  const m = MARKETS[run.profile.market];
  const adWord = run.profile.channel === 'marketplace' ? 'Ads' : 'Ad cost';
  const points: Point[] = [];

  if (s.profit > 0) {
    points.push({ good: s.profit >= 5, ev: 'estimate', text: `About ${money(s.profit)} profit per sale after every cost. That is ${pct(s.margin)} of the ${money(s.price)} price.` });
  } else {
    points.push({ good: false, ev: 'estimate', text: `Loses ${money(-s.profit)} on every sale. ${adWord} alone takes ${money(s.ad)} of a ${money(s.price)} price.` });
  }

  const where = `in ${theMarket(m)}`;
  if (d.shape === 'spike') points.push({ good: false, ev: 'estimate', text: `Demand is up ${d.trend}% ${where}, but almost all of it came in the last three months.` });
  else if (d.shape === 'summer') points.push({ good: false, ev: 'estimate', text: `About two thirds of the year's sales land in June, July and August.` });
  else if (d.shape === 'winter') points.push({ good: d.trend > 3, ev: 'estimate', text: `Demand is ${trendText(d.trend).toLowerCase()} ${where} and peaks from November to February.` });
  else if (d.trend < 0) points.push({ good: false, ev: 'estimate', text: `Demand ${where} fell ${-d.trend}% over the last 12 months.` });
  else if (d.trend < 3 && d.level < 45) points.push({ good: false, ev: 'estimate', text: `Demand ${where} is flat and small. Fewer shoppers look for it here.` });
  else if (d.trend === 0) points.push({ good: true, ev: 'estimate', text: `Demand ${where} is flat but steady through the year.` });
  else points.push({ good: true, ev: 'estimate', text: `Demand ${where} is up ${d.trend}% over 12 months and steady through the year.` });

  if (r.verdict.tier === 'out') {
    points.push({ good: false, ev: 'estimate', text: `The first order costs ${money0(s.firstOrder)}, over your ${money0(run.cap)} limit. It fits from a ${money0(r.needsBudget)} budget.` });
  } else {
    points.push({ good: true, ev: 'estimate', text: `The first order of ${s.moq} units costs ${money0(s.firstOrder)} and leaves ${money0(run.profile.budget - s.firstOrder)} for samples, ads and a buffer.` });
  }

  if (p.returns >= 0.07) points.push({ good: false, ev: 'estimate', text: `Around ${pct(p.returns)} of orders come back. Each return costs you the sale.` });
  else if (r.crowd >= 80) points.push({ good: false, ev: 'verified', text: `${p.listings} suppliers list it on Orvane, and shops are crowded with it. Hard to stand out.` });

  let risk: Point;
  if (s.profit <= 0) risk = { good: false, ev: 'estimate', text: `The numbers only work if ads cost under ${money(Math.max(0, s.breakEvenAd))} per sale. My estimate is ${money(s.ad)}.` };
  else if (d.shape === 'spike') risk = { good: false, ev: 'unknown', text: 'Nobody knows if a spike lasts. Stock ordered today lands in about six weeks.' };
  else if (d.shape === 'summer') risk = { good: false, ev: 'estimate', text: 'Order at the wrong time and stock sits for nine months.' };
  else if (p.returns >= 0.08) risk = { good: false, ev: 'estimate', text: `Returns. About 1 in ${Math.round(1 / p.returns)} units comes back, and electronics fail more often.` };
  else if (d.trend < 0) risk = { good: false, ev: 'estimate', text: 'Stock you buy now may sell slower than it does today.' };
  else if (d.trend < 3 && d.level < 45) risk = { good: false, ev: 'estimate', text: `Too few shoppers ${where} to sell ${s.moq} units quickly.` };
  else risk = { good: false, ev: 'estimate', text: `Ad cost is my biggest guess. You stay in profit until ads cost ${money(s.breakEvenAd)} per sale. My estimate is ${money(s.ad)}.` };

  const insights: string[] = [];
  if (s.profit > 0 && Number.isFinite(s.breakEvenUnits)) {
    insights.push(`You get your ${money0(s.firstOrder)} back after selling ${s.breakEvenUnits} of ${s.moq} units.`);
    const lower = stackFor(p, run.profile, { price: round2(s.price - 3), ad: s.ad });
    insights.push(`If you had to drop the price by $3, profit per sale would be ${money(lower.profit)}.`);
    insights.push(`If ads cost $2 more than I expect, profit per sale would be ${money(round2(s.profit - 2))}.`);
  } else {
    insights.push(`To break even at this price, ads would need to cost under ${money(Math.max(0, s.breakEvenAd))} per sale.`);
    const needed = round2(s.price - s.profit + 3);
    insights.push(`It would need to sell for about ${money(needed)} to earn $3 a sale. Shops sell it for ${money(s.price)}.`);
  }
  return { points: points.slice(0, 4), risk, insights };
}

/* ───────────────────────── What changed ───────────────────────── */

const profitClause = (o: ProductResult, r: ProductResult) => {
  const dp = r.stack.profit - o.stack.profit;
  if (Math.abs(dp) < 0.5) return `profit holds at ${money(r.stack.profit)}`;
  return dp > 0 ? `profit rises to ${money(r.stack.profit)}` : `profit falls to ${money(r.stack.profit)}`;
};
const demandClause = (r: ProductResult, m: Market) =>
  r.demand.trend === 0 ? 'demand is flat' : r.demand.trend > 0 ? `${m.adj} demand grew ${r.demand.trend}%` : `demand fell ${-r.demand.trend}%`;

function whyMove(kind: Diff['kind'], o: ProductResult, r: ProductResult, prev: Run, next: Run, dir: Move['dir']): string {
  const m = MARKETS[next.profile.market];
  if (dir === 'in') return `fits now, with a first order of ${money0(r.stack.firstOrder)}`;
  if (dir === 'out') return `first order ${money0(r.stack.firstOrder)} is over the new ${money0(next.cap)} limit`;
  const better = dir === 'up' || TIER_ORDER[r.verdict.tier] < TIER_ORDER[o.verdict.tier];
  if (dir === 'verdict') return `now "${r.verdict.label}"${r.verdict.reason ? `: ${r.verdict.reason}` : ''}`;
  const dp = r.stack.profit - o.stack.profit;
  const dt = r.demand.trend - o.demand.trend;

  if (kind === 'priorities') {
    const gain = Object.keys(next.weights)
      .map((k) => ({ k, dw: next.weights[k] - prev.weights[k], f: r.factors[k] }))
      .filter((x) => x.dw > 0)
      .sort((a, b) => (better ? b.f - a.f : a.f - b.f))[0];
    if (!gain) return better ? 'others dropped behind it' : 'others moved ahead of it';
    return better ? `strong on ${FACTOR_NAMES[gain.k]}` : `weaker on ${FACTOR_NAMES[gain.k]}`;
  }
  if (better) {
    if (kind === 'market' && dt > 0) return demandClause(r, m);
    if (dp > 0.5) return profitClause(o, r);
    if (TIER_ORDER[r.verdict.tier] < TIER_ORDER[o.verdict.tier]) return `now ${r.verdict.label.toLowerCase()}`;
    return 'others dropped behind it';
  }
  if (TIER_ORDER[r.verdict.tier] > TIER_ORDER[o.verdict.tier]) {
    if (r.verdict.reason.startsWith('weak demand')) return `${profitClause(o, r)}, but ${demandClause(r, m)}`;
    return r.verdict.reason;
  }
  if (dp < -0.5) return profitClause(o, r);
  if (kind === 'market' && dt < 0) return demandClause(r, m);
  return 'others moved ahead of it';
}

export function diffRuns(prev: Run, next: Run): Diff {
  const a = prev.profile;
  const b = next.profile;
  const kinds: Diff['kind'][] = [];
  if (a.market !== b.market) kinds.push('market');
  if (a.budget !== b.budget || capOf(a) !== capOf(b)) kinds.push('budget');
  if (a.channel !== b.channel) kinds.push('channel');
  if (a.priorities.join() !== b.priorities.join()) kinds.push('priorities');
  const kind: Diff['kind'] = kinds.length === 1 ? kinds[0] : 'mixed';
  const before = new Map(prev.results.map((r) => [r.product.id, r]));

  let moves: Move[] = [];
  for (const r of next.results) {
    const o = before.get(r.product.id)!;
    if (o.rank === r.rank && o.verdict.tier === r.verdict.tier) continue;
    const dir: Move['dir'] =
      o.rank === null && r.rank !== null ? 'in' :
      o.rank !== null && r.rank === null ? 'out' :
      r.rank! < o.rank! ? 'up' : r.rank! > o.rank! ? 'down' : 'verdict';
    moves.push({
      id: r.product.id, name: r.product.short, from: o.rank, to: r.rank,
      tierFrom: o.verdict.tier, tierTo: r.verdict.tier, dir,
      why: whyMove(kind, o, r, prev, next, dir),
    });
  }
  if (kind === 'budget') {
    const entered = moves.filter((x) => x.dir === 'in' || x.dir === 'out');
    if (entered.length) moves = entered;
  }
  moves.sort((x, y) => (x.to ?? 99) - (y.to ?? 99) || (x.from ?? 99) - (y.from ?? 99));
  if (!next.fits.length) moves = [];

  const top0 = prev.fits[0];
  const top1 = next.fits[0];
  const m = MARKETS[b.market];
  const subject =
    kind === 'market' ? m.name :
    kind === 'budget' ? (a.budget === b.budget ? `Putting ${pct(shareOf(b))} on stock` : `A ${money0(b.budget)} budget`) :
    kind === 'channel' ? (b.channel === 'marketplace' ? 'Selling on a marketplace' : 'Selling through your own store') :
    kind === 'priorities' ? 'Your new priorities' : 'That';

  let headline: string;
  if (!top1) headline = `Nothing fits ${money0(b.budget)} yet.`;
  else if (!top0) headline = `${next.fits.length} ${next.fits.length === 1 ? 'product fits' : 'products fit'} now. The ${top1.product.short} leads.`;
  else if (top0.product.id !== top1.product.id) headline = `${subject} changes the order. The ${top1.product.short} is now first.`;
  else if (kind === 'budget' && moves.some((x) => x.dir === 'in')) {
    const n = moves.filter((x) => x.dir === 'in').length;
    headline = `${a.budget === b.budget ? `With ${pct(shareOf(b))} on stock` : `With ${money0(b.budget)}`}, ${n} more ${n === 1 ? 'product fits' : 'products fit'}. The ${top1.product.short} stays first.`;
  } else if (kind === 'budget' && moves.some((x) => x.dir === 'out')) {
    const n = moves.filter((x) => x.dir === 'out').length;
    headline = `${a.budget === b.budget ? `With ${pct(shareOf(b))} on stock` : `With ${money0(b.budget)}`}, ${n} ${n === 1 ? 'product no longer fits' : 'products no longer fit'}.`;
  } else if (moves.length) headline = `${subject} keeps the ${top1.product.short} first, but the order below it moves.`;
  else headline = `The order stays the same. The ${top1.product.short} is still first.`;

  const notes: string[] = [];
  const ref = top0 ?? top1;
  if (ref && kinds.includes('market')) {
    const s0 = stackFor(ref.product, a);
    const s1 = stackFor(ref.product, b);
    if (s0.duty !== s1.duty) notes.push(`Duty on the ${ref.product.short} ${s1.duty < s0.duty ? 'falls' : 'rises'} from ${money(s0.duty)} to ${money(s1.duty)} per unit.`);
    const v0 = MARKETS[a.market].vat;
    if (m.vat > 0 && v0 === 0) notes.push(`${pct(m.vat)} sales tax now sits inside the shelf price.`);
    else if (m.vat === 0 && v0 > 0) notes.push('No sales tax sits inside the shelf price.');
    else if (m.vat !== v0) notes.push(`Sales tax inside the price is ${pct(m.vat)}.`);
  }
  if (kinds.includes('budget')) notes.push(`Your first order limit is now ${money0(next.cap)}, ${pct(shareOf(b))} of the budget.`);
  if (!next.fits.length && next.over[0]) notes.push(`The smallest first order is ${money0(next.over[0].stack.firstOrder)} for the ${next.over[0].product.short}. It fits from a ${money0(next.over[0].needsBudget)} budget.`);
  if (ref && kinds.includes('channel')) {
    const s1 = stackFor(ref.product, b);
    notes.push(b.channel === 'marketplace'
      ? `A 15% marketplace fee replaces card fees, and ads drop to about ${money(s1.ad)} per sale.`
      : `Card fees replace the marketplace fee, and ads rise to about ${money(s1.ad)} per sale.`);
    notes.push(`The ${ref.product.short} now makes ${money(s1.profit)} per sale.`);
  }
  if (kinds.includes('priorities') && b.priorities.length) notes.push(`I now weigh ${list(b.priorities.map((p) => PRIORITIES[p].name.toLowerCase()))} most.`);

  return { kind, headline, moves: moves.slice(0, 5), notes, changed: moves.length > 0 };
}

/* ───────────────────────── Suppliers ───────────────────────── */

const round05 = (n: number) => Math.round(n * 20 + 1e-7) / 20;
const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);
const NOW = { y: 2026, m: 11 };
const monthsSince = (ym: string) => (NOW.y - Number(ym.slice(0, 4))) * 12 + (NOW.m - Number(ym.slice(5, 7)));

const SUP_LABEL: Record<SupTier, string> = { shortlist: 'Shortlist', ask: 'Ask first', out: 'Out of budget', avoid: 'Avoid' };
const SUP_ORDER: Record<SupTier, number> = { shortlist: 0, ask: 1, out: 2, avoid: 3 };

export function evaluateSuppliers(productId: string, profile: Profile, change?: { id: string; patch: Partial<Supplier> }): SupRun {
  const product = productById(productId) ?? PRODUCTS[0];
  const cap = capOf(profile);
  const m = MARKETS[profile.market];
  const list = change ? SUPPLIERS.map((s) => (s.id === change.id ? { ...s, ...change.patch } : s)) : SUPPLIERS;
  // Only suppliers that make this kind of product.
  const priced = list.filter((s) => s.category === product.category).map((s) => ({ s, unit: round05(product.cost * s.priceK), moq: round50(product.moq * s.moqK) }));
  const sorted = priced.map((x) => x.unit).sort((x, y) => x - y);
  const mid = sorted.length / 2;
  const medianUnit = round2(sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2);

  const results: SupplierResult[] = priced.map(({ s, unit, moq }) => {
    const stack = stackFor(product, profile, { cost: unit, ship: product.ship + s.shipAdd, origin: s.origin, moq });
    const flags: string[] = [];
    if (s.offPlatform) flags.push('Asks buyers to pay outside Orvane, where you have no protection');
    if (unit < medianUnit * 0.8) flags.push(`Price is ${pct(1 - unit / medianUnit)} below the typical quote, a common warning sign`);
    if (s.type === 'Trading company') flags.push('A trading company: it resells from factories it does not run');
    if (s.type === 'Unclear') flags.push('Does not say whether it is a factory or a reseller');
    if (!s.audit) flags.push('No factory audit on record');
    if (s.years < 1) flags.push('Joined Orvane less than a year ago');

    let tier: SupTier = 'shortlist';
    let reason = '';
    if (s.offPlatform) { tier = 'avoid'; reason = 'asks for payment outside Orvane'; }
    else if (stack.firstOrder > cap) { tier = 'out'; reason = `first order ${money0(stack.firstOrder)} is over your ${money0(cap)} limit`; }
    else if (!s.audit) { tier = 'ask'; reason = s.type === 'Trading company' ? 'a reseller with no factory audit' : 'no factory audit on record'; }

    const auditF = !s.audit ? 0 : monthsSince(s.audit) <= 12 ? 1 : monthsSince(s.audit) <= 30 ? 0.7 : 0.35;
    const score = (100 * (
      clamp(stack.profit / 12) * 2 + auditF * 2 + clamp(((s.onTime ?? 0.85) - 0.85) / 0.15) * 1.5 +
      clamp(Math.log10(s.orders + 1) / 3) + clamp(1 - s.replyHrs / 48) * 0.5 + clamp(1 - stack.firstOrder / cap) * 2.5
    )) / 9.5;
    return { supplier: s, unit, moq, stack, score, tier, label: SUP_LABEL[tier], reason, rank: 0, flags };
  });

  results.sort((x, y) => SUP_ORDER[x.tier] - SUP_ORDER[y.tier] || y.score - x.score);
  results.forEach((r, i) => { r.rank = i + 1; });
  const shortlist = results.filter((r) => r.tier === 'shortlist');

  if (shortlist.length) {
    const minFirst = Math.min(...shortlist.map((r) => r.stack.firstOrder));
    const maxProfit = Math.max(...shortlist.map((r) => r.stack.profit));
    const newest = Math.min(...shortlist.map((r) => monthsSince(r.supplier.audit!)));
    const used = new Set<string>();
    for (const r of shortlist) {
      const options: [string, string][] = [];
      if (r.stack.profit === maxProfit) options.push(['profit', 'best profit per sale']);
      if (r.stack.firstOrder === minFirst) options.push(['first', 'smallest first order']);
      if (m.duty[r.supplier.origin] < m.duty.CN) options.push(['duty', `lower ${m.short} duty`]);
      if (monthsSince(r.supplier.audit!) === newest) options.push(['audit', `audited ${monthLabel(r.supplier.audit!)}`]);
      options.push(['orders', `${r.supplier.orders} orders completed`]);
      const pick = options.filter(([k]) => !used.has(k)).slice(0, r.rank === 1 ? 2 : 1);
      pick.forEach(([k]) => used.add(k));
      r.reason = pick.map(([, t]) => t).join(', ');
    }
  }
  return { product, profile, cap, results, shortlist, medianUnit };
}

/**
 * The honest way up for a supplier held back only by a missing factory audit:
 * where it would rank if it booked an Orvane Verified audit and passed. Worked
 * out by re-running the same ranking, not estimated. Only for manufacturers,
 * since a reseller has no factory of its own to audit.
 */
export function auditPath(r: SupplierResult, run: SupRun): { rank: number; tier: SupTier } | null {
  const s = r.supplier;
  if (s.audit || s.type !== 'Manufacturer' || r.tier !== 'ask') return null;
  const month = `${NOW.y}-${String(NOW.m).padStart(2, '0')}`;
  const next = evaluateSuppliers(run.product.id, run.profile, { id: s.id, patch: { audit: month } });
  const after = next.results.find((x) => x.supplier.id === s.id)!;
  return { rank: after.rank, tier: after.tier };
}

export interface Fact { label: string; value: string; ev: Evidence }

export function supplierFacts(r: SupplierResult, run: SupRun): Fact[] {
  const s = r.supplier;
  const m = MARKETS[run.profile.market];
  return [
    { label: 'Business licence', value: 'Checked by Orvane', ev: 'verified' },
    { label: 'Factory audit', value: s.audit ? `Passed ${monthLabel(s.audit)}, Orvane Verified` : 'None on record', ev: s.audit ? 'verified' : 'unknown' },
    { label: 'Orders on Orvane', value: `${s.orders} completed`, ev: 'verified' },
    { label: 'Delivered on time', value: s.onTime ? pct(s.onTime) : 'Too few orders to say', ev: s.onTime ? 'verified' : 'unknown' },
    { label: 'Time on Orvane', value: s.years < 1 ? `${Math.round(s.years * 12)} months` : `${s.years} years`, ev: 'verified' },
    { label: 'Usual reply time', value: s.replyHrs <= 1 ? 'Within an hour' : `About ${s.replyHrs} hours`, ev: 'verified' },
    { label: 'Ships from', value: `${s.city}, ${ORIGIN_NAME[s.origin]}`, ev: 'verified' },
    { label: `${m.short} import duty`, value: `${pct(m.duty[s.origin], m.duty[s.origin] * 100 % 1 ? 1 : 0)}, ${money(r.stack.duty)} per unit`, ev: 'estimate' },
    { label: 'Production time', value: `${s.lead} days, by its own account`, ev: 'estimate' },
    { label: 'Product quality', value: 'Unknown until samples arrive', ev: 'unknown' },
  ];
}

export function diffSuppliers(prev: SupRun, next: SupRun): string[] {
  const before = new Map(prev.results.map((r) => [r.supplier.id, r]));
  const out: string[] = [];
  for (const r of next.results) {
    const o = before.get(r.supplier.id)!;
    if (o.tier !== r.tier) out.push(`${r.supplier.short} is now "${r.label}"${r.reason ? `: ${r.reason}` : ''}.`);
  }
  return out;
}

/* ───────────────────────── Quotes and samples ───────────────────────── */

export function quotesFor(productId: string, profile: Profile, ids: string[]): Quote[] {
  const run = evaluateSuppliers(productId, profile);
  return ids
    .map((id) => run.results.find((r) => r.supplier.id === id))
    .filter((r): r is SupplierResult => Boolean(r))
    .map((r) => {
      const s = r.supplier;
      const unit = round05(r.unit * s.quote.k);
      const stack = stackFor(run.product, profile, { cost: unit, ship: run.product.ship + s.shipAdd, origin: s.origin, moq: r.moq });
      return {
        supplier: s, listed: r.unit, unit, moq: r.moq, stack,
        day: s.quote.day, followUp: s.quote.followUp, note: s.quote.note,
        sampleCost: s.sample.price + s.sample.ship, delta: round2(unit - r.unit),
      };
    });
}

/** Two suppliers worth sampling: the best profit, then the smallest first order among the rest. */
export function pickSamples(quotes: Quote[]): Quote[] {
  if (quotes.length <= 2) return quotes;
  const best = [...quotes].sort((a, b) => b.stack.profit - a.stack.profit)[0];
  const light = quotes.filter((q) => q !== best).sort((a, b) => a.stack.firstOrder - b.stack.firstOrder)[0];
  return [best, light];
}

/* ───────────────────────── Every category at once ───────────────────────── */

export interface CategoryView {
  id: CategoryId;
  run: Run;
  /** The product Scout would test first in this category, if any fits and is worth it. */
  lead: ProductResult | null;
  worth: number;
}

/**
 * Each category judged for the same brief, with Scout's pick: the category
 * whose best product scores highest for the seller's priorities. The same
 * ranking that orders products inside a category decides between them.
 */
export function compareCategories(profile: Profile): { views: CategoryView[]; best: CategoryId } {
  const views = CATEGORY_ORDER.map((id) => {
    const run = evaluate({ ...profile, category: id });
    const lead = run.fits.find((r) => r.verdict.tier !== 'skip') ?? null;
    return { id, run, lead, worth: run.fits.filter((r) => r.verdict.tier === 'worth').length };
  });
  const tierRank = { worth: 0, care: 1, skip: 2, out: 3 } as const;
  const ranked = [...views].filter((v) => v.lead).sort((a, b) => tierRank[a.lead!.verdict.tier] - tierRank[b.lead!.verdict.tier] || b.lead!.score - a.lead!.score);
  return { views, best: ranked[0]?.id ?? 'pet' };
}

/* ───────────────────────── Every market at once ───────────────────────── */

export interface MarketView {
  market: Market;
  run: Run;
  /** The product Scout would test first here, if any fits. */
  lead: ProductResult | null;
  worth: number;
}

export interface MarketCompare {
  views: MarketView[];
  /** Scout's pick for this budget, sales channel and priorities, or null when nothing is worth testing anywhere. */
  best: MarketView | null;
  why: string;
}

/**
 * Runs the same brief in every market. Scout's pick is the market with the
 * most products worth testing; a tie goes to the one whose leading product
 * earns more per sale, relative to prices there.
 */
export function compareMarkets(profile: Profile, ids: MarketId[]): MarketCompare {
  const views: MarketView[] = ids.map((id) => {
    const run = evaluate({ ...profile, market: id });
    const lead = run.fits.find((r) => r.verdict.tier !== 'skip') ?? null;
    return { market: MARKETS[id], run, lead, worth: run.fits.filter((r) => r.verdict.tier === 'worth').length };
  });
  const rel = (v: MarketView) => (v.lead ? v.lead.stack.profit / v.market.scale : -Infinity);
  const ranked = views.filter((v) => v.worth > 0).sort((a, b) => b.worth - a.worth || rel(b) - rel(a));
  const best = ranked[0] ?? null;
  let why = '';
  if (best?.lead) {
    const others = views.filter((v) => v !== best);
    const most = others.every((v) => v.worth < best.worth);
    why = `${most ? `the most products worth testing (${best.worth})` : `${best.worth} worth testing, like ${list(others.filter((v) => v.worth === best.worth).map((v) => v.market.the))}, and a stronger leader`}. The ${best.lead.product.short} leads there at about ${money(best.lead.stack.profit)} per sale`;
  }
  return { views, best, why };
}
