import { inSentence, paperAsk, rulesFor } from './knowledge';
import { promotedLine } from './promotion';
import type { Chip, Reply } from './acts';
import { CATEGORY_META, CHANNELS, MARKETS, MARKET_ORDER, PRIORITIES } from './data';
import { capOf, compareCategories, evaluate, splitOf, stackFor, type MarketCompare } from './engine';
import { list, money, money0, ordinal, pct, trendText } from './format';
import type { CategoryId, Product, Profile, Quote, Run, SupRun } from './types';
import { SAMPLE_DAYS, dateOf, leftForLaunch, nouns, orderTimeline, type CheckVerdict, type SampleResult } from './samples';

/**
 * Scout's side of the guided journey. Each function turns engine output
 * into a short message, so the words always follow the numbers.
 */

const theMarket = (p: Profile) => MARKETS[p.market].the;

/** A market-switch question that is never about the market the seller already has. */
function otherMarket(p: Profile): Chip {
  const id = p.market === 'DE' ? 'UK' : 'DE';
  const name = MARKETS[id].the;
  return { label: `What if I sold in ${name}?`, act: { t: 'ask', text: `What if I sold in ${name} instead?` } };
}

export const welcome = (): Reply => ({
  text: "Hi Sam, I'm Scout. I find products that make money in your market, check who is safe to buy from, and contact suppliers once you say yes.\n\nTell me what you have in one sentence and I'll run the whole search. Or start below, one step at a time.",
  chips: [
    { label: 'Find a product idea', act: { t: 'start', entry: 'idea' }, rec: true },
    { label: 'Find suppliers for a product', act: { t: 'start', entry: 'suppliers' } },
  ],
});

export const askMarket = (first: boolean): Reply => ({
  text: `${first ? 'Three quick questions, then I get to work. ' : ''}Where will you sell? This sets demand, import duty and sales tax.`,
});

export const askBudget = (): Reply => ({
  text: 'How much can you put into your first order and launch? I spend part of it on stock and keep the rest back for samples, ads and a buffer.',
});

export const askChannel = (): Reply => ({
  text: 'How will you sell? It changes your fees and what each sale costs in ads.',
});

export function briefDone(p: Profile, guessed: boolean, expGuessed = guessed): string {
  const cap = capOf(p);
  // Say the split and the reason in the same breath, so a smaller number than the budget never looks like a mistake.
  const line = splitOf(p) === 'stock' && !p.split
    ? `Got it. Of your ${money0(p.budget)}, up to **${money0(cap)}** goes on your first order. You already sell, so I guess you pay for ads from other money and keep just ${money0(p.budget - cap)} back for samples and a buffer. Change the split on your budget card if that's wrong.`
    : `Got it. Of your ${money0(p.budget)}, up to **${money0(cap)}** goes on your first order. I hold the other ${money0(p.budget - cap)} back for samples, launch ads and a buffer for surprises like a late shipment or a higher duty, so a slow first month can't leave you stuck.`;
  const prio = `you want **${list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase()))}**`;
  const exp = p.experience === 'new' ? 'this is your **first time** sourcing' : "you're an **existing seller**";
  if (guessed && expGuessed) return `${line}\n\nI made two guesses to save you questions: ${prio}, and ${exp}. Change either in the bar above whenever you like.`;
  if (guessed) return `${line}\n\nI made one guess to save you a question: ${prio}. Change it in the bar above whenever you like.`;
  if (expGuessed) return `${line}\n\nI made one guess to save you a question: ${exp}. Change it in the bar above whenever you like.`;
  return line;
}

/** Scout's first reply when a seller opens by saying who they are or what they need. */
export function greeting(o: { experience?: 'new' | 'existing'; goal: 'idea' | 'suppliers' | null }, noted: string[], product?: string): string {
  const parts: string[] = [];
  if (o.experience === 'new') parts.push("Happy to help. I've noted that this is your first time sourcing, so I'll explain trade terms as we go.");
  else if (o.experience === 'existing') parts.push("Good, you already sell, so I'll keep it short and use trade terms like MOQ (minimum order quantity).");
  else parts.push('Happy to help.');
  if (o.goal === 'suppliers') parts.push(product
    ? `I'll check which ${product.toLowerCase()} suppliers are safe to buy from and price a first order from each, once I know your market and budget.`
    : "I'll check which suppliers are safe to buy from and price a first order from each. You pick the product once I know your market and budget.");
  else if (o.goal === 'idea' || !o.goal) parts.push(o.experience === 'existing'
    ? "I'll find a product that adds to what you sell and makes money after every cost."
    : "I'll find products that make money in your market after every cost, and tell you which ones to avoid.");
  if (noted.length) parts.push(`Noted: ${list(noted)}.`);
  return parts.join(' ');
}

export function category(p: Profile): Reply {
  const { views, best } = compareCategories(p);
  const v = views.find((x) => x.id === best)!;
  const why = v.lead ? ` Its best fit, the **${v.lead.product.short}**, makes about ${money(v.lead.stack.profit)} a sale${v.lead.demand.trend > 0 ? ` with demand up ${v.lead.demand.trend}% in a year` : ''}.` : '';
  return {
    text: `For ${list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase())) || 'a first product'}, I'd start with **${CATEGORY_META[best].name}**.${why} I've judged all four categories for your brief on the left.`,
    chips: [
      { label: `Look at ${CATEGORY_META[best].lower}`, act: { t: 'category', id: best }, rec: true },
      { label: 'Run the rest for me', act: { t: 'auto' } },
      { label: 'Why not another category?', act: { t: 'ask', text: 'Why not another category?' } },
    ],
  };
}

export const pickProduct = (): Reply => ({
  text: 'Which product do you want suppliers for? Pick one on the left. Switch category at the top of the list if it is not there.',
});

export function opportunities(run: Run): Reply {
  const p = run.profile;
  const top = run.fits[0];
  if (!top) {
    const nearest = run.over[0];
    return {
      text: `**Nothing fits ${money0(p.budget)} yet.** Your first order limit is ${money0(run.cap)}, and the smallest first order here is ${money0(nearest.stack.firstOrder)} for the ${nearest.product.short}.\n\nTwo ways forward:`,
      chips: [
        { label: `Raise budget to ${money0(nearest.needsBudget)}`, act: { t: 'profile', patch: { budget: nearest.needsBudget } }, rec: true },
        { label: 'What is the smallest order I could place?', act: { t: 'ask', text: 'What is the smallest first order?' } },
      ],
    };
  }
  const lines: string[] = [];
  const t = top.demand.trend;
  if (top.verdict.tier === 'worth') {
    lines.push(`I'd start with the **${top.product.short}**: about ${money(top.stack.profit)} a sale${t > 0 ? `, demand up ${t}% in a year` : ''}.`);
  } else {
    lines.push(`No clear winner in ${theMarket(p)}. The **${top.product.short}** is the best of them at ${money(top.stack.profit)} a sale, but ${top.verdict.reason}.`);
  }
  const trap = run.fits.find((r) => r.stack.profit <= 0 && r.demand.trend >= 30) ?? run.fits.find((r) => r.verdict.tier === 'skip' && r.demand.shape === 'spike');
  if (trap) {
    lines.push(trap.stack.profit <= 0
      ? `Avoid the ${trap.product.short}. It's the fastest riser (${trendText(trap.demand.trend).toLowerCase()}) but loses ${money(-trap.stack.profit)} on every sale.`
      : `Avoid the ${trap.product.short}. It's rising fast, but ${trap.verdict.reason}.`);
  }

  const comparable = run.fits.filter((r) => r.verdict.tier !== 'skip').slice(0, 3);
  const chips: Chip[] = [];
  if (comparable.length >= 2) chips.push({ label: `Compare the top ${comparable.length}`, act: { t: 'compare', ids: comparable.map((r) => r.product.id) }, rec: true });
  else chips.push({ label: `Choose the ${top.product.short}`, act: { t: 'choose', id: top.product.id }, rec: true });
  chips.push({ label: `Why is the ${top.product.short} first?`, act: { t: 'ask', text: `Why is the ${top.product.short} first?` } });
  if (trap) chips.push({ label: `Show why the ${trap.product.short.toLowerCase()} loses`, act: { t: 'open', id: trap.product.id, maths: true } });
  return { text: lines.join('\n\n'), chips };
}

export function comparison(run: Run, ids: string[]): Reply {
  const rows = ids.map((id) => run.results.find((r) => r.product.id === id)!).filter(Boolean);
  const byProfit = [...rows].sort((a, b) => b.stack.profit - a.stack.profit)[0];
  const byOrder = [...rows].sort((a, b) => a.stack.firstOrder - b.stack.firstOrder)[0];
  const best = [...rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
  const parts = [`Side by side, the **${best.product.short}** is my pick.`];
  if (byProfit === best) parts.push(`It earns the most per sale (${money(best.stack.profit)}).`);
  else parts.push(`The ${byProfit.product.short} earns more per sale (${money(byProfit.stack.profit)}), but ${byProfit.verdict.reason}.`);
  if (byOrder !== best) parts.push(`The ${byOrder.product.short} is the cheapest way in at ${money0(byOrder.stack.firstOrder)}.`);
  return {
    text: parts.join(' '),
    chips: [
      { label: `Choose the ${best.product.short}`, act: { t: 'choose', id: best.product.id }, rec: true },
      otherMarket(run.profile),
    ],
  };
}

export function suppliers(run: SupRun): Reply {
  const { product, results, shortlist } = run;
  const lines: string[] = [];
  if (!shortlist.length) {
    lines.push(`I checked **${product.listings} supplier listings** for the ${product.short}. None passes every check within your ${money0(run.cap)} first order limit.`);
    return { text: lines.join('\n\n'), chips: [{ label: 'Back to products', act: { t: 'goto', stage: 'opportunities' }, rec: true }] };
  }
  lines.push(`**${shortlist.length} of ${product.listings} ${product.short.toLowerCase()} suppliers** are worth contacting.`);
  const asides: string[] = [];
  const avoid = results.find((r) => r.tier === 'avoid');
  const out = results.find((r) => r.tier === 'out');
  if (avoid) asides.push(`${avoid.supplier.short} ${avoid.reason}`);
  if (out) asides.push(`${out.supplier.short}'s first order is over your limit`);
  if (asides.length) lines[0] += ` I set ${asides.length === 1 ? 'one' : 'two'} aside: ${asides.join(', and ')}.`;
  const promo = promotedLine(run);
  if (promo) lines.push(promo);
  const rules = rulesFor(product, run.profile.market).filter((x) => x.askSupplier);
  if (rules.length) lines.push(`To sell it in ${MARKETS[run.profile.market].the} you'll need ${list(rules.map((x) => inSentence(x.name)))}. I'll ask for ${rules.length === 1 ? 'it' : 'them'} in the same message, so you know before you pay for samples.`);
  lines.push(`Shall I ask ${shortlist.length === 1 ? 'it' : `all ${shortlist.length}`} for a quote? You'll see the message first.`);
  return {
    text: lines.join('\n\n'),
    chips: [
      { label: `Ask ${shortlist.length === 1 ? shortlist[0].supplier.short : `all ${shortlist.length}`} for a quote`, act: { t: 'draftInquiry' }, rec: true },
      ...(shortlist.length > 1 ? [{ label: 'Compare them', act: { t: 'compareSup' } } as Chip] : []),
      { label: `Is ${shortlist[0].supplier.short} safe?`, act: { t: 'ask', text: `Is ${shortlist[0].supplier.short} safe to buy from?` } },
    ],
  };
}

export function inquiryText(product: Product, p: Profile, moqs: number[]): string {
  const m = MARKETS[p.market];
  const qty = Math.max(...moqs);
  const papers = paperAsk(product, p.market);
  return [
    'Hello,',
    '',
    `I'm sourcing the ${product.name.toLowerCase()} to sell in ${m.the}. Could you confirm:`,
    '',
    `1. Your best unit price for ${qty} units, and for ${qty * 2} units`,
    '2. Your minimum order and production time',
    `3. Sample cost, including shipping to ${m.the}`,
    '4. Whether you can print a logo on the product',
    ...(papers ? [`5. A copy of ${papers}`] : []),
    '',
    'Thank you,',
    'Sam',
  ].join('\n');
}

/** What a supplier wrote back, used in its drawer and in Messages, so both always say the same thing. */
export function supplierReply(q: Quote): string {
  const s = q.supplier;
  return `${q.delta < 0 ? `We can offer ${money(q.unit)} per unit for ${q.moq} units.` : `Our price is ${money(q.unit)} per unit for ${q.moq} units.`} Production takes ${s.lead} days. ${s.sample.price ? `A sample costs ${money0(s.sample.price)} plus ${money0(s.sample.ship)} shipping.` : `The sample is free; shipping is ${money0(s.sample.ship)}.`}`;
}

export const inquirySent = (n: number): Reply => ({
  text: `Sent to ${n} ${n === 1 ? 'supplier' : 'suppliers'}. I'll watch for replies and follow up once if anyone stays quiet for 24 hours.`,
  chips: [{ label: 'Skip ahead 2 days', act: { t: 'skip' }, rec: true }],
});

export function quotes(qs: Quote[], picks: Quote[], p: Profile): Reply {
  const lines: string[] = [];
  const chased = qs.find((q) => q.followUp);
  lines.push(`**${qs.length === 1 ? 'The quote is' : `All ${qs.length} quotes are`} in.**${chased ? ` ${chased.supplier.short} went quiet, so I followed up once and it replied the next day.` : ''}`);
  const cut = [...qs].filter((q) => q.delta < 0).sort((a, b) => a.delta - b.delta)[0];
  if (cut) lines.push(`${cut.supplier.short} came down from ${money(cut.listed)} to ${money(cut.unit)} a unit, which lifts profit to ${money(cut.stack.profit)} per sale.`);
  if (picks.length === 2) {
    const total = picks.reduce((a, q) => a + q.sampleCost, 0);
    lines.push(`I'd sample **${picks[0].supplier.short}** (best profit) and **${picks[1].supplier.short}** (smallest first order): ${money0(total)} in total. It's the only way to check quality.`);
  }
  const third = qs.find((q) => !picks.includes(q));
  return {
    text: lines.join('\n\n'),
    chips: [
      { label: 'Review my plan', act: { t: 'review' }, rec: true },
      ...(third ? [{ label: `Why not ${third.supplier.short}?`, act: { t: 'ask', text: `Why not sample ${third.supplier.short}?` } } as Chip] : []),
    ],
  };
}

export function decision(picks: Quote[]): Reply {
  const total = picks.reduce((a, q) => a + q.sampleCost, 0);
  return {
    text: `Here is the whole plan on one page. The one thing I can't check from here is quality, and samples settle that for ${money0(total)}. Nothing else is spent until you place an order yourself.`,
    chips: [
      { label: `Request ${picks.length} ${picks.length === 1 ? 'sample' : 'samples'} for ${money0(total)}`, act: { t: 'draftSamples' }, rec: true },
      { label: 'What could go wrong?', act: { t: 'ask', text: 'What could go wrong with this plan?' } },
    ],
  };
}

export const done = (picks: Quote[], day: number): Reply => ({
  text: `Samples requested from ${list(picks.map((q) => q.supplier.short))}. They should arrive between **${dateOf(day + SAMPLE_DAYS.from)} and ${dateOf(day + SAMPLE_DAYS.to)}**. When they do, I'll walk you through an eight-point check before you order anything.`,
  chips: [{ label: 'Skip ahead to delivery', act: { t: 'arrive' }, rec: true }, { label: 'What should I check?', act: { t: 'ask', text: 'What should I check when the samples arrive?' } }],
});

export const arrived = (picks: Quote[]): Reply => ({
  text: `Your ${picks.length === 1 ? 'sample has' : `${picks.length} samples have`} arrived. This step needs you: I can't hold ${picks.length === 1 ? 'it' : 'them'}. Rate each of the eight points and I'll compare ${picks.length === 1 ? 'it against your quote' : 'them'} the moment you're done.`,
  chips: [{ label: 'What counts as a problem?', act: { t: 'ask', text: 'What counts as a problem in a sample?' } }],
});

export function checked(v: CheckVerdict): Reply {
  if (v.kind === 'pick') {
    const b = v.best.q;
    return {
      text: `**Order from ${b.supplier.short}.** ${v.why}. Your first order would be ${money0(b.stack.firstOrder)}.`,
      chips: [
        { label: `Prepare the order with ${b.supplier.short}`, act: { t: 'orderFrom', id: b.supplier.id }, rec: true },
        ...(v.other && !v.other.problems.length ? [{ label: `Order from ${v.other.q.supplier.short} instead`, act: { t: 'orderFrom' as const, id: v.other.q.supplier.id } }] : []),
      ],
    };
  }
  if (v.kind === 'none') {
    const c = v.closest;
    return {
      text: `**Neither sample is ready to order.** ${c.q.supplier.short} came closest, but failed on ${nouns(c.problems)}. Ordering now would mean ${c.q.moq} units with the same fault. I'd pay for one more sample first.`,
      chips: [
        { label: `New sample from ${c.q.supplier.short} once fixed, ${money0(c.q.sampleCost)}`, act: { t: 'resample', id: c.q.supplier.id }, rec: !v.next },
        ...(v.next ? [{ label: `Try ${v.next.supplier.short}, ${money0(v.next.sampleCost)}`, act: { t: 'resample' as const, id: v.next.supplier.id }, rec: true }] : []),
      ],
    };
  }
  return { text: '' };
}

export function orderDraft(q: Quote, res: SampleResult | null, p: Profile, spent: number, day: number): Reply {
  const end = orderTimeline(day, q.supplier.lead).at(-1)!;
  const fixes = res?.minors.length ? ` I've added ${res.minors.length === 1 ? 'one fix' : `${res.minors.length} fixes`} for them to make before production.` : '';
  const warn = res?.problems.length ? ` Their sample failed on ${nouns(res.problems)}, so this goes against my advice.` : '';
  return {
    text: `Here's your first order with **${q.supplier.short}**: ${q.moq} units for ${money0(q.stack.firstOrder)}, arriving around **${dateOf(end.day)}**.${fixes}${warn} You'd keep ${money0(leftForLaunch(p, spent, q.stack.firstOrder))} for launch. Nothing is paid until you approve.`,
    chips: [{ label: `Place the order for ${money0(q.stack.firstOrder)}`, act: { t: 'draftOrder' }, rec: !res?.problems.length }],
  };
}

export function ordered(q: Quote, p: Profile, spent: number, day: number): Reply {
  const end = orderTimeline(day, q.supplier.lead).at(-1)!;
  return {
    text: `Order placed with ${q.supplier.short}. It should reach you around **${dateOf(end.day)}**. Your money stays with Orvane until the goods arrive and match the sample. You have ${money0(leftForLaunch(p, spent, q.stack.firstOrder))} left for launch. That's my part done.`,
    chips: [{ label: 'Open my plan', act: { t: 'plan' } }, { label: 'Start a new search', act: { t: 'reset' } }],
  };
}

export const resampled = (q: Quote, day: number): Reply => ({
  text: `New sample requested from ${q.supplier.short}. It should arrive between ${dateOf(day + SAMPLE_DAYS.from)} and ${dateOf(day + SAMPLE_DAYS.to)}, and you'll check it the same way.`,
  chips: [{ label: 'Skip ahead to delivery', act: { t: 'arrive' }, rec: true }],
});

export const noData = (name: string): Reply => ({
  text: `I don't have data for ${name} yet, so I won't guess. The United States, Germany, the United Kingdom and Bangladesh work in this prototype.`,
  chips: MARKET_ORDER.map((id) => ({ label: MARKETS[id].name, act: { t: 'market', id } })),
});

/** One line that says what a budget means, shown when the brief is set. */
export function briefHint(field: 'market' | 'budget' | 'channel', p: Profile, sample: Product): string {
  const m = MARKETS[p.market];
  if (field === 'market') return `${(m.duty.CN * 100).toFixed(m.duty.CN * 1000 % 10 ? 1 : 0)}% duty on goods from China. ${m.vat ? `${m.vat * 100}% sales tax sits inside the shelf price.` : 'No sales tax inside the shelf price.'}`;
  if (field === 'budget') return `First order limit ${money0(capOf(p))}. ${money0(p.budget - capOf(p))} held back for samples, ads and a buffer.`;
  const s = stackFor(sample, p);
  return p.channel === 'marketplace'
    ? `15% marketplace fee and about ${money(s.ad)} in ads per sale (est.).`
    : `${m.pay.label} and about ${money(s.ad)} in ads per sale (est.).${p.channel === 'own' ? '' : ` Using online store costs for now: ${CHANNELS[p.channel].name.toLowerCase()}.`}`;
}

/* ───────────── When Scout runs the search itself ───────────── */

export function autoStart(p: Profile, assumed: string[], target: Product | null): string {
  const brief = `${MARKETS[p.market].name}, ${money0(p.budget)}, ${CHANNELS[p.channel].name.toLowerCase()}`;
  const lines = [`On it: **${brief}**. I'll stop before anything is sent or paid.`];
  if (assumed.length) lines.push(`You didn't mention ${list(assumed)}, so I used my usual starting point. Change it in the bar above and I'll redo the work.`);
  if (target) lines.push(`You named the ${target.short}, so I'll go straight to its suppliers.`);
  if (splitOf(p) === 'stock' && !p.split) lines.push(`You already sell, so up to ${money0(capOf(p))} goes on stock and ${money0(p.budget - capOf(p))} stays back for samples.`);
  return lines.join('\n\n');
}

export function autoPick(run: Run): string {
  const top = run.fits[0];
  const second = run.fits.find((r) => r !== top && r.verdict.tier !== 'skip');
  const t = top.demand.trend;
  const why = `about ${money(top.stack.profit)} profit per sale${t > 0 ? `, demand up ${t}% in a year` : ''}, and a first order of ${money0(top.stack.firstOrder)} that fits your limit`;
  const runnerUp = !second ? ''
    : second.stack.profit > top.stack.profit ? ` The ${second.product.short} earns more per sale (${money(second.stack.profit)}), but ${second.verdict.reason}, so it comes second for your brief.`
    : ` The ${second.product.short} was my second choice at ${money(second.stack.profit)} per sale.`;
  return `I'm taking the **${top.product.short}** forward: ${why}.${runnerUp} Checking its suppliers next.`;
}

export const autoNoFit = (run: Run): Reply => ({
  text: "I've stopped here, because I won't take forward a product you can't afford to order. Raise the budget and I'll carry on.",
  chips: [
    { label: `Raise budget to ${money0(run.over[0].needsBudget)} and carry on`, act: { t: 'auto', text: `My budget is ${money0(run.over[0].needsBudget)}` }, rec: true },
  ],
});

export function autoWeak(run: Run): Reply {
  const p = run.profile;
  const top = run.fits[0];
  // Point to what would actually help: a category that has something worth testing, then another market. A budget change is only offered if it changes the verdict.
  const { views, best } = compareCategories(p);
  const alt = views.find((v) => v.id === best && v.id !== (p.category ?? 'pet') && v.lead);
  const bigger = Math.max(p.budget + 1500, Math.round(p.budget * 1.6 / 500) * 500);
  const helps = evaluate({ ...p, budget: bigger }).fits.some((r) => r.verdict.tier !== 'skip');
  const lines = [`I've stopped here. The best fit in ${CATEGORY_META[p.category ?? 'pet'].lower} is the ${top.product.short}, and my verdict on it is "${top.verdict.label}": ${top.verdict.reason}. I won't push a product forward that I wouldn't test myself.`];
  if (alt?.lead) lines.push(`In ${CATEGORY_META[alt.id].lower}, the **${alt.lead.product.short}** is worth a look at about ${money(alt.lead.stack.profit)} a sale.`);
  return {
    text: lines.join('\n\n'),
    chips: [
      ...(alt ? [{ label: `Look at ${CATEGORY_META[alt.id].lower}`, act: { t: 'category' as const, id: alt.id }, rec: true }] : []),
      otherMarket(p),
      ...(helps ? [{ label: `What if my budget was ${money0(bigger)}?`, act: { t: 'ask' as const, text: `What if my budget was ${money0(bigger)}?` } }] : []),
    ],
  };
}

export const autoNoSupplier = (): Reply => ({
  text: "I've stopped here. No supplier passes every check within your first order limit, so there is nobody I'd ask for a quote.",
  chips: [{ label: 'Back to products', act: { t: 'goto', stage: 'opportunities' }, rec: true }],
});

export const autoDraft = (n: number) =>
  `I've written the quote request to ${n === 1 ? 'the one supplier' : `all ${n}`} and opened it for you. **This is your call**: nothing leaves until you press Send.`;

export const autoPaused = (): Reply => ({
  text: "No problem, I've paused. The message is saved as a draft. Tell me to carry on whenever you're ready.",
  chips: [{ label: 'Open the message again', act: { t: 'draftInquiry' }, rec: true }, { label: 'Compare the suppliers', act: { t: 'compareSup' } }],
});

export const autoWait = () => 'In a real search, replies take a day or two. This is a prototype, so I\'ll skip ahead.';

export function autoFinal(picks: Quote[]): string {
  const total = picks.reduce((a, q) => a + q.sampleCost, 0);
  return `That is as far as I go on my own. Samples cost ${money0(total)}, so the request is open for you to approve or change.`;
}

/** The step the seller would most likely take next, shown when the conversation has wandered. */
export function nextStep(stage: string, o: { fits: number; top: string | null; topName?: string; alt?: CategoryId | null; shortlist: number; picks: number; total: number }): Chip | null {
  if (stage === 'category') return { label: 'Show products that fit my brief', act: { t: 'category' } };
  if (stage === 'opportunities') {
    // Only products worth considering count. With none, the useful step is somewhere else, never an empty comparison.
    if (o.fits >= 2) return { label: `Compare the top ${Math.min(3, o.fits)}`, act: { t: 'compare' } };
    if (o.fits === 1 && o.top) return { label: `Choose the ${o.topName ?? 'top product'}`, act: { t: 'choose', id: o.top } };
    if (o.alt) return { label: `Look at ${CATEGORY_META[o.alt].lower}`, act: { t: 'category', id: o.alt } };
    return { label: 'Compare regions', act: { t: 'compareMarkets' } };
  }
  if (stage === 'suppliers' && o.shortlist) return { label: o.shortlist === 1 ? 'Ask for a quote' : `Ask all ${o.shortlist} for a quote`, act: { t: 'draftInquiry' } };
  if (stage === 'waiting') return { label: 'Skip ahead 2 days', act: { t: 'skip' } };
  if (stage === 'quotes') return { label: 'Review my plan', act: { t: 'review' } };
  if (stage === 'decision' && o.picks) return { label: `Request ${o.picks} ${o.picks === 1 ? 'sample' : 'samples'} for ${money0(o.total)}`, act: { t: 'draftSamples' } };
  return null;
}

/** What Scout says when every region is laid side by side. */
export function marketCompare(c: MarketCompare, p: Profile, chosen: boolean): Reply {
  const here = c.views.find((v) => v.market.id === p.market)!;
  if (!c.best || !c.best.lead) {
    const near = Math.min(...c.views.map((v) => v.run.over[0]?.needsBudget ?? Infinity));
    return {
      text: `**Nothing is worth testing in any region at ${money0(p.budget)}.** ${Number.isFinite(near) ? `The nearest fit needs a budget of ${money0(near)}.` : ''}`,
      chips: Number.isFinite(near) ? [{ label: `Raise budget to ${money0(near)}`, act: { t: 'profile', patch: { budget: near } }, rec: true }] : undefined,
    };
  }
  const b = c.best;
  const lines = [`Across all ${c.views.length} regions, **${b.market.the}** looks strongest for your brief: ${c.why}.`];
  if (chosen && here !== b) {
    lines.push(here.lead
      ? `In ${here.market.the}, where you're set now, the ${here.lead.product.short} leads at ${money(here.lead.stack.profit)} per sale, with ${here.worth} worth testing.${here.market.id === 'BD' ? ` Import duty of about ${pct(here.market.duty.CN)} and lower shelf prices leave less per sale there, but Scout judges profit against local prices.` : ''}`
      : `In ${here.market.the}, where you're set now, nothing is worth testing at this budget.`);
  }
  const bd = c.views.find((v) => v.market.id === 'BD');
  if (bd && bd !== b && here !== bd) lines.push(`Bangladesh is harder for imported goods: duty of about ${pct(bd.market.duty.CN)} and lower shelf prices leave less per sale${bd.worth ? `, though the ${bd.lead?.product.short} still works there` : ''}.`);
  const chips: Chip[] = [];
  if (!chosen || here !== b) chips.push({ label: `Sell in ${b.market.the}`, act: { t: 'market', id: b.market.id }, rec: true });
  if (chosen && here === b) chips.push({ label: 'Keep my market', act: { t: 'ask', text: 'What should I do next?' } });
  return { text: lines.join('\n\n'), chips };
}
