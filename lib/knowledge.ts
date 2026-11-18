import type { Chip, Ctx, Reply } from './acts';
import { CATEGORY_META, MARKETS, productById } from './data';
import { evaluate, evaluateSuppliers, pickSamples, quotesFor } from './engine';
import { list, money, money0, pct, trendText } from './format';
import { PROMOTION_EXPLAINED, auditNote } from './promotion';
import { FREIGHT_DAYS, SAMPLE_DAYS, checkPoints } from './samples';
import type { MarketId, Product, ProductResult, Quote, Run } from './types';

/**
 * What Scout knows about the whole sourcing journey, beyond its own numbers:
 * selling rules, shipping, paying safely, protecting an order, and life after launch.
 *
 * Every answer here is worked out from the seller's own brief, product and
 * suppliers, ends with one thing they can do next where there is one, and says
 * plainly when Scout can't do something yet.
 */

/* ───────────────────────── Selling rules ───────────────────────── */

type Flag = 'food' | 'mouth' | 'battery' | 'wireless' | 'electric' | 'foam';
const FLAGS: Record<string, Flag[]> = {
  'travel-set': ['mouth'], 'slow-feeder': ['mouth'], 'lick-mat': ['mouth'],
  'led-collar': ['battery', 'electric'],
  'herb-keeper': ['food'], 'silicone-lids': ['food'], 'spice-jars': ['food'], 'oil-sprayer': ['food'], 'mixing-bowls': ['food'],
  'yoga-mat': ['foam'], 'foam-roller': ['foam'],
  'charging-stand': ['wireless', 'electric'], 'ring-light': ['battery', 'electric'],
};

export interface Rule { name: string; why: string; askSupplier?: string }

/** The papers a product needs before it can be sold in a market. Plain words, no legal detail. */
export function rulesFor(product: Product, market: MarketId): Rule[] {
  const f = FLAGS[product.id] ?? [];
  const out: Rule[] = [];
  const eu = market === 'DE';
  const uk = market === 'UK';
  if (f.includes('food')) {
    out.push({
      name: market === 'US' ? 'Food-contact test report (FDA rules)' : eu ? 'Food-contact test report (LFGB)' : uk ? 'Food-contact test report (UK rules)' : 'Food-contact test report',
      why: 'it touches food, so you must show the material is safe',
      askSupplier: 'a food-contact test report',
    });
  }
  if (f.includes('mouth')) {
    out.push({ name: 'Food-safe material report', why: "pets eat and drink from it. It isn't always required by law, but marketplaces and buyers ask for it", askSupplier: 'a food-safe test report for the silicone' });
  }
  if (f.includes('wireless')) {
    out.push({
      name: market === 'US' ? 'FCC approval' : eu ? 'CE mark (radio rules)' : uk ? 'UKCA or CE mark' : market === 'BD' ? 'BTRC approval' : 'Radio approval',
      why: 'it sends out a wireless signal',
      askSupplier: market === 'US' ? 'its FCC ID' : 'its radio test certificate',
    });
  } else if (f.includes('electric')) {
    out.push({
      name: market === 'US' ? 'FCC declaration' : eu ? 'CE mark' : uk ? 'UKCA or CE mark' : 'Electrical safety papers',
      why: 'it has electronics inside',
      askSupplier: market === 'US' ? 'an FCC test report' : 'a CE test report',
    });
  }
  if (f.includes('battery')) {
    out.push({ name: 'Battery shipping test (UN38.3)', why: 'lithium batteries need it before they can go on a ship or plane', askSupplier: 'the UN38.3 battery test summary' });
  }
  if (f.includes('foam') && market === 'US') {
    out.push({ name: 'California warning label (Prop 65)', why: 'some foam and plastic mats need one to be sold to California buyers', askSupplier: 'a material test for Prop 65 chemicals' });
  }
  if (eu) {
    out.push({ name: 'Packaging registration (LUCID)', why: 'everyone selling packaged goods to German shoppers must register' });
    out.push({ name: 'An EU contact person', why: 'sellers outside the EU need someone in the EU named on the product for safety questions' });
    if (f.includes('electric')) out.push({ name: 'Electronics recycling registration (WEEE)', why: 'Germany requires it for anything with a plug or battery' });
  }
  return out;
}

/** What Scout asks a supplier for, in its quote message, so the papers arrive with the price. */
export const paperAsk = (product: Product, market: MarketId) => list(rulesFor(product, market).map((r) => r.askSupplier).filter((x): x is string => Boolean(x)));

/** A rule's name as it reads inside a sentence: "a food-safe material report", "FCC approval". */
export function inSentence(name: string): string {
  if (/^An? /.test(name)) return name.replace(/^A/, 'a');
  const low = /^[A-Z](?=[a-z])/.test(name) && !/^California/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
  return /(report|test|label|mark|person)\b/.test(name) && !/^(FCC|BTRC)/.test(name) ? `a ${low}` : low;
}

/** One line for the product drawer. */
export function rulesLine(product: Product, market: MarketId): string {
  const r = rulesFor(product, market);
  if (!r.length) return 'No special papers or certificates for this product, as far as I know.';
  return `${list(r.map((x) => x.name))}.`;
}

/* ───────────────────────── Helpers ───────────────────────── */

const ask = (label: string, text = label): Chip => ({ label, act: { t: 'ask', text } });
const AFTER = ['done', 'check', 'order', 'ordered'];
const AFTER_QUOTES = ['quotes', 'decision', ...AFTER];

function quotesOf(ctx: Ctx): Quote[] {
  if (!ctx.productId || !ctx.quotesReady) return [];
  return quotesFor(ctx.productId, ctx.profile, ctx.contacted);
}
/** The quotes being sampled, or the two Scout would sample. */
function picksOf(ctx: Ctx): Quote[] {
  const qs = quotesOf(ctx);
  const picked = qs.filter((q) => ctx.sampleIds.includes(q.supplier.id));
  return picked.length ? picked : pickSamples(qs);
}
/** The supplier the first order most likely goes to. */
const lead = (ctx: Ctx) => [...picksOf(ctx)].sort((a, b) => b.stack.profit - a.stack.profit)[0] ?? null;
const days = (q: Quote) => 2 + q.supplier.lead + FREIGHT_DAYS.sea + FREIGHT_DAYS.customs;

/* ───────────────────────── The answers ───────────────────────── */

type Handler = { re: RegExp; skip?: RegExp; when?: (ctx: Ctx) => boolean; say: (ctx: Ctx, run: Run, r: ProductResult, text: string) => Reply | null };

const H: Handler[] = [
  /* ── Getting to know Scout ── */
  {
    re: /without (asking|my (ok|okay|approval|permission|say))|(on (your|its) own|automatically)\b.*\b(send|pay|order|buy|spend)|(send|pay|order|buy|spend)\b.*\b(on (your|its) own|automatically|without)|will you (send|pay|order|buy|spend|message|contact)\b|can you (pay|spend|buy) (for me|anything)|(just )?pay (the supplier|them) for me/,
    say: (ctx) => ({
      text: `No. I prepare everything and you approve it. Three things always wait for your tap:\n\n- Sending a message to suppliers\n- Paying for samples\n- Placing the order\n\n**Run it for me** works the same way. It does the research and stops at each of those.`,
      chips: ctx.stage === 'ordered' ? undefined : [{ label: ctx.stage === 'start' ? 'Run it for me' : 'Run the rest for me', act: { t: 'auto' } }],
    }),
  },
  {
    re: /which (numbers|figures|ones?) (are|is) (checked|verified|real|guess|estimates?)|how (sure|confident|accurate|reliable) (are|is) (you|your|these|the numbers)|(are|is) (these|your|the) numbers? (real|accurate|right|correct)|what('s| is| are) (a |your )?guess(es|ed)?\b/,
    say: (ctx, _run, r) => ({
      text: `For the ${r.product.short}:\n\n- **Checked by Orvane:** the supplier's listed price, their order count and on-time record, and their business licence\n- **My estimates:** the shelf price, shipping, duty, ads per sale, returns and demand\n- **Nobody knows yet:** the quality, until a sample arrives\n\nAds are my biggest guess. The ${r.product.short} stays in profit until ads cost ${money(r.stack.breakEvenAd)} a sale, against my ${money(r.stack.ad)}.`,
      chips: [{ label: 'See the maths', act: { t: 'open', id: r.product.id, maths: true } }],
    }),
  },
  {
    re: /(need|have) (any |some |much )?(experience|knowledge)|(i'?m|i am|am i) (too )?(new|a beginner)\b.*\b(ok|okay|fine|use|this)|no experience/,
    say: (ctx) => ({
      text: `No experience needed. I explain trade words as they come up, keep more money back on a first launch (${ctx.profile.experience === 'existing' ? 'tell me if you want that' : 'up to 70% of your budget goes on stock'}), and nothing is sent or paid without your tap.`,
      chips: ctx.profile.experience === 'existing' ? undefined : [{ label: "I've sold before", act: { t: 'profile', patch: { experience: 'existing' } } }],
    }),
  },

  /* ── Market and category ── */
  {
    re: /(is|are) (this|the|my|pet|kitchen|fitness|home fitness|phone)? ?(category|market|niche|supplies|accessories) (growing|shrinking|dying|declining|getting bigger|getting smaller)|(category|market|niche) (growing|shrinking|dying)/,
    say: (ctx, run) => {
      const cat = CATEGORY_META[ctx.profile.category ?? 'pet'];
      const rs = run.results;
      const avg = Math.round(rs.reduce((a, x) => a + x.demand.trend, 0) / rs.length);
      const up = rs.filter((x) => x.demand.trend > 0).length;
      const best = [...rs].sort((a, b) => b.demand.trend - a.demand.trend)[0];
      return {
        text: `${cat.name} in ${MARKETS[ctx.profile.market].the} is **${avg >= 0 ? 'growing' : 'shrinking'}**: across the ${rs.length} products I track, demand is ${trendText(avg).toLowerCase()} over 12 months on average, and ${up} of ${rs.length} are rising. The fastest is the ${best.product.short} (${trendText(best.demand.trend).toLowerCase()}).`,
        chips: [{ label: 'Compare categories', act: { t: 'category' } }],
      };
    },
  },
  {
    re: /(amazon|marketplace|etsy)\b.*\bor\b.*\b(own|my|shopify|website|store)|(own|my|shopify|website)\b.*\bor\b.*\b(amazon|marketplace)|which (sales )?channel|where should i sell/,
    say: (ctx, _run, r) => {
      const other = ctx.profile.channel === 'marketplace' ? 'own' : 'marketplace';
      const alt = evaluate({ ...ctx.profile, channel: other }).results.find((x) => x.product.id === r.product.id);
      if (!alt) return null;
      const mk = other === 'marketplace' ? alt : r;
      const own = other === 'marketplace' ? r : alt;
      const better = mk.stack.profit > own.stack.profit ? 'a marketplace' : 'your own store';
      return {
        text: `For the ${r.product.short}:\n\n- **Marketplace:** ${money(mk.stack.profit)} a sale. The fee is higher, but ads are cheaper (about ${money(mk.stack.ad)}) because shoppers are already there.\n- **Own store:** ${money(own.stack.profit)} a sale. Ads cost more (about ${money(own.stack.ad)}), but the customers are yours to sell to again.\n\nOn the numbers, ${better} earns more. For a first product I'd lean to a marketplace: it's quicker to get first sales and reviews.`,
        chips: [{ label: other === 'marketplace' ? 'Switch to a marketplace' : 'Switch to my own store', act: { t: 'profile', patch: { channel: other } } }],
      };
    },
  },

  /* ── Product ideas and demand ── */
  {
    re: /\b(link|url|photo|picture|image|screenshot)\b|found (this|a|it|one|something)\b.*\b(on|at) (amazon|alibaba|tiktok|temu|aliexpress|instagram|etsy)|can you find (it|this|that|the same)/,
    say: () => ({
      text: "I can't open links or photos yet. Tell me what the product is in a few words, like \"silicone dog bowl\", and I'll check if I have it and what it would earn.",
      chips: [{ label: 'Show me all categories', act: { t: 'category' } }],
    }),
  },
  {
    re: /(trend|fad)\b.*\b(fade|last|die|end|over|pass)|\b(a|just a|only a) (fad|passing trend)|will (it|this|demand|that) (last|keep (selling|going)|stay)/,
    say: (_ctx, _run, r) => {
      const d = r.demand;
      const fad = d.shape === 'spike' || d.trend >= 60;
      return {
        text: fad
          ? `It could be. Demand for the ${r.product.short} is ${trendText(d.trend).toLowerCase()} in a year${d.shape === 'spike' ? ', and most of it came in one short burst' : ''}. Fast rises often fall just as fast. If you try it, keep the first order to the minimum and reorder only on real sales.`
          : `I don't think so. Demand for the ${r.product.short} is ${trendText(d.trend).toLowerCase()} over 12 months and ${d.shape === 'steady' ? 'spread evenly through the year' : 'follows a normal season'}. That looks like a lasting need, not a craze.`,
        chips: [{ label: 'See the 12-month chart', act: { t: 'open', id: r.product.id, maths: true } }],
      };
    },
  },
  {
    re: /\bseason(al)?\b|all (year|year round)|year[- ]round|only in (summer|winter|one season)|christmas|holiday (season|sales)/,
    say: (_ctx, _run, r) => {
      const s = r.demand.shape;
      const text = s === 'summer' ? `The ${r.product.short} is a **summer product**. Most sales come in the warm months, so order by early spring or you'll be holding stock all winter.`
        : s === 'winter' ? `The ${r.product.short} **peaks in winter**. Order by late summer so it lands before the rush.`
        : s === 'spike' ? `The ${r.product.short} sold in **one short burst**, not through a season. That's harder to plan for than either.`
        : `The ${r.product.short} **sells all year**. Its busiest month is only a little above its quietest, so you can order any time.`;
      return { text, chips: [{ label: 'See the 12-month chart', act: { t: 'open', id: r.product.id, maths: true } }] };
    },
  },
  {
    re: /stand out|differentiat|improve (it|this|the product|on it)|make it better|better version|private label|(my|our) own (brand|logo|label|packaging)|custom(i[sz]e[ds]?)? (it|logo|packaging|colou?r|design)|(add|put) (my|a) logo/,
    say: (ctx, _run, r) => {
      const crowded = r.crowd >= 60;
      return {
        text: `${crowded ? `Yes, and you'll need to: the ${r.product.short} scores ${Math.round(r.crowd)} of 100 for crowding.` : `You can, though the ${r.product.short} isn't very crowded (${Math.round(r.crowd)} of 100).`} The cheapest ways, from cheapest up:\n\n- **Your logo** on the product or box, usually $0.10 to $0.20 a unit more\n- **Your own colour**, often free at the minimum order\n- **A bundle**, like adding a cleaning cloth or a second size\n- **A new shape**, which needs a new mould and usually costs $1,000 or more\n\nFix the most common complaint in competitors' reviews first. That beats a logo every time.`,
        chips: ['suppliers', 'opportunities'].includes(ctx.stage) ? [ask('What do buyers complain about?', `What are the main risks with the ${r.product.short}?`)] : undefined,
      };
    },
  },

  /* ── Profit ── */
  {
    skip: /\bif\b|\d|month|week|year/,
    re: /how much (will|would|do|can) i (really |actually )?(make|earn|keep|profit)\b|what (will|would|do) i (really |actually )?(make|earn|keep) (on|per|from|for) (each|a|one|every)|real profit|actual profit/,
    say: (ctx, _run, r) => {
      const s = r.stack;
      if (s.profit <= 0) return { text: `On the ${r.product.short} you'd lose ${money(-s.profit)} on every sale after all costs. I'd skip it.` };
      return {
        text: `About **${money(s.profit)} a sale** on the ${r.product.short}, after every cost: the product, shipping, duty, ${ctx.profile.channel === 'marketplace' ? 'marketplace fees' : 'card fees'}, ads and returns. That's ${pct(s.margin)} of the ${money(s.price)} price. If you sell all ${s.moq} units, that's about ${money0(s.profit * s.moq)} profit on the first order.`,
        chips: [{ label: 'See the maths', act: { t: 'open', id: r.product.id, maths: true } }],
      };
    },
  },

  /* ── Risk and rules ── */
  {
    re: /certific|safety (paper|test|standard|rule|mark)|regulat|complian|legal to (sell|import)|(allowed|permitted) to (sell|import)|\b(fda|fcc|lfgb|ukca|weee|prop 65)\b|\bce (mark|certif)|(papers?|documents?|paperwork|licen[cs]e) (do i|to|for|needed|i need)|test reports?|what (papers|documents|paperwork)|is (this|it) legal/,
    say: (ctx, _run, r) => {
      const m = MARKETS[ctx.profile.market];
      const rules = rulesFor(r.product, ctx.profile.market);
      if (ctx.profile.market === 'BD' && !rules.length) return { text: `I don't have import rules for Bangladesh yet. For the ${r.product.short} I know of nothing special, but a C&F agent at the port can confirm before you order.` };
      if (!rules.length) return { text: `The ${r.product.short} needs **no special papers** to sell in ${m.the}, as far as I know. Normal labelling applies: where it was made, and your business name on the box.` };
      const asked = rules.filter((x) => x.askSupplier);
      return {
        text: `To sell the ${r.product.short} in ${m.the} you'll need:\n\n${rules.map((x) => `- **${x.name}**: ${x.why}`).join('\n')}\n\n${asked.length ? `Good suppliers already have ${asked.length === 1 ? 'this' : 'most of these'}. ${ctx.contacted.length ? 'My quote request asked' : 'When I ask suppliers for quotes, I ask'} for ${paperAsk(r.product, ctx.profile.market)}, so you'll know before you pay for samples.` : 'These are on you, not the supplier.'} Rules change, so have a customs broker confirm before the first order.`,
      };
    },
  },
  {
    re: /\bcopy(ing)?\b|patent|trademark|counterfeit|knock[- ]?off|replica|\bdupe\b|intellectual property|infring|(get|be) sued|brand (name|logo) (on|of)/,
    say: (ctx, _run, r, text) => {
      const office = ({ US: 'the USPTO trademark search', DE: 'the EUIPO and DPMA searches', UK: 'the UK IPO trademark search', BD: 'the DPDT trademark search' } as Record<string, string>)[ctx.profile.market] ?? 'the national trademark search';
      if (/exact(ly)?|identical|same (logo|brand|name)|copy (a|the|their|this) brand/.test(text)) return { text: "I won't help copy a brand or someone's exact design. It's the quickest way to have your listing removed and your stock seized. I can help you make your own version: same need, your own look." };
      return {
        text: `A plain ${r.product.short.toLowerCase()} is a common product, so selling one is fine. Sellers get into trouble in three ways:\n\n- Using **someone else's brand name or logo**\n- Copying a **patented design**, often a clever shape or mechanism\n- Using **photos or text** from another seller's listing\n\nBefore you order, search the product on Google Patents and ${office}. It takes ten minutes. I won't help copy a brand, but I can help you make your own version.`,
      };
    },
  },
  {
    re: /(allowed|restricted|banned|approval|gated|ungated|permitted)\b.*\b(amazon|marketplace|ebay|etsy)|(amazon|marketplace)\b.*\b(allow|restrict|ban|approv|gated)/,
    say: (_ctx, _run, r) => {
      const f = FLAGS[r.product.id] ?? [];
      const extra = f.includes('battery') || f.includes('wireless') ? ' Because it has a battery or wireless parts, Amazon will ask for its test papers before you can list it.' : f.includes('food') || f.includes('mouth') ? ' Because it touches food, Amazon may ask for a food-safe test report.' : '';
      return { text: `The ${r.product.short} isn't in a restricted Amazon category, so you can usually list it straight away.${extra} Amazon's rules change, so check the category before you list.` };
    },
  },
  {
    re: /(send|sent|bring|come) (it |them )?back|return rate|(many|lot of|lots of|how many) returns|returned a lot/,
    say: (ctx, _run, r) => {
      const cat = CATEGORY_META[ctx.profile.category ?? 'pet'];
      const high = r.product.returns >= 0.08;
      return { text: `About **${pct(r.product.returns)}** of ${r.product.short} orders come back. I take ${money(r.stack.returns)} off every sale to cover it. ${high ? `That's high for ${cat.lower}, which is why I flag it.` : `That's low for ${cat.lower}.`}` };
    },
  },
  {
    re: /change your mind|what would (make|change|stop)|when would you (stop|drop|not|walk)|deal[- ]?breaker|walk away|red flags?\b.*\b(product|this)/,
    say: (_ctx, _run, r) => ({
      text: `I'd stop recommending the ${r.product.short} if any of these happen:\n\n- **Ads cost more than ${money(r.stack.breakEvenAd)} a sale.** Above that, every sale loses money.\n- **Both samples fail** on something that matters.\n- **A supplier asks to be paid outside Orvane.**\n- **Demand turns down** for three months in a row.\n\nThe first one is the real risk. It's my biggest guess.`,
      chips: [{ label: 'See the maths', act: { t: 'open', id: r.product.id, maths: true } }],
    }),
  },

  /* ── Suppliers ── */
  {
    re: /who (can|could|will|would) make|who makes (this|it|them|the)|(which|what) (factories|suppliers|manufacturers) (make|can|could|sell)|(show|list) (me )?(the )?suppliers/,
    say: (ctx, run, r) => {
      const id = ctx.productId ?? r.product.id;
      const sr = evaluateSuppliers(id, ctx.profile);
      if (!ctx.productId) return {
        text: `${sr.shortlist.length} suppliers pass my checks for the ${sr.product.short}, out of ${sr.product.listings} listings on Orvane. Choose it and I'll show you who and why.`,
        chips: [{ label: `Find suppliers for the ${sr.product.short}`, act: { t: 'choose', id }, rec: true }],
      };
      void run;
      return {
        text: `For the ${sr.product.short}, ${sr.shortlist.length} of ${sr.product.listings} suppliers pass every check:\n\n${sr.shortlist.map((x) => `- **${x.supplier.short}**, ${x.supplier.city}: ${money(x.unit)} a unit, minimum ${x.moq}`).join('\n')}`,
        chips: [{ label: 'Compare them', act: { t: 'compareSup' } }],
      };
    },
  },
  {
    re: /(supplier|factory|someone|anyone|who)\b.*\b(small(er)?|low(er)?|tiny) (orders?|moq|quantit|batch)|small(er)? (orders?|batch(es)?) (supplier|factory)/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx) => {
      const sr = evaluateSuppliers(ctx.productId!, ctx.profile);
      const ok = sr.results.filter((x) => x.tier === 'shortlist' || x.tier === 'ask').sort((a, b) => a.moq - b.moq);
      const s = ok[0];
      if (!s) return null;
      return {
        text: `**${s.supplier.short}** takes the smallest order I'd trust: ${s.moq} units for ${money0(s.stack.firstOrder)}. ${ok[1] ? `Next is ${ok[1].supplier.short} at ${ok[1].moq}.` : ''} Smaller orders usually cost more per unit, so a tiny first order is safer but earns less.`.trim(),
        chips: [{ label: `Open ${s.supplier.short}`, act: { t: 'openSupplier', id: s.supplier.id } }],
      };
    },
  },
  {
    re: /(outside|other than|not (from|in)|instead of|besides) china|(other|different) countr(y|ies)\b.*\bsuppl|suppl\w*\b.*\b(vietnam|other countr)/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx) => {
      const sr = evaluateSuppliers(ctx.productId!, ctx.profile);
      const away = sr.results.filter((x) => x.supplier.origin !== 'CN');
      if (!away.length) return { text: `Not for the ${sr.product.short}. Every supplier that passes my checks is in China.` };
      const a = away[0];
      const cn = sr.results.find((x) => x.supplier.origin === 'CN' && x.tier === 'shortlist');
      return {
        text: `Yes. **${a.supplier.short}** is in ${a.supplier.city}, Vietnam, and ${a.tier === 'shortlist' ? 'it is on the shortlist' : `it is ${a.label.toLowerCase()}`}. Its unit price is ${money(a.unit)}${cn ? ` against ${money(cn.unit)} from ${cn.supplier.short}` : ''}, and after duty into ${MARKETS[ctx.profile.market].the} it earns ${money(a.stack.profit)} a sale${cn ? ` against ${money(cn.stack.profit)}` : ''}. Buying from two countries also protects you if duty on one changes.`,
        chips: [{ label: `Open ${a.supplier.short}`, act: { t: 'openSupplier', id: a.supplier.id } }],
      };
    },
  },
  {
    re: /(can|should) i trust|is (this|the|that|it) (supplier|factory) (safe|legit|real|reliable|trustworthy|ok|okay|good)|\blegit\b|\bscam\b|trustworthy/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx, _run, _r, text) => {
      const sr = evaluateSuppliers(ctx.productId!, ctx.profile);
      const sup = sr.results.find((x) => x.supplier.id === (supplierOf(text, ctx) ?? ctx.focusSupplierId)) ?? sr.shortlist[0];
      if (!sup) return null;
      const s = sup.supplier;
      const good = [s.licence && 'a checked business licence', s.audit && 'a passed factory audit', `${s.orders} completed orders`, s.onTime !== null && `${pct(s.onTime)} delivered on time`].filter(Boolean) as string[];
      const bad = [s.offPlatform && 'it asks to be paid outside Orvane', s.type === 'Trading company' && "it's a reseller, not the factory", s.type === 'Unclear' && "it won't say if it's the factory", !s.audit && 'no factory audit on record'].filter(Boolean) as string[];
      return {
        text: `**${s.short}: ${sup.label.toLowerCase()}.** On its side: ${list(good)}.${bad.length ? ` Against it: ${list(bad)}.` : ''}\n\n${s.offPlatform ? "I wouldn't send it money." : 'A good record proves it delivers. Only a sample proves your product will be good.'}`,
        chips: [{ label: `Open ${s.short}`, act: { t: 'openSupplier', id: s.id } }],
      };
    },
  },
  {
    re: /(problems?|complaints?|issues?|disputes?|bad reviews?|late)\b.*\b(before|in the past|history|record)|(anyone|others|buyers) (had|have) (problems|issues|trouble)|track record/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx, _run, _r, text) => {
      const sr = evaluateSuppliers(ctx.productId!, ctx.profile);
      const sup = sr.results.find((x) => x.supplier.id === (supplierOf(text, ctx) ?? ctx.focusSupplierId)) ?? sr.shortlist[0];
      if (!sup) return null;
      const s = sup.supplier;
      const late = s.onTime !== null ? Math.round(1 / Math.max(0.01, 1 - s.onTime)) : null;
      return { text: `${s.short} has **${s.orders} completed orders** on Orvane over ${s.years} years${s.onTime !== null ? `, and ${pct(s.onTime)} arrived on time. That's about 1 in ${late} running late` : ', but no on-time record yet'}. I don't have its complaint history in this version, so the sample is your real test.` };
    },
  },
  {
    re: /why (is|are) (this|that|the|they|it|[a-z ]{2,30}) (supplier |factory )?(marked |labell?ed |tagged |shown )?(as )?promoted|promoted (tag|label|badge)|what does promoted mean/,
    say: () => ({ text: PROMOTION_EXPLAINED }),
  },
  {
    skip: /\bpay|money|promot|buy/,
    re: /(this|that|the|a) supplier\b.*\b(rank higher|move up|get (on|onto) the shortlist|climb)|(need|have) to do to (rank|move|get) (higher|up|on)/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx, _run, _r, text) => {
      const sr = evaluateSuppliers(ctx.productId!, ctx.profile);
      const sup = sr.results.find((x) => x.supplier.id === (supplierOf(text, ctx) ?? ctx.focusSupplierId)) ?? sr.results.find((x) => x.tier !== 'shortlist');
      if (!sup) return null;
      if (sup.tier === 'shortlist') return { text: `${sup.supplier.short} is already on the shortlist. To move higher it needs a better price or a stronger delivery record than the suppliers above it. Paying for promotion won't move it.` };
      const note = auditNote(sup, sr);
      return { text: `${sup.supplier.short} is held back because ${sup.reason}.${note ? ` ${note}` : ''} Paying for promotion won't move it.`, chips: [{ label: `Open ${sup.supplier.short}`, act: { t: 'openSupplier', id: sup.supplier.id } }] };
    },
  },
  {
    re: /who (actually|really) makes|made by (them|someone else|another)|outsourc|subcontract|(have|own) (their|its|a) (own )?factory|do they (actually |really )?make/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx) => {
      const sr = evaluateSuppliers(ctx.productId!, ctx.profile);
      const rows = sr.results.slice(0, 6).map((x) => `- ${x.supplier.short}: ${x.supplier.type === 'Manufacturer' ? 'makes it in its own factory' : x.supplier.type === 'Trading company' ? 'buys from a factory and resells' : "won't say, which is a warning sign"}`);
      return { text: `For the ${sr.product.short}:\n\n${rows.join('\n')}\n\nAn audit is the proof: the inspector visits the factory that makes it. Even factories send some steps out, like printing a logo, so ask "which steps are done in your own factory?" before a big order.` };
    },
  },

  /* ── Quotes and haggling ── */
  {
    re: /(really|actually) (the )?same (product|thing|item|spec)|like[- ]for[- ]like|apples to apples|(quotes?|prices?)\b.*\b(comparable|the same (product|spec|thing))/,
    when: (ctx) => ctx.quotesReady,
    say: (ctx) => {
      const qs = quotesOf(ctx);
      const p = productById(ctx.productId!)!;
      const moqs = [...new Set(qs.map((q) => q.moq))];
      return { text: `Mostly. I sent every supplier the same request: the ${p.name.toLowerCase()}, priced at the same quantity, with shipping to ${MARKETS[ctx.profile.market].the}. What still differs: ${moqs.length > 1 ? `minimum orders (${list(moqs.map(String))} units), ` : ''}shipping cost, and the material and finish, which only a sample shows. That's why I compare profit per sale, not unit price.` };
    },
  },
  {
    re: /(ask|get|negotiat|haggl|bargain|push)\w*\b.*\b(lower|better|cheaper|discount|down|less)|\b(lower|better|cheaper) (price|deal|offer)\b.*\?|match (it|the|their|that|this|price|offer|deal)|price match|beat (the|their|that) (price|offer)/,
    when: (ctx) => AFTER_QUOTES.includes(ctx.stage) || ctx.stage === 'waiting',
    say: (ctx) => {
      const qs = quotesOf(ctx);
      const down = qs.filter((q) => q.delta < 0);
      return {
        text: `${down.length ? `Asking already worked: ${list(down.map((q) => `${q.supplier.short} came down ${money(-q.delta)} to ${money(q.unit)}`))}. ` : ''}I can't send a second round of price talks yet. For a first order I wouldn't push hard anyway. A few cents a unit is worth less than a supplier who's happy to fix problems. The real saving comes on the reorder, when you can promise more units.`,
        chips: ctx.stage === 'quotes' ? [{ label: 'Review my plan', act: { t: 'review' }, rec: true }] : undefined,
      };
    },
  },
  {
    re: /\b(chase|nudge|remind|follow[- ]?up|ping)\b|(hasn'?t|haven'?t|didn'?t|not) (replied|answered|responded|got back)|no (reply|response|answer) (yet|from)|ghost(ed|ing)/,
    when: (ctx) => ctx.contacted.length > 0,
    say: (ctx) => ({
      text: ctx.quotesReady
        ? `Everyone has replied. ${quotesOf(ctx).filter((q) => q.followUp).map((q) => q.supplier.short).join(' and ') || 'No one'} needed one reminder from me first.`
        : "I'm on it. If a supplier stays quiet for 24 hours, I send one polite reminder myself. If they still don't answer, I drop them, because slow replies now usually mean slow orders later.",
      chips: ctx.stage === 'waiting' ? [{ label: 'Skip ahead 2 days', act: { t: 'skip' }, rec: true }] : undefined,
    }),
  },
  {
    re: /(changed?|updat\w+|new|different) (my |the )?(design|spec|specs|colou?r|size|logo|packaging|material)|tell (all|every|each) (the )?suppliers?|let (the|all) suppliers know/,
    when: (ctx) => ctx.contacted.length > 0,
    say: () => ({ text: "I can't resend a change to suppliers yet. The safe moment is the next message: every message I prepare waits for your approval, and you can edit its text before it goes. Put the change there, and the sample will show whether they got it right." }),
  },
  {
    re: /(order|buy) more\b|bigger order|double (the|my)? ?(order|quantity)|volume (price|discount)|bulk (price|discount|deal)|price break|cheaper (per unit|each|a unit) if/,
    say: (ctx, _run, r) => {
      const unit = r.stack.cost;
      return {
        text: `Usually 5 to 10% less a unit at double the minimum. On the ${r.product.short} that's about ${money(unit * 0.93)} instead of ${money(unit)}.\n\nI'd still buy the minimum the first time. Doubling it ties up another ${money0(r.stack.firstOrder)} in stock you haven't proved will sell. Get the volume price on the reorder.`,
      };
    },
  },

  /* ── Samples ── */
  {
    re: /sample\w*\b.*\b(cost|price|how much)|how much\b.*\bsamples?|samples?\b.*\bhow long\b.*\bcost/,
    when: (ctx) => ctx.quotesReady,
    say: (ctx) => {
      const ps = picksOf(ctx);
      const total = ps.reduce((a, q) => a + q.sampleCost, 0);
      return { text: `${list(ps.map((q) => `${q.supplier.short} ${money0(q.sampleCost)}`))}, so **${money0(total)}** with shipping. They take ${SAMPLE_DAYS.from} to ${SAMPLE_DAYS.to} days to arrive.` };
    },
  },
  {
    re: /what (should|do|must) i (check|look for|look at|test|inspect)|how (do|should|can) i (check|test|inspect|judge)( a| the)? samples?|checklist/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx) => {
      const p = productById(ctx.productId!)!;
      const pts = checkPoints(p.category, ctx.profile, p.price[ctx.profile.market]);
      return { text: `Check each sample on these ${pts.length} points:\n\n${pts.map((x) => `- **${x.title}**: ${x.hint}`).join('\n')}\n\nMark each one good, minor or a problem. I'll tell you which supplier to order from.` };
    },
  },
  {
    re: /counts? as (a )?(real |serious |big )?problem|(problem|issue) (or|vs|versus) (a )?minor|difference between (a )?(problem|minor)|what is a minor/,
    say: () => ({ text: "A **problem** is something a customer would send back or complain about: it breaks, leaks, smells, or doesn't match the photos. A **minor** issue is something you'd fix in the order, like a loose thread or a slightly different colour. One problem rules a supplier out. Minor issues just go into the order as fixes." }),
  },
  {
    re: /(both|all|every|none of the) (samples? )?(failed|were bad|are bad|bad|broke|broken|passed)|samples? (all )?failed/,
    when: (ctx) => ctx.samplesRequested,
    say: (ctx) => {
      const qs = quotesOf(ctx);
      const next = qs.filter((q) => !ctx.sampleIds.includes(q.supplier.id)).sort((a, b) => b.stack.profit - a.stack.profit)[0];
      return {
        text: `Then don't order. You've spent a little on samples, which is the cheapest way to learn this. Two ways forward: ${next ? `try a sample from **${next.supplier.short}**, the next supplier that replied (${money0(next.sampleCost)}), or ` : ''}go back and pick a different product.`,
        chips: [...(next ? [{ label: `Sample ${next.supplier.short}`, act: { t: 'resample' as const, id: next.supplier.id }, rec: true }] : []), { label: 'Back to products', act: { t: 'goto', stage: 'opportunities' } }],
      };
    },
  },
  {
    re: /(bulk|big|full|mass|main|real|first) (order|production|batch|run)\b.*\b(match|same|like|as good)|golden sample|(match|same as|as good as) the sample/,
    say: () => ({ text: `Three things protect you:\n\n- **Keep your approved sample.** The order says the goods must match it.\n- **Put the fixes in writing.** Anything you marked minor goes into the order, so the supplier can't say they didn't know.\n- **Pay through Orvane.** Your money is held until the goods arrive as described.\n\nFor bigger orders, an inspector can check the goods at the factory before they ship.` }),
  },

  /* ── Order and payment ── */
  {
    re: /how (much|many) should i (order|buy)|first order (size|quantity)|how many (units )?(should|do) i (order|buy)/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx, _run, r) => {
      const q = lead(ctx);
      const moq = q?.moq ?? r.stack.moq;
      const cost = q?.stack.firstOrder ?? r.stack.firstOrder;
      return { text: `The minimum: **${moq} units for ${money0(cost)}**${q ? ` from ${q.supplier.short}` : ''}. Sell through it, see what customers say, then reorder bigger. The money you keep back pays for launch ads.` };
    },
  },
  {
    re: /(what|which) should (the|my) order (include|say|have|cover)|protect(ed|ion)? (in|by|through) (the |my )?order|\bcontract\b|purchase order|order terms/,
    say: (ctx) => ({
      text: `Your order should say:\n\n- **What exactly:** the product, quantity and unit price, and that it must match your approved sample\n- **The fixes** from your sample check\n- **When:** the date it ships\n- **How it's packed:** carton size and your labels\n- **How you pay:** through Orvane, held until the goods arrive as described\n\n${ctx.stage === 'order' ? 'The order I prepared already has all five. Check it before you approve.' : 'I put all five in the order when we get there.'}`,
    }),
  },
  {
    re: /inspect\w*\b.*\b(before|ship|factory|goods)|check (the )?goods\b.*\bbefore|(third[- ]party|pre[- ]?shipment|independent|qc) (check|inspection|inspector)|quality check before/,
    say: (ctx, _run, r) => {
      const q = lead(ctx);
      const order = q?.stack.firstOrder ?? r.stack.firstOrder;
      const fee = 300;
      return { text: `Yes. An independent inspector visits the factory, opens a random set of cartons and checks them against your sample. It usually costs **about ${money0(fee)}** for a day.\n\nOn a ${money0(order)} order, that's ${pct(fee / order)} of the cost. I'd skip it this time and rely on your sample and Orvane's payment protection, unless your sample had problems that were fixed. Book one from your second order on.` };
    },
  },
  {
    re: /(supplier|they|it|order|goods|shipment) (is|are|was|were|arrives?|comes?) (late|broken|damaged|wrong|faulty|missing)|(late|broken|damaged|wrong|faulty|defective) (goods|order|items?|units?|delivery|shipment)|not as described|what if .* (late|broken|damaged|wrong)/,
    say: () => ({ text: "Orvane holds your payment until the goods arrive as described. If they're **broken or wrong**, open a claim with photos within 14 days of delivery, and you get a refund or a remake. If they're **late** past the agreed ship date, you can cancel for a full refund. That only works if you paid through Orvane, which is why I never let you pay a supplier directly." }),
  },

  /* ── Shipping and customs ── */
  {
    re: /when (will|does|do|should) (my|the|it|they) ?(order|goods|stock|shipment|products?|units)? ?(arrive|get here|land|come|be delivered)|delivery date|how long (until|till|before) (it|my order|the order|the goods) (arrives?|gets? here)/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx) => {
      const q = lead(ctx);
      if (!q) return null;
      return {
        text: `About **${days(q)} days** after you order from ${q.supplier.short}: 2 days to confirm, ${q.supplier.lead} days to make it, about ${FREIGHT_DAYS.sea} days at sea, and ${FREIGHT_DAYS.customs} days through customs.${ctx.stage === 'ordered' ? ' Your order screen shows each date.' : ''}`,
        chips: ctx.stage === 'ordered' ? [{ label: 'See my order', act: { t: 'goto', stage: 'ordered' } }] : undefined,
      };
    },
  },
  {
    re: /\b(sea|ocean|boat)\b.*\b(air|plane|fly)\b|\b(air|plane)\b.*\b(sea|ocean|boat)\b|air ?freight|by air|fly (it|them)|express (shipping|courier)|faster shipping/,
    say: (ctx, _run, r) => {
      const sea = r.stack.ship;
      const air = Math.round(sea * 3.5 * 20) / 20;
      const after = r.stack.profit - (air - sea);
      return {
        text: `**Sea**, for the first order. On the ${r.product.short}:\n\n- **Sea:** about ${money(sea)} a unit, ${FREIGHT_DAYS.sea} days on the water\n- **Air:** about ${money(air)} a unit, 5 to 8 days\n\nAir would cut your profit from ${money(r.stack.profit)} to ${money(after)} a sale. It's worth it only to rush a small top-up when you're about to run out.`,
      };
    },
  },
  {
    re: /who (handles|does|deals with|clears|takes care of) (the )?customs|customs broker|clear(ing|s)? (the )?customs|(freight )?forwarder|importer of record|c&f agent|\beori\b/,
    say: (ctx, _run, r) => {
      const m = ctx.profile.market;
      const order = lead(ctx)?.stack.firstOrder ?? r.stack.firstOrder;
      const local = m === 'US'
        ? `In the US you're the importer, so the duty is yours to pay. Under $2,500 the import papers are simpler, and your ${money0(order)} order is under that.`
        : m === 'BD' ? 'In Bangladesh a C&F agent at the port clears the goods for you.'
        : `In ${MARKETS[m].the} you'll need an EORI number, a free ID for importers, before the goods arrive.`;
      return { text: `A **freight forwarder** books the ship and usually clears customs for you too. You don't do it yourself. ${local} My shipping cost of ${money(r.stack.ship)} a unit already includes the forwarder's fee.` };
    },
  },
  {
    re: /where is (my|the) (order|shipment|stock|goods|package|parcel)|track(ing)? (my |the )?(order|shipment|ship|goods|package)|\btrack it\b/,
    say: (ctx) => ctx.stage === 'ordered'
      ? { text: "I can't track the ship live yet. Your order screen shows each step with its expected date, and the supplier will message you when it ships.", chips: [{ label: 'See my order', act: { t: 'goto', stage: 'ordered' } }] }
      : { text: "You haven't placed an order yet, so there's nothing on its way. Samples are the only thing you'd have to track before then." },
  },
  {
    re: /\bfba\b|amazon (warehouse|fulfil\w*|prep)|(ship|send|deliver)\w* (it |them )?(straight|direct(ly)?) to amazon/,
    say: () => ({ text: "It's common. The forwarder delivers straight to an Amazon warehouse, as long as you book the shipment in Amazon's seller account first and every carton has Amazon's label. I don't plan that route yet. My delivery dates assume the goods come to you." }),
  },

  /* ── After launch ── */
  {
    re: /how (are|is) my sales|sales (going|so far)|(profit|sales|margin) (dropped|drop|fell|fall|went down|is down|are down|lower)|why did (my )?(profit|sales|margin)|my (sales|numbers|profit) (this|last) (month|week)/,
    say: (ctx) => ({
      text: ctx.stage === 'ordered'
        ? "Your stock is still on its way, so there are no sales yet. Once you're selling, connecting your store would let me compare real sales with my guess. I can't do that in this version."
        : "You haven't launched yet. Once you're selling, I'd compare your real sales and ad costs with my guesses and tell you what changed. That isn't in this version.",
    }),
  },
  {
    re: /re-?order|order again|restock|run(ning)? out|when (should|do) i order more|order more stock/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx) => {
      const q = lead(ctx);
      const d = q ? days(q) : 2 + 20 + FREIGHT_DAYS.sea + FREIGHT_DAYS.customs;
      return { text: `Reorder while you still have **${d} days of stock** left, because that's how long a new order takes to arrive. If you're selling 5 a day, reorder when you're down to about ${5 * d} units. Reorder from ${q ? q.supplier.short : 'the same supplier'}, ask for the volume price, and include any fixes your customers asked for.` };
    },
  },
  {
    re: /(customers?|buyers?|reviews?)\b.*\b(complain|unhappy|problem|issue|bad|negative)|complain(ts|ing)? about/,
    say: () => ({ text: "Write down the two or three complaints you see most. If it's a quality fault, send the supplier photos and put the fix in the reorder, like the fixes from your sample check. If it's a safety problem, like something breaking or overheating, stop selling and contact the supplier straight away." }),
  },
  {
    re: /switch(ing)? suppliers?|change (my |the )?supplier|(another|different|backup|second) supplier|replace (my|the) supplier/,
    when: (ctx) => ctx.samplesRequested,
    say: (ctx) => {
      const qs = picksOf(ctx);
      const backup = qs[1] ?? null;
      return { text: `Switch if a supplier is late twice, the quality slips from the sample, or a price rise wipes out more than a quarter of your profit. ${backup ? `Your backup is **${backup.supplier.short}**: you've already seen its sample, so switching is quick.` : 'Keep a second supplier warm so switching is quick.'}` };
    },
  },
  {
    re: /(second|next|another|new) product\b|what (else|next) (should|can|could) i (sell|add|stock)|add (a |another |one more )?product/,
    when: (ctx) => Boolean(ctx.productId),
    say: (ctx, run) => {
      const nextUp = run.fits.find((x) => x.product.id !== ctx.productId);
      if (!nextUp) return null;
      return {
        text: `The **${nextUp.product.short}** (${money(nextUp.stack.profit)} a sale). It's in the same category, so the same suppliers may make it, you can ship the two together, and the same customers may buy both. I'd wait until your first product is selling before you spend on it.`,
        chips: [{ label: `Open the ${nextUp.product.short}`, act: { t: 'open', id: nextUp.product.id } }],
      };
    },
  },

  /* ── Steering ── */
  {
    re: /why did (the )?(ranking|order|list|results?) change|why (did|has) .* (move|moved|drop|dropped|jump|jumped)/,
    say: () => ({ text: 'The ranking only moves when your brief changes: the budget, market, sales channel, priorities or split. Each change shows a card listing what moved and why, with Undo. Nothing moves on its own.' }),
  },
  {
    re: /simpl(er|y|ify)|plain (english|words|language)|\beli5\b|i (don'?t|do not) (understand|get it|follow)|(confused|confusing|lost)\b|too (complicated|technical)/,
    say: (ctx, run) => ({ text: plainSummary(ctx, run) }),
  },
];

function supplierOf(text: string, ctx: Ctx): string | null {
  const sr = ctx.productId ? evaluateSuppliers(ctx.productId, ctx.profile) : null;
  return sr?.results.find((x) => text.includes(x.supplier.short.toLowerCase().split(' ')[0]))?.supplier.id ?? null;
}

/** Where the seller is, in the plainest words. */
function plainSummary(ctx: Ctx, run: Run): string {
  const top = run.fits[0];
  const p = ctx.productId ? productById(ctx.productId) : null;
  switch (ctx.stage) {
    case 'start': case 'setup': case 'category': case 'pick':
      return 'Here it is simply: you tell me your budget and where you want to sell. I find products that make money after every cost, and suppliers you can trust. You approve every step.';
    case 'opportunities':
      return top ? `Here it is simply: the ${top.product.short} is my best pick. You'd make about ${money(top.stack.profit)} each time one sells, after paying for everything. To start, you buy ${top.stack.moq} of them for ${money0(top.stack.firstOrder)}.` : 'Here it is simply: nothing makes money at this budget yet. A bigger budget or a cheaper market would help.';
    case 'suppliers': case 'waiting': case 'quotes':
      return `Here it is simply: you picked the ${p?.short}. Now we find a factory that makes it well, at a fair price. I ask them for prices, and you choose who to try.`;
    case 'decision': case 'done': case 'check':
      return 'Here it is simply: before buying hundreds, you buy one sample from each of two factories. When they arrive, you check them, and the better one gets your order.';
    default:
      return 'Here it is simply: your order is placed with the factory. It gets made, shipped by sea and cleared through customs, then you start selling.';
  }
}

/** Scout's knowledge of the wider journey. Returns null when the question is about something else. */
export function knowledge(text: string, ctx: Ctx, run: Run, subject: ProductResult): Reply | null {
  for (const h of H) {
    if (!h.re.test(text) || h.skip?.test(text)) continue;
    if (h.when && !h.when(ctx)) continue;
    const r = h.say(ctx, run, subject, text);
    if (r) return r;
  }
  return null;
}
