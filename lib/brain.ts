import type { Chip, Ctx, Reply } from './acts';
import { CATEGORIES, categoryDetail, categoryOverview, findCategory, petGap } from './categories';
import { CATEGORY_META, CATEGORY_ORDER, CHANNELS, MARKETS, MARKET_ORDER, PRIORITIES, PRODUCTS, SPLITS, SPLIT_ORDER, SUPPLIERS, productById } from './data';
import { capFor, capOf, demandNote, shareOf, splitOf, diffRuns, evaluate, evaluateSuppliers, explain, pickSamples, quotesFor, stackFor, supplierFacts } from './engine';
import { list, money, money0, monthLabel, ordinal, pct, round2, trendText } from './format';
import { PROMOTION_EXPLAINED, VERIFIED_EXPLAINED, auditNote } from './promotion';
import { checkPoints } from './samples';
import { knowledge } from './knowledge';
import type { CategoryId, Channel, Experience, MarketId, Priority, Profile, ProductResult, Run, Split, SupRun } from './types';

/**
 * Scout's built-in language layer. It reads a typed message, works out what
 * the seller is asking, and answers from the engine. It needs no network,
 * so Scout stays useful when the live model is not connected.
 */

/* ───────────────────────── Reading the message ───────────────────────── */

const PRODUCT_WORDS: Record<string, RegExp> = {
  'travel-set': /travel|bottle|collapsib|bowl set/,
  'slow-feeder': /slow|feeder/,
  'led-collar': /\bled\b|collar|light[- ]up/,
  'lick-mat': /lick/,
  'groom-glove': /glove|groom|deshed/,
  'hair-roller': /hair (remover )?roller|pet hair|lint/,
  'cooling-mat': /cooling|cool mat/,
  'cat-perch': /perch|window|\bcat\b/,
  'dog-bed': /\bbed\b|orthop/,
  'herb-keeper': /herb/,
  'silicone-lids': /stretch lid|silicone lid|\blids\b/,
  'spice-jars': /spice/,
  'oil-sprayer': /oil spray|sprayer|mister/,
  'mixing-bowls': /mixing bowl/,
  'bag-clips': /bag clip|\bclips\b/,
  'resistance-bands': /resistance|\bbands?\b/,
  'jump-rope': /jump rope|skipping rope/,
  'ab-wheel': /ab wheel|ab roller/,
  'foam-roller': /foam roller/,
  'yoga-mat': /yoga/,
  'grip-trainer': /grip/,
  'cable-organiser': /cable organi[sz]er|cable clip/,
  'phone-stand': /phone stand|tablet stand/,
  'phone-wallet': /phone wallet|card holder/,
  'cleaning-kit': /cleaning kit|earbud clean/,
  'charging-stand': /charging stand|wireless charg|charger/,
  'ring-light': /ring light|selfie light/,
};
const SUPPLIER_WORDS: Record<string, RegExp> = {
  ningbo: /ningbo|hearth/,
  shenzhen: /shenzhen|loop|leash/,
  haiphong: /hai ?phong|petworks|vietnam/,
  xiamen: /xiamen|pawsome/,
  yiwu: /yiwu|brightpaw/,
  dongguan: /dongguan|silico/,
  foshan: /foshan|brightware/,
  keenline: /keenline|yangjiang/,
  saigon: /saigon|homecraft|ho chi minh/,
  easyhome: /easyhome|jinhua/,
  corepower: /corepower|nantong/,
  stride: /stride|quanzhou/,
  hanoi: /hanoi|activeworks/,
  flexgear: /flexgear|wenzhou/,
  voltway: /voltway|zhuhai/,
  linkcase: /linkcase|huizhou/,
  bacninh: /bac ?ninh|smartparts/,
  gadgetmart: /gadgetmart|guangzhou/,
};

/** A category with product data named in a message ("kitchen", "fitness gear", "phone accessories"). */
export function categoryIn(raw: string): CategoryId | null {
  const c = findCategory(raw);
  return c && (CATEGORY_ORDER as string[]).includes(c.id) ? (c.id as CategoryId) : null;
}
const MARKET_WORDS: [RegExp, MarketId][] = [
  [/\b(usa?|u\.s\.a?\.?|united states|america|states)\b/, 'US'],
  [/\b(germany|german|deutschland)\b/, 'DE'],
  [/\b(uk|u\.k\.|united kingdom|britain|england)\b/, 'UK'],
  [/\b(bangladesh|bd|dhaka|chittagong|chattogram)\b/, 'BD'],
];
const OTHER_PLACES = /\b(australia|canada|france|spain|italy|japan|india|uae|dubai|mexico|brazil|netherlands|sweden|poland|china|singapore|ireland|europe)\b/;

const mentioned = (text: string, table: Record<string, RegExp>) =>
  Object.entries(table)
    .map(([id, re]) => ({ id, at: text.search(re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.id);

/** Products and suppliers named in a message, in the order they appear. */
export function entities(raw: string): { products: string[]; suppliers: string[] } {
  const text = raw.toLowerCase();
  return { products: mentioned(text, PRODUCT_WORDS), suppliers: mentioned(text, SUPPLIER_WORDS) };
}

/** "the second one", "number 3", "the top product": a position in the list on screen, 0-based. */
function nthRef(text: string): number | null {
  const words: [RegExp, number][] = [[/\b(first|1st|top|best)\b/, 0], [/\b(second|2nd)\b/, 1], [/\b(third|3rd)\b/, 2], [/\b(fourth|4th)\b/, 3], [/\b(fifth|5th)\b/, 4]];
  if (/\b(one|product|option|supplier|pick|choice|result)\b/.test(text)) {
    for (const [re, i] of words) if (re.test(text)) return i;
  }
  const n = text.match(/(?:\bnumber|\bno\.?|#)\s?([1-5])\b/);
  return n ? Number(n[1]) - 1 : null;
}

const PRONOUN = /\b(it|its|that one|this one|that product|this product|that supplier|this supplier|them|they|their|those|these|same one)\b/;

function amounts(text: string): number[] {
  const out: number[] = [];
  const re = /[$£€]?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k\b)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const next = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (/^\s?%/.test(next)) continue;
    let n = Number(m[1].replace(/,/g, ''));
    if (m[2]) n *= 1000;
    out.push(n);
  }
  return out;
}

export const TAKA_PER_DOLLAR = 122;

/** Taka the way it is written in Bangladesh: ৳5,00,000. */
export function taka(n: number): string {
  const s = String(Math.round(n));
  if (s.length <= 3) return `৳${s}`;
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `৳${head},${s.slice(-3)}`;
}

/* How sellers usually open a conversation. */
const NEW_SELLER = /first[- ]time|new (merchant|seller|business|entrepreneur|to (this|selling|sourcing|e-?commerce|business|online))|i'?m new\b|beginner|never (sold|sourced|done this)|no (idea|experience)|just start(ing|ed)|starting (out|a (business|store|shop))|start(ing)? (my|a|an) (own )?(business|store|shop|brand)|want to start selling|(don'?t|do not) know (what|which) (product|to sell|to source|i should)|not sure what to (sell|source)/;
const EXISTING_SELLER = /already (sell|have (a|an|my) (store|shop|brand|business))|currently sell|i'?m (selling|an? (existing|experienced))|i (run|own|have) (a|an|my) (online |amazon |shopify |e-?commerce )?(store|shop|business|brand)\b|my (store|shop) (already )?sells|i'?ve (been selling|sold)|i have (been selling|sold)|existing (seller|merchant|store|shop|business|customer)|experienced (seller|merchant)|(add|adding|expand|grow|extend|widen)\b.*\b(product|range|line|catalog|catalogue)|new product (for|to) my|(current|my) (supplier|factory|manufacturer)|(better|cheaper|new|another|reliable|backup|second) (supplier|factory|manufacturer)|switch(ing)? suppliers?|replace (my|our) supplier/;
const WANTS_IDEA = /(sell|source|find) something (profitable|good|that sells)|profitable product|make money (selling|online)|(what|which) (product|products|items?) (should|could|to|can|would)|what (should|could|can) i (sell|source|stock|start with)|(product|item) ideas?|(find|suggest|recommend|pick)\b.*\b(product|something|what) to (sell|source)|(help|find|suggest|recommend)\b.*\b(product|idea)|(don'?t|do not) know (what|which)|no idea (what|which)|not sure what|new product|add (a |another |one more )?(new )?product|expand|grow (my|the) (range|catalog|catalogue)/;
const WANTS_SUPPLIER = /(better|cheaper|new|another|reliable|trustworthy|backup|second|good|right) (supplier|factory|manufacturer)|switch(ing)? suppliers?|replace (my|our) supplier|(current|my) (supplier|factory|manufacturer)\b.*\b(late|slow|unreliable|expensive|bad|poor|problem|issue|stopped|quality)|find(ing)? (a |me )?suppliers? for|source (it|this|them) from/;

/**
 * Reads how a seller opens: new or existing, and whether they want a product
 * idea or a supplier for something they already sell. Null when the message
 * is not an opening of this kind.
 */
export function opening(raw: string): { experience?: Experience; goal: 'idea' | 'suppliers' | null } | null {
  const text = raw.toLowerCase();
  const experience: Experience | undefined = NEW_SELLER.test(text) ? 'new' : EXISTING_SELLER.test(text) ? 'existing' : undefined;
  const goal = WANTS_SUPPLIER.test(text) ? 'suppliers' : WANTS_IDEA.test(text) ? 'idea' : null;
  return experience || goal ? { experience, goal } : null;
}

/** Pulls any part of a brief out of free text, so Scout only asks for what is missing. */
export function extractBrief(raw: string): { patch: Partial<Profile>; noData?: string } {
  const text = raw.toLowerCase();
  const patch: Partial<Profile> = {};
  for (const [re, id] of MARKET_WORDS) if (re.test(text)) { patch.market = id; break; }
  const place = text.match(OTHER_PLACES)?.[1];
  const taka = /taka|\btk\b|৳|\bbdt\b|\blakh|\blac\b/.test(text);
  if (taka) {
    // About 122 taka to the dollar. Budgets stay in dollars, like every other figure.
    const lakh = text.match(/(\d+(?:\.\d+)?)\s*(lakh|lac)/);
    const n = lakh ? Number(lakh[1]) * 100000 : amounts(text.replace(/৳/g, '')).find((x) => x >= 10000);
    if (n) patch.budget = Math.min(20000, Math.max(300, Math.round(n / TAKA_PER_DOLLAR / 50) * 50));
  } else {
    const big = amounts(text).find((n) => n >= 300);
    if (big) patch.budget = Math.min(20000, Math.round(big / 50) * 50);
  }
  let channel: Channel | undefined;
  if (/amazon|ebay|etsy|marketplace|walmart/.test(text)) channel = 'marketplace';
  else if (/shopify|own (online )?(store|site|shop|website)|my (store|site|website)|online store|dropship|instagram|tiktok|facebook/.test(text)) channel = 'own';
  else if (/retail|market stall|stall|boutique|wholesale|local shop/.test(text)) channel = 'retail';
  if (channel) patch.channel = channel;
  let experience: Experience | undefined;
  if (NEW_SELLER.test(text)) experience = 'new';
  else if (EXISTING_SELLER.test(text)) experience = 'existing';
  if (experience) patch.experience = experience;
  const pr: Priority[] = [];
  if (/low(er)? risk|safe|careful|can'?t afford to lose/.test(text)) pr.push('risk');
  if (/steady|stable|all year|consistent/.test(text)) pr.push('steady');
  if (/profit|margin|most money/.test(text)) pr.push('profit');
  if (/grow|trending|rising|fast[- ]growing/.test(text)) pr.push('growth');
  if (/simple|easy|small (first )?order|low moq/.test(text)) pr.push('simple');
  if (pr.length) patch.priorities = pr;
  return { patch, noData: !patch.market && place ? place[0].toUpperCase() + place.slice(1) : undefined };
}

/* ───────────────────────── Answering ───────────────────────── */

const theMarket = (p: Profile) => MARKETS[p.market].the;
const ask = (label: string, text = label): Chip => ({ label, act: { t: 'ask', text } });

export function stageChips(ctx: Ctx, run: Run): Chip[] {
  const top = run.fits[0];
  if (ctx.stage === 'start') return [{ label: 'Find a product idea', act: { t: 'start', entry: 'idea' }, rec: true }];
  if (ctx.stage === 'category' || ctx.stage === 'setup') return [{ label: 'Show products that fit my brief', act: { t: 'category' }, rec: true }, ask('What if my budget was $4,000?')];
  if (ctx.stage === 'pick') return [{ label: `Find suppliers for the ${run.fits[0]?.product.short ?? 'top product'}`, act: { t: 'choose', id: run.fits[0]?.product.id ?? run.results[0].product.id, force: true }, rec: true }];
  if (ctx.stage === 'suppliers') return [{ label: 'Ask for quotes', act: { t: 'draftInquiry' }, rec: true }, ask('Which supplier is safest?'), ask('What does a factory audit prove?')];
  if (ctx.stage === 'waiting') return [{ label: 'Skip ahead 2 days', act: { t: 'skip' }, rec: true }];
  if (ctx.stage === 'quotes') return [{ label: 'Review my plan', act: { t: 'review' }, rec: true }, ask('Which quote is best?')];
  if (ctx.stage === 'decision') return [{ label: 'Request samples', act: { t: 'draftSamples' }, rec: true }, ask('What could go wrong?')];
  if (ctx.stage === 'done') return [{ label: 'Open my plan', act: { t: 'plan' } }, ask('How do I check a sample?')];
  if (!top) return [ask('What is the smallest first order?')];
  return [ask(`Why is the ${top.product.short} first?`), ask('What if my budget was $4,000?'), ask('Which one has the smallest first order?')];
}

const GLOSSARY: [RegExp, (ctx: Ctx, r?: ProductResult) => string][] = [
  [/\bmoq\b|minimum order/, (_c, r) => `**MOQ** is the minimum order quantity: the fewest units a supplier will sell you at once.${r ? ` For the ${r.product.short} that is ${r.stack.moq} units, which costs ${money0(r.stack.firstOrder)} once shipping and duty are added.` : ''}`],
  [/landed/, (_c, r) => `**Landed cost** is what one unit costs by the time it reaches you: the supplier's price, plus shipping, plus import duty.${r ? ` For the ${r.product.short} it is ${money(r.stack.landed)} (${money(r.stack.cost)} + ${money(r.stack.ship)} + ${money(r.stack.duty)}).` : ''}`],
  [/duty|tariff|customs/, (c, r) => `**Import duty** is a tax your country charges on goods coming in. In ${theMarket(c.profile)} it is ${pct(MARKETS[c.profile.market].duty.CN, 1).replace('.0', '')} on these products from China.${r ? ` On the ${r.product.short} that is ${money(r.stack.duty)} per unit.` : ''}`],
  [/\bvat\b|sales tax/, (c, r) => MARKETS[c.profile.market].vat
    ? `In ${theMarket(c.profile)}, the shelf price shoppers see already includes ${pct(MARKETS[c.profile.market].vat)} sales tax, which goes to the government.${r ? ` On the ${r.product.short}, ${money(r.stack.tax)} of the ${money(r.stack.price)} price is tax.` : ''}`
    : 'In the US, sales tax is added at checkout on top of the shelf price, so it does not come out of your share. In Germany and the UK it sits inside the price.'],
  [/lead time|production time/, () => '**Lead time** is how long a supplier needs to make your order before it ships. Add roughly two to four weeks of sea freight on top. These are the suppliers\' own figures, so I label them as estimates.'],
  [/trading company|reseller|middleman/, () => 'A **trading company** buys from factories and resells. It can be fine for small orders, but you have less control over price and quality, and you may not know which factory made your goods.'],
  [/audit/, () => 'A **factory audit** means an inspector visited the factory and confirmed it exists, makes what it claims, and meets basic standards. It proves the supplier is real. It does not prove your product will be good, which is why samples still matter.'],
  [/sample/, () => 'A **sample** is one or two finished units sent to you before you order. It is the only way to check quality, and it usually costs $10 to $40 with shipping.'],
  [/margin/, (_c, r) => `**Margin** is profit as a share of the price.${r ? ` The ${r.product.short} keeps ${money(r.stack.profit)} of ${money(r.stack.price)}, a ${pct(r.stack.margin)} margin.` : ''}`],
  [/promot(ed|ion|e)\b|sponsored/, () => PROMOTION_EXPLAINED],
  [/orvane verified|verified audit/, () => VERIFIED_EXPLAINED],
  [/verified|estimate|unknown|label|dots?\b/, () => 'Every figure carries one of three labels. **Verified**: Orvane has checked it, like a licence or an order count. **Estimate**: I calculated it from market data, like profit or ad cost. **Unknown**: nobody can know it yet, like quality before a sample.'],
  [/break[- ]?even/, (_c, r) => r && r.stack.profit > 0 ? `**Break-even** is the point where sales have paid back what you spent. For the ${r.product.short} that is ${r.stack.breakEvenUnits} of ${r.stack.moq} units.` : '**Break-even** is the point where sales have paid back what you spent.'],
];

function describe(r: ProductResult, run: Run): string {
  const e = explain(r, run);
  const head = `**${r.verdict.label}${r.verdict.reason ? `: ${r.verdict.reason}` : ''}.**`;
  return `${head}\n\n${e.points.slice(0, 2).map((p) => p.text).join(' ')}\n\nMain risk: ${e.risk.text}`;
}

function stackLines(r: ProductResult, p: Profile): string {
  const s = r.stack;
  const rows = [
    `Shelf price ${money(s.price)}`,
    ...(s.tax ? [`Sales tax −${money(s.tax)}`] : []),
    `Unit cost −${money(s.cost)}`,
    `Shipping −${money(s.ship)}`,
    `Import duty −${money(s.duty)}`,
    `${p.channel === 'marketplace' ? 'Marketplace fee' : 'Card fees'} −${money(s.fees)}`,
    `Ads per sale −${money(s.ad)} (my biggest guess)`,
    `Returns −${money(s.returns)}`,
  ];
  return `${rows.map((x) => `- ${x}`).join('\n')}\n\nThat leaves **${money(s.profit)} per sale**.`;
}

/** Questions that ask for the best product on one measure. */
const by = (get: (r: ProductResult) => number, dir: 1 | -1) => (rs: ProductResult[]) => [...rs].sort((a, b) => dir * (get(a) - get(b)));
const SUPERLATIVES: { re: RegExp; sort: (rs: ProductResult[], p: Profile) => ProductResult[]; says: (r: ProductResult) => string }[] = [
  { re: /(fewest|lowest|least|low(er)?) returns?|returned (the )?least|sent back (the )?least/, sort: by((r) => r.product.returns, 1), says: (r) => `has the fewest returns: about ${pct(r.product.returns)} of orders come back` },
  { re: /(least|less|not( so| too)?) (crowded|competitive|saturated)|(lowest|least|less|fewest) (competition|sellers|competitors|rivals)/, sort: by((r) => r.crowd, 1), says: (r) => `is the least crowded, at ${Math.round(r.crowd)} on my 0 to 100 crowding scale` },
  { re: /fast(est)?[- ]?(grow|ris)|grow(ing|s)? (the )?(fastest|quickest|most)|trending|what'?s hot|(biggest|most|highest) (rise|growth)/, sort: by((r) => r.demand.trend, -1), says: (r) => `is growing fastest: demand is ${trendText(r.demand.trend).toLowerCase()} over 12 months` },
  { re: /(most|highest|biggest|strongest|best|largest) demand|sells? (the )?(most|best)|selling (well|best)|most popular|best[- ]sell/, sort: by((r) => r.demand.level, -1), says: (r) => `has the most demand, at ${Math.round(r.demand.level)} on my 0 to 100 demand scale` },
  { re: /steadiest|most (steady|stable|consistent|reliable)|least seasonal|sells all year/, sort: by((r) => r.demand.vol, 1), says: (r) => `has the steadiest sales through the year (${demandNote(r)})` },
  { re: /(cheapest|lowest|least|easiest|easy) (to ship|shipping)|lightest|smallest to ship|small and light/, sort: by((r) => r.stack.ship, 1), says: (r) => `is the cheapest to ship, at ${money(r.stack.ship)} a unit` },
  { re: /(quickest|fastest|soonest|earliest) (to )?(break[- ]?even|pay ?back|money back|pay for itself)|pays? (back|for itself) (the )?(fastest|soonest|quickest)/, sort: by((r) => (r.stack.profit > 0 ? r.stack.breakEvenUnits / r.stack.moq : 99), 1), says: (r) => `pays back soonest: you have your money back after ${r.stack.breakEvenUnits} of ${r.stack.moq} units` },
  { re: /safest|lowest[- ]risk|least risk|best for (a |an )?(beginner|first[- ]timer|new seller)|easiest (to start|for a beginner)/, sort: (_rs, p) => evaluate({ ...p, priorities: ['risk', 'simple'] }).fits, says: (r) => `is the safest start: ${r.verdict.reason}` },
];

/** Reads every change in one message, so "$4,000 in Germany on Amazon" is one scenario, not three questions. */
function scenario(text: string, p: Profile, nums: number[]): { patch: Partial<Profile>; ad?: number; price?: number; parts: string[] } {
  const { patch: found } = extractBrief(text);
  const patch: Partial<Profile> = {};
  const parts: string[] = [];
  if (found.market && found.market !== p.market) { patch.market = found.market; parts.push(`${MARKETS[found.market].the} as your market`); }
  if (found.budget && found.budget !== p.budget && /budget|afford|spend|have|had|invest|put in|\$|£|€/.test(text)) { patch.budget = found.budget; parts.push(`a ${money0(found.budget)} budget`); }
  if (found.channel && found.channel !== p.channel) { patch.channel = found.channel; parts.push(found.channel === 'marketplace' ? 'selling on a marketplace' : found.channel === 'own' ? 'selling through your own store' : 'selling through local retail'); }
  let ad: number | undefined;
  let price: number | undefined;
  const adMatch = text.match(/(?:\bads?\b|advertis\w*|\bcpa\b)[^.\d$£€]{0,24}[$£€]?\s?(\d+(?:\.\d+)?)/) ?? text.match(/[$£€]?\s?(\d+(?:\.\d+)?)\s?(?:per sale )?(?:in |on |for )?(?:ads?\b|advertis)/);
  if (adMatch && Number(adMatch[1]) < 100) { ad = Number(adMatch[1]); parts.push(`ads at ${money(ad)} per sale`); }
  const priceMatch = text.match(/(?:sell (?:it|them|that|this)? ?(?:for|at)|priced? (?:it |them )?at|charg\w* |shelf price (?:of|at|was|is)?|retail(?:s|ed)? (?:for|at))\s?[$£€]?\s?(\d+(?:\.\d+)?)/);
  if (priceMatch && Number(priceMatch[1]) >= 3 && Number(priceMatch[1]) < 300 && Number(priceMatch[1]) !== ad) { price = Number(priceMatch[1]); parts.push(`a ${money(price)} shelf price`); }
  void nums;
  return { patch, ad, price, parts };
}

const SUP_STAGES = ['suppliers', 'waiting', 'quotes', 'decision', 'done'];
const isQuestion = (text: string) => /\?\s*$/.test(text) || /^(what|why|how|which|who|when|where|is|are|does|did|can|could|should|would|will|has|have)\b/.test(text) || /^do (i|you|we|they|these|those|the|any|all|suppliers)\b/.test(text);

/** Works out which product and supplier a message is about, using names, positions ("the second one") and what was discussed last. */
function resolve(text: string, ctx: Ctx, run: Run) {
  const here = new Set(run.results.map((r) => r.product.id));
  const prods = mentioned(text, PRODUCT_WORDS).filter((id) => here.has(id));
  const sups = mentioned(text, SUPPLIER_WORDS);
  const supStage = SUP_STAGES.includes(ctx.stage);
  const nth = nthRef(text);
  const aboutSupplier = /supplier|factory|vendor|manufacturer/.test(text) || (supStage && !/product/.test(text));
  let nthProduct: string | null = null;
  let nthSupplier: string | null = null;
  if (nth !== null) {
    if (aboutSupplier && ctx.productId) nthSupplier = evaluateSuppliers(ctx.productId, ctx.profile).results[nth]?.supplier.id ?? null;
    else nthProduct = run.fits[nth]?.product.id ?? null;
  }
  const subjectId = prods[0] ?? nthProduct ?? ctx.focusProductId ?? ctx.recall?.productId ?? ctx.productId ?? run.fits[0]?.product.id ?? run.results[0].product.id;
  const supplierId = sups[0] ?? nthSupplier ?? ctx.focusSupplierId ?? (PRONOUN.test(text) ? ctx.recall?.supplierId ?? null : null);
  return { prods, sups, supStage, subjectId, supplierId, named: Boolean(prods[0] ?? nthProduct), namedSupplier: Boolean(sups[0] ?? nthSupplier), nthProduct };
}

/**
 * Things the seller tells Scout to do, rather than asks. These are handled
 * at once, with no model, so "choose the slow feeder" or "ask them for
 * quotes" works like a tap.
 */
/**
 * A question about the first-order limit itself ("why is my first order only
 * $1,750?", "why 1750 when my budget is 2500"). These name amounts, so they
 * must be caught before anything reads the amount as a new budget.
 */
export const LIMIT_Q = /(first order|order) (limit|cap)|first order (is |only |just )?(limited|capped|only|just|under|so (low|small))|why (only|just) \$?[\d,]+|why (is |does |did )?(my |the |your )?first order|why \$?[\d,]+( usd| dollars)? when|(use|spend|put) (all|100%|the whole|my whole|all of) (of )?(my )?(budget|\$?[\d,]+)|keep (some|30%|money) back|(why|what).*(30|thirty|70|seventy) ?%|what does over (budget|the limit|limit) mean|why (is|are) .* over (budget|my limit)|less than my budget|not (my )?(whole|full|entire) budget/;

function budgetRule(p: Profile, run: Run): Reply {
  const sp = splitOf(p);
  const why = sp === 'stock' ? 'pays for samples and a buffer' : 'pays for samples, launch ads and a buffer';
  const how = p.split ? 'the split you chose' : p.experience === 'existing' ? 'my pick for an existing seller' : 'my pick for a first launch';
  return {
    text: `Your split is **${SPLITS[sp].name}** (${how}): up to **${pct(shareOf(p))} of your budget** on the first order, so ${money0(run.cap)} of ${money0(p.budget)}. The other ${money0(p.budget - run.cap)} ${why}. Spending it all on stock is the most common way first orders go wrong: the goods arrive and there's nothing left to sell them with, so I never go above ${pct(SPLITS.stock.share)}.`,
    chips: SPLIT_ORDER.filter((x) => x !== sp).map((x) => ({ label: `${SPLITS[x].name}, ${pct(SPLITS[x].share)} on stock`, act: { t: 'profile' as const, patch: { split: x } } })),
  };
}

/** "Use more for stock", "play it safe": change the split. */
const SPLIT_ASK: [RegExp, Split][] = [
  [/play it safe|careful split|keep more (money )?back|less (money )?(on|for) stock|(60|sixty) ?% (on|for) stock|safer split/, 'safe'],
  [/balanced split|back to (the )?(default|balanced|70)|(70|seventy) ?% (on|for) stock/, 'balanced'],
  [/(more|most) (money )?(on|for|into) stock|already (have|pay for) (ad|ads|marketing)( money| budget)?|(80|85|90) ?% (on|for|into) stock|more stock split|bigger first order|ads (are )?paid (from|with) other money/, 'stock'],
];

/** A product named from another category: say where it lives and offer to go there. */
function elsewhere(text: string, ctx: Ctx, run: Run): Reply | null {
  const named = mentioned(text, PRODUCT_WORDS);
  if (!named.length || named.some((id) => run.results.some((r) => r.product.id === id))) return null;
  const pr = productById(named[0])!;
  const c = CATEGORY_META[pr.category];
  return {
    text: `The ${pr.short.toLowerCase()} is in ${c.lower}, and you're looking at ${CATEGORY_META[ctx.profile.category ?? 'pet'].lower}.`,
    chips: [{ label: `Look at ${c.lower}`, act: { t: 'category', id: pr.category }, rec: true }],
  };
}

export function command(raw: string, ctx: Ctx): Reply | null {
  const text = raw.toLowerCase().trim().replace(/^(please|pls|ok(ay)?|scout|hey scout|can you|could you|would you|i want you to|i'?d like you to|go ahead and)[, ]+/g, '').replace(/[.!]+$/, '');
  const p = ctx.profile;
  const run = evaluate(p);
  const { prods, supStage, subjectId, supplierId, named, namedSupplier, nthProduct } = resolve(text, ctx, run);
  const q = isQuestion(text);
  const top = run.fits[0];
  const away = elsewhere(text, ctx, run);
  if (away && !q) return away;
  // Changing the split is an instruction; asking about the limit is a question, never a new budget.
  const wantSplit = SPLIT_ASK.find(([re]) => re.test(text))?.[1];
  if (wantSplit && !/^(why|what|how)\b/.test(text)) {
    if (splitOf(p) === wantSplit && p.split) return { text: `You're already on **${SPLITS[wantSplit].name}**: up to ${money0(capOf(p))} on stock.` };
    const next = { ...p, split: wantSplit };
    const tight = wantSplit === 'stock' && p.experience === 'new';
    return {
      text: tight ? `Done. That leaves ${money0(p.budget - capOf(next))} for samples and ads, which is tight for a first launch. Say "careful split" any time to switch back.` : '',
      acts: [{ t: 'profile', patch: { split: wantSplit } }],
    };
  }
  if (LIMIT_Q.test(text)) return null;

  /* Hand the whole search to Scout, or take it back */
  if (ctx.auto && /^(stop|pause|wait|hold on|hang on|cancel|not yet|let me)\b/.test(text)) return { text: '', acts: [{ t: 'stopAuto' }] };
  if (/\bauto[- ]?pilot\b|\b(do|run|handle|finish|complete) (it|this|that|everything|the rest|all of it|the whole thing|the search)( for me)?$|take it from here|take over|you (decide|choose|pick)( for me)?$|^(just )?(do it|run it)( for me)?$|^(carry on|keep going|resume)( from here)?$|go all the way|surprise me|find me (the best|something|a (good )?product|what to sell)/.test(text) && !q) {
    if (ctx.samplesRequested) return { text: 'This search is finished: your samples are requested. Start a new search and I can run that one for you.', chips: [{ label: 'Start a new search', act: { t: 'reset' } }] };
    return { text: '', acts: [{ t: 'auto' }] };
  }

  /* One step forward */
  if (/^(next|next step|continue|go on|proceed|move on|go ahead)$/.test(text)) {
    const c = stageChips(ctx, run).find((x) => x.rec && x.act.t !== 'ask');
    if (c) return { text: '', acts: [c.act] };
    if (ctx.stage === 'opportunities' && run.fits.filter((r) => r.verdict.tier !== 'skip').length >= 2) return { text: 'The next step is to choose a product. Here are my top picks side by side.', acts: [{ t: 'compare' }] };
  }

  /* Every region side by side */
  if (/(compare|all|every|each|other)\b.*\b(regions?|markets?|countries)|which (market|country|region)|where (should|could|can|do) i sell|best (market|country|region|place to sell)|regions? side by side/.test(text)) {
    return { text: '', acts: [{ t: 'compareMarkets' }] };
  }

  /* Start again */
  if (/^(start (over|again|a new search)|restart|reset|new search|from scratch|begin again)$/.test(text)) return { text: '', acts: [{ t: 'reset' }] };

  /* Moving around */
  if (/back to (the |my )?(products?|list|ranking|ideas)|(change|switch|different|another|pick another) (the |my )?product$|see (the |all )?products/.test(text) && !q) {
    if (['start', 'setup'].includes(ctx.stage)) return null;
    if (['category', 'pick'].includes(ctx.stage)) return { text: '', acts: [{ t: 'category' }] };
    return { text: ctx.contacted.length ? 'Back to the product list. Your quotes stay where they are unless you choose a different product.' : 'Back to the product list.', acts: [{ t: 'goto', stage: 'opportunities' }] };
  }
  if (/back to (the |my )?suppliers?/.test(text) && ctx.productId) return { text: 'Back to the suppliers.', acts: [{ t: 'goto', stage: 'suppliers' }] };
  if (/back to (the |my )?quotes?/.test(text) && ctx.quotesReady) return { text: 'Back to the quotes.', acts: [{ t: 'goto', stage: 'quotes' }] };
  if (/(show|see|look at|list)( me)?( the| all)? (products|options|ideas)( that fit)?/.test(text) && ['category', 'setup', 'pick'].includes(ctx.stage) && !q) return { text: '', acts: [{ t: 'category' }] };

  /* The plan */
  if (/(review|finali[sz]e|wrap up|sum up|summari[sz]e)( my| the)? (plan|search|decision)|^(review|wrap (it )?up)$/.test(text) && !q) {
    if (ctx.quotesReady) return { text: '', acts: [{ t: 'review' }] };
    return { text: 'The plan comes together once quotes are in. Here is the step before that.', chips: stageChips(ctx, run) };
  }
  if (/(open|show|see|view)( me)?( my| the)? (plan|progress)|what have (we|i) done|where are we/.test(text)) return { text: 'Here is your plan so far.', acts: [{ t: 'plan' }] };

  /* Samples */
  if (/\b(request|order|get|buy|send for|pay for)\b( me)?( the| my| some| those| both)? samples?/.test(text) && !q) {
    if (ctx.samplesRequested) return { text: 'Your samples are already requested. They usually arrive in 7 to 10 days.', chips: stageChips(ctx, run) };
    if (ctx.quotesReady) return { text: 'Here is the sample request. Nothing is paid until you approve it.', acts: [{ t: 'draftSamples' }] };
    return { text: 'Samples come after the quotes, because sample prices arrive with them. Here is the step before that.', chips: stageChips(ctx, run) };
  }

  /* Quotes */
  if ((/\b(ask|request|get)\b.*\b(quotes?|prices?|pricing)\b|\bcontact (them|the suppliers?|all|these|those|both)|\b(send|draft|write|prepare) (the |an? |my )?(inquiry|enquiry|message|email|quote request|request)|reach out to|\bmessage (them|the suppliers?|all)/.test(text)) && !q) {
    if (ctx.quotesReady) return { text: 'The quotes are already in.', chips: stageChips(ctx, run) };
    if (ctx.stage === 'waiting') return { text: `Already sent to ${ctx.contacted.length} suppliers. Replies are not in yet.`, chips: stageChips(ctx, run) };
    if (ctx.productId && ctx.stage === 'suppliers') return { text: 'Here is the message. Nothing is sent until you approve it.', acts: [{ t: 'draftInquiry' }] };
    return top
      ? { text: 'I need a product before I can ask its suppliers. My pick for your brief is below.', chips: [{ label: `Find suppliers for the ${top.product.short}`, act: { t: 'choose', id: top.product.id }, rec: true }] }
      : { text: 'I need a product before I can ask its suppliers, and nothing fits your budget yet.', chips: stageChips(ctx, run) };
  }
  if (/skip (ahead|forward|the wait)|fast[- ]?forward|jump ahead|(two|2) days later/.test(text) && ctx.stage === 'waiting') return { text: '', acts: [{ t: 'skip' }] };

  /* Choosing a product */
  const picks = /\b(choose|pick|select|go with|proceed with|continue with|lock in|i'?ll (take|go with|choose|pick|have)|let'?s (go with|do|pick|choose|take|try)|i want the|give me the|take the)\b/.test(text);
  const wantsSuppliers = /(find|get|show|check|who are the|list)( me)?( the| some| any)? (suppliers?|factories|manufacturers|vendors)|who (makes|sells|supplies)|where (can|do) i (buy|get|source)/.test(text);
  if (!q && (picks || wantsSuppliers) && !(supStage && namedSupplier) && !['start', 'setup'].includes(ctx.stage)) {
    const explicit = prods.length === 1 || nthProduct ? subjectId : null;
    if (picks && !explicit && !wantsSuppliers) return null;
    const id = explicit ?? ctx.productId ?? top?.product.id;
    if (!id) return { text: 'Nothing fits your budget yet, so there is no product to take forward.', chips: stageChips(ctx, run) };
    if (!explicit && ctx.productId && supStage) return { text: 'Back to the suppliers.', acts: [{ t: 'goto', stage: 'suppliers' }] };
    const r = run.results.find((x) => x.product.id === id)!;
    return { text: explicit ? '' : `You haven't chosen a product, so I'll use my top pick for your brief: the ${r.product.short}.`, acts: [{ t: 'choose', id }] };
  }

  /* Opening things */
  if (/^(open|show|see|view|look at|pull up|bring up)\b/.test(text)) {
    if (namedSupplier && supplierId) return { text: '', acts: [{ t: 'openSupplier', id: supplierId }] };
    if (named) return { text: '', acts: [{ t: 'open', id: subjectId, maths: /math|cost|break ?down|numbers|working/.test(text) }] };
  }
  if (/^keep (the|my|it|this|that|going with)/.test(text) && ctx.productId) {
    const r = run.results.find((x) => x.product.id === ctx.productId)!;
    return { text: `Staying with the ${r.product.short}. I'll flag it again if the numbers get worse.`, chips: stageChips(ctx, run).slice(0, 2) };
  }
  return null;
}

export function answer(raw: string, ctx: Ctx): Reply {
  const text = raw.toLowerCase().trim();
  const p = ctx.profile;
  const run = evaluate(p);
  const { prods, sups, supStage, subjectId, supplierId: resolvedSupplier, namedSupplier } = resolve(text, ctx, run);
  const supNamed = sups.length > 0 || namedSupplier;
  if (LIMIT_Q.test(text)) return budgetRule(p, run);
  const away = elsewhere(text, ctx, run);
  if (away) return away;
  const nums = amounts(text);
  const subject = run.results.find((r) => r.product.id === subjectId)!;
  const supProductId = ctx.productId ?? subjectId;
  const wantsChange = (/\b(switch|change|set|use|move|make it|go with|update|raise|lower|increase|reduce|drop)\b/.test(text) || /\b(i want to|i'?ll|i will|i'?m going to|i plan to|i sell|i'?m selling|my budget is|i have)\b/.test(text)) && !/what if|what about|would|could|how about|\?$/.test(text);
  const early = ['start', 'setup', 'category', 'pick'].includes(ctx.stage);

  /* Too short to read */
  if (text.replace(/[^a-z0-9$]/g, '').length < 3) {
    return { text: 'What would you like to know? You can ask about any product, supplier or cost, or take the next step below.', chips: stageChips(ctx, run) };
  }

  /* The wider journey: rules, shipping, paying, protecting an order, after launch */
  const known = knowledge(text, ctx, run, subject);
  if (known) return known;

  /* How Scout chooses which products to show */
  if (/how (do|does|did|will) (you|scout) (pick|choose|select|rank|decide|find|sort|recommend)|how (are|were|is) (the )?(products?|picks?|ideas?) (picked|chosen|ranked|selected|sorted)|why (these|this order|this ranking)|what decides (the )?(rank|order)/.test(text)) {
    const top = run.fits[0];
    return {
      text: `I judge every product on what you'd actually keep, after every cost:

- **Profit per sale** in your market, after supplier price, shipping, duty, fees, ads and returns
- **Fit with your budget**: the first order has to stay within ${money0(capOf(p))}, so a mistake can't sink you
- **Demand**: how many people search for it, and whether that is steady or a spike
- **Risk**: returns, how crowded it is, and how much room there is if ads cost more than expected

Your priorities (${list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase())) || 'none set'}) decide which of these counts most. Paid listings never move a product up, and I tell you when one isn't worth buying.${top && ctx.stage !== 'start' ? ` With ${money0(p.budget)} in ${theMarket(p)}, the **${top.product.short}** comes out on top.` : ctx.stage === 'start' ? ' Tell me where you sell and your budget, and I\'ll show you the ranking.' : ''}`,
      chips: stageChips(ctx, run).slice(0, 2),
    };
  }

  /* What now, before any products are on screen */
  if (early && (/what (should|do|can) i|what now|what next|next step|then what|than what|where do i start|how do i start|help me/.test(text) || WANTS_IDEA.test(text))) {
    const top = run.fits[0];
    return {
      text: top
        ? `Next, look at the products that fit your brief. With ${money0(p.budget)} in ${theMarket(p)}, ${run.fits.length} pet ${run.fits.length === 1 ? 'product fits' : 'products fit'}, led by the **${top.product.short}** at about ${money(top.stack.profit)} per sale.`
        : `With ${money0(p.budget)}, nothing fits yet: the smallest first order is ${money0(run.over[0].stack.firstOrder)}. You can raise the budget, or look at the list anyway to see what each needs.`,
      chips: top ? stageChips(ctx, run) : [{ label: `Raise budget to ${money0(run.over[0].needsBudget)}`, act: { t: 'profile', patch: { budget: run.over[0].needsBudget } }, rec: true }, { label: 'Show the products anyway', act: { t: 'category' } }],
    };
  }

  /* Small talk */
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(text) && text.length < 30) {
    return { text: 'Hello. Ask me anything about these products or suppliers, or pick a next step below.', chips: stageChips(ctx, run) };
  }
  if (/^(thanks|thank you|cheers|great|perfect|ok(ay)?|cool|nice)\b/.test(text) && text.length < 40) {
    return { text: 'Glad to help. Here is what I would do next.', chips: stageChips(ctx, run) };
  }

  /* Clearly outside sourcing */
  if (/\b(flight|hotel|weather|joke|poem|recipe|news|stock market|crypto|bitcoin|translate|write (me )?(a|an|some)|song|movie|football|election|president|horoscope)\b/.test(text)) {
    return { text: "That is outside what I do. I work on what to sell and whom to buy it from, using Orvane's simulated marketplace data. Here is what I can help with right now:", chips: stageChips(ctx, run) };
  }

  /* ───── Questions sellers ask most, answered before the general rules ───── */
  {
    const sr = ctx.productId ? evaluateSuppliers(ctx.productId, p) : null;
    const chosen = ctx.productId ? run.results.find((r) => r.product.id === ctx.productId)! : null;
    const nextChip = stageChips(ctx, run).filter((c) => c.act.t !== 'ask').slice(0, 1);

    // About Scout and Orvane
    if (/\bare you (an? )?(ai|bot|robot|human|real person|person)\b|am i (talking|chatting) (to|with) (a|an) (ai|bot|human|person)/.test(text)) {
      return { text: "Yes, I'm an AI sourcing agent. I don't guess numbers: every figure comes from Orvane's data and the same maths you see on screen. I can't send anything or spend money without your approval.", chips: stageChips(ctx, run).slice(0, 2) };
    }
    if (/\b(is (this|it|scout) free|cost (me )?anything to use|do i (have to )?pay (for|to use) (you|scout|this)|how (do|does) (you|orvane|scout) make money|what'?s (the|your) business model|subscription)\b/.test(text)) {
      return { text: "In this concept, Scout is free for sellers. Orvane earns from suppliers in three ways: a fee on completed orders, paid promotion, and Orvane Verified factory audits.\n\n- **Promotion** buys visibility when you browse Orvane, and a richer profile. It never changes my ranking.\n- **Orvane Verified** audits are run by independent inspectors. A passed audit is real evidence, so it can move a supplier up.\n\nOrvane only earns from suppliers because buyers trust what they see, so it can't sell the ranking itself.", chips: stageChips(ctx, run).slice(0, 1) };
    }
    if (/can i (trust|rely on) (you|this|these|the numbers|your numbers)|where (does|do) (the|this|your) (data|numbers|information) come from|how (accurate|reliable) (is|are)/.test(text)) {
      return { text: "Each figure carries a label so you can judge it. **Verified** means Orvane has checked it, like a licence or an order count. **Estimate** means I calculated it, like profit or ad cost. **Unknown** means nobody can know it yet, like quality before a sample.\n\nIn this prototype the data itself is simulated, so treat the numbers as a demonstration.", chips: stageChips(ctx, run).slice(0, 1) };
    }

    // Categories: compared at category level, honest that only pet supplies has product data
    const inCat = ['start', 'setup', 'category', 'pick'].includes(ctx.stage);
    if (/(why not|what about|how about|other|another|different|else|compare|which|best|all|more) (an?other |other |different )?categor|categor(y|ies) (should|would|is|are) (best|better|good)|why (pet|this category|pet supplies)|what'?s (so )?good about pet|only pets?\b|what else (can|could) i sell/.test(text)) {
      if (/why (pet|this category|pet supplies)|what'?s (so )?good about pet|only pets?\b/.test(text)) return categoryDetail(CATEGORIES[0], p, inCat);
      return categoryOverview(p, inCat);
    }
    const cat = findCategory(text);
    if (cat && cat.id !== 'pet' && !prods.length) return categoryDetail(cat, p, inCat);
    if (cat && cat.id === 'pet' && !prods.length && /\b(dog|cat|pet) (toys?|food|treats?|clothes|leash(es)?|harness(es)?|shampoo|litter|carriers?|crates?|cages?|houses?|tags?|brush(es)?)\b/.test(text)) return petGap(text, PRODUCTS.map((x) => ({ id: x.id, short: x.short })));


    // Order size
    if (/(order|buy|start with) (less|fewer|smaller|under|below) (than )?\d*|(smaller|smallest|minimum) (first )?order|how (much|many) (stock|units|inventory) (do|should|would) i (need|buy|order)|how much (stock|inventory)/.test(text)) {
      const s = subject.stack;
      const small = sr ? [...sr.results].filter((r) => r.tier === 'shortlist' || r.tier === 'ask').sort((a, b) => a.moq - b.moq)[0] : null;
      return { text: `Suppliers set a minimum order. For the ${subject.product.short} it's usually **${s.moq} units**, about ${money0(s.firstOrder)} landed.${small && small.moq < s.moq ? ` ${small.supplier.short} accepts ${small.moq}, which brings the first order down to ${money0(small.stack.firstOrder)}.` : ''} I wouldn't buy more than the minimum the first time: sell through it, then reorder.` , chips: small ? [{ label: `Open ${small.supplier.short}`, act: { t: 'openSupplier', id: small.supplier.id } }] : undefined };
    }

    // Time to money
    if (/how long (until|till|before|to) (i )?(make|see|get|earn) (money|profit|a profit|my money back)|when (will|do|would) i (make|start making|see) (money|profit)|how (soon|quickly|fast) (can|will|do) i (make|earn|profit)/.test(text)) {
      const s = subject.stack;
      return { text: `Roughly two months before the first sale: about a week for quotes and samples, then production and three to four weeks at sea. After that it depends on how fast you sell. With the ${subject.product.short}, you've made your ${money0(s.firstOrder)} back after **${s.breakEvenUnits} sales**. At three sales a day, that's about ${Math.ceil(s.breakEvenUnits / 3)} days after launch.` };
    }
    if (/(per|a|each|every) (month|week|day)\b|monthly|weekly|income|salary/.test(text) && /(earn|make|profit|income|money)/.test(text)) {
      const s = subject.stack;
      return { text: `I can't know how fast it will sell, so here's the maths instead. The ${subject.product.short} leaves about ${money(s.profit)} a sale:\n\n- 1 sale a day: about **${money0(s.profit * 30)}** a month\n- 3 sales a day: about **${money0(s.profit * 90)}** a month\n- 10 sales a day: about **${money0(s.profit * 300)}** a month\n\nYour first order of ${s.moq} units caps the early months until you reorder. Ad cost is my biggest guess behind every one of these.` };
    }

    // Pricing
    if (/what (price|should i (charge|sell (it|this|them)? ?(for|at)))|how much should i (charge|sell)|(best|right|good|ideal) price|price (it|this) at\??$/.test(text) && !nums.length) {
      const s = subject.stack;
      const floor = round2(s.price - s.profit + 0.5);
      return { text: `Shops in ${theMarket(p)} sell the ${subject.product.short} for about **${money(s.price)}**, and that's what my numbers assume. Below about ${money(floor)} you'd stop making money once ads and fees are paid. Pricing above the market can work with better photos and reviews, but expect slower sales at first.`, chips: [ask(`What if I sell it for ${money(Math.round(s.price * 1.2) - 0.01)}?`, `What if I sell the ${subject.product.short} for ${money(Math.round(s.price * 1.2) - 0.01)}?`)] };
    }

    // Product risk, competition, avoid
    if (/(main |biggest |what('?s| is| are) the )risks? (with|of|for|in)|what could go wrong with (the |this )?(product|it)|downside of/.test(text) && !supStage) {
      const e = explain(subject, run);
      return { text: `For the ${subject.product.short}: ${e.risk.text}${subject.verdict.tier !== 'worth' && subject.verdict.reason ? `\n\nMy verdict is "${subject.verdict.label}" because ${subject.verdict.reason}.` : ''}`, chips: [{ label: 'See the maths', act: { t: 'open', id: subject.product.id, maths: true } }] };
    }
    if (/(competitive|competition|crowded|saturated|how many (sellers|competitors))/.test(text) && !/least|less|lowest|fewest/.test(text)) {
      const c = subject.crowd;
      return { text: `The ${subject.product.short} scores **${c} of 100** for crowding in ${theMarket(p)}. ${c >= 80 ? 'That is very crowded: many sellers offer near-identical versions, so ads cost more and price wars are common.' : c >= 55 ? 'That is busy but workable, if your photos and page stand out.' : 'That leaves room to stand out.'} It's listed by ${subject.product.listings} suppliers on Orvane.` };
    }
    if (/what (would|should) (you|i) (avoid|skip|not (buy|sell))|which (ones?|products?) (to|should i) (avoid|skip)|what not to (buy|sell)|which are bad/.test(text)) {
      const bad = run.results.filter((r) => r.verdict.tier === 'skip');
      return bad.length
        ? { text: `I'd skip ${bad.length === 1 ? 'one' : bad.length}:\n${bad.map((r) => `- **${r.product.short}**: ${r.verdict.reason}`).join('\n')}${run.over.length ? `\n\n${run.over.length} more are simply over your first order limit, not bad products.` : ''}`, chips: bad[0] ? [{ label: `Show why the ${bad[0].product.short.toLowerCase()} fails`, act: { t: 'open', id: bad[0].product.id, maths: true } }] : undefined }
        : { text: 'Nothing that fits your budget is a clear skip. The ones marked "with care" each have one weak spot, which I name on the card.' };
    }
    if (/what does (steady|stable) demand mean|what does (lower|low) risk mean|what (are|do) (the |my )?priorities (mean|do)/.test(text)) {
      return { text: `Your priorities decide which products rank first:\n\n- **Lower risk**: few returns, room for error on ad cost, less competition\n- **Steady demand**: sells all year, not a spike\n- **Profitability**: the most money per sale\n- **Growth potential**: demand that is climbing\n- **Simple sourcing**: a small first order\n\nYou have ${list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase())) || 'none set'}. Change them in the bar above.` };
    }

    // Changing priorities and experience in words
    const pr: Priority[] = [];
    if (/\b(profit|profitability|most money|margin)\b/.test(text)) pr.push('profit');
    if (/\b(growth|growing|trending|grow)\b/.test(text)) pr.push('growth');
    if (/\b(low(er)? risk|safe|safety|careful)\b/.test(text)) pr.push('risk');
    if (/\b(steady|stable|consistent|all year)\b/.test(text)) pr.push('steady');
    if (/\b(simple|easy|small order|small first order)\b/.test(text)) pr.push('simple');
    if (pr.length && /(change|set|switch|make|update) (my )?priorit|i (care|want|prefer|value|prioriti[sz]e)|(focus|rank) (on|by)|more about|my priority is|priorit(y|ies) (to|should be|is|are)/.test(text) && !/\?$/.test(text)) {
      const next = [...new Set(pr)].slice(0, 3);
      return { text: `Ranking for ${list(next.map((x) => PRIORITIES[x].name.toLowerCase()))} now.`, acts: [{ t: 'profile', patch: { priorities: next } }] };
    }
    if (/i('?m| am) (an? )?(experienced|existing|seasoned|pro)\b|i('?ve| have) (been )?(sold|selling|sourced) (before|for years)|i know (the|trade) terms/.test(text)) {
      return { text: "Noted. I'll keep it short and use trade terms.", acts: [{ t: 'profile', patch: { experience: 'existing' } }] };
    }
    if (/i('?m| am) (new|a beginner|a first[- ]timer|just starting)|explain (things|it|more) simply|keep it simple/.test(text) && p.experience !== 'new') {
      return { text: "Noted. I'll explain trade terms as we go.", acts: [{ t: 'profile', patch: { experience: 'new' } }] };
    }

    // Suppliers: process questions
    if (/(make|manufacture|produce) (it|the product|them)? ?(themselves )?or (resell|trade|buy)|factory or (a )?(reseller|trader|middleman)|(are they|is it) (a )?(factory|manufacturer|reseller|trading company)/.test(text) && sr) {
      return { text: `Of the suppliers I checked for the ${sr.product.short}:\n${sr.results.map((r) => `- ${r.supplier.short}: ${r.supplier.type === 'Unclear' ? "won't say, which is a warning sign" : r.supplier.type.toLowerCase()}`).join('\n')}\n\nA factory gives you more control over price and quality. A trading company can still be fine for a small first order.` };
    }
    if (/what (will|does|would) (the|my|your) (message|inquiry|enquiry|email|request) say|show me the (message|inquiry|draft)|what will you (send|write|ask)/.test(text)) {
      if (ctx.productId && !ctx.contacted.length) return { text: 'Here it is. Nothing is sent until you approve it, and you can edit every word.', acts: [{ t: 'draftInquiry' }] };
      return { text: "The message asks each supplier four things: their best unit price at the minimum order and at double it, their minimum order and production time, the sample cost with shipping, and whether they can print your logo. You see and approve it before anything is sent." };
    }
    if (/(share|see|get|know) my (email|phone|number|address|budget|details|contact|personal)|my (email|phone|number|address|budget|details|contact details) (be |get |is )?(shared|visible|seen|sent)|privacy|(is|are) my (details|data) (safe|private|shared)|what do (suppliers|they) see/.test(text)) {
      return { text: "Suppliers see your business name (Sam Rivera) and your Orvane inbox. They **don't** see your email, phone number, budget or payment details. Replies come back through Orvane, and you approve every message before it's sent." };
    }
    if (/what if (no ?one|nobody|they don'?t|a supplier doesn'?t|none of them) (replies|reply|respond|responds|answers?)|(no|don'?t get a) repl(y|ies)/.test(text)) {
      return { text: "If a supplier stays quiet for 24 hours, I follow up once, politely, then stop. Quiet suppliers usually reply after that. If one still doesn't, that tells you something about how they'd handle a problem order, and the others' quotes are enough to decide." };
    }
    if (/how (do|should|would|will) i pay|pay (them|the supplier|outside|by|with|via)|payment (method|terms|protection)|(bank|wire) transfer|escrow|buyer protection/.test(text)) {
      return { text: "Always pay through Orvane's checkout. Your money is held until the goods arrive as described, which protects you if something goes wrong. **Never pay a supplier directly** by bank transfer or another app: that's the most common pattern in supplier scams, and it's why I set Dongguan Silico aside." };
    }
    if (/(vietnam|vietnamese|hai ?phong)\b.*\b(china|chinese)|(china|chinese)\b.*\b(vietnam|vietnamese)/.test(text)) {
      const m = MARKETS[p.market];
      const vn = sr?.results.find((r) => r.supplier.origin === 'VN');
      return { text: m.duty.VN < m.duty.CN
        ? `For ${m.the}, Vietnam has the edge on duty: **${pct(m.duty.VN)} instead of ${pct(m.duty.CN)}** on goods from China.${vn ? ` That's why ${vn.supplier.short} stays competitive despite a higher unit price.` : ''} Chinese suppliers usually have lower prices and more choice, so the total is what decides.`
        : `For ${m.the}, duty is the same from both (${pct(m.duty.CN)}), so it comes down to unit price, minimum order and track record. Chinese suppliers usually have lower prices and more choice.` };
    }
    if (/(which|who) (supplier |one )?(is|makes it|delivers|ships) (the )?(fastest|quickest|soonest)|fastest (supplier|production|delivery)|shortest lead/.test(text) && sr) {
      const f = [...sr.shortlist].sort((a, b) => a.supplier.lead - b.supplier.lead)[0];
      return f ? { text: `**${f.supplier.short}** is quickest: about ${f.supplier.lead} days to make your order, by its own account. Add three to four weeks at sea. Treat production times as estimates until they're confirmed in a quote.`, chips: [{ label: `Open ${f.supplier.short}`, act: { t: 'openSupplier', id: f.supplier.id } }] } : { text: 'None of the suppliers passes every check yet, so there is no one to compare.' };
    }
    if (/why (only|just) (\d+|three|two|one|a few) suppliers?|why (so )?few suppliers|what happened to the (other|rest)|how did you (pick|choose|filter) (the )?suppliers/.test(text) && sr) {
      return { text: `I read all ${sr.product.listings} listings for the ${sr.product.short}. Most fail the basic checks: no verified licence, too few orders or no record of delivering on time. **${sr.results.length} passed**, and I rank those here. Of those, ${sr.shortlist.length} pass every check within your budget. The rest are set aside with the reason on screen.` };
    }
    if (/why did (\w+ ?)+ (lower|drop|cut|reduce|change) (its|their|the) price|why (is|was) (the|its) (quote|price) (lower|different)/.test(text) && ctx.quotesReady && ctx.productId) {
      const qs = quotesFor(ctx.productId, p, ctx.contacted);
      const q = qs.find((x) => x.supplier.id === (sups[0] ?? '')) ?? qs.filter((x) => x.delta < 0)[0];
      return q ? { text: q.delta < 0 ? `${q.supplier.short} came down from ${money(q.listed)} to **${money(q.unit)}** after the message asked for their best price. Listed prices are a starting point, and asking costs nothing. ${q.note ? `It also said: ${q.note.toLowerCase()}` : ''}` : `${q.supplier.short} quoted its listed price, ${money(q.unit)}.` } : { text: 'No supplier changed its price.' };
    }

    // Waiting
    if (ctx.stage === 'waiting' && /(any|got|are there|have they|did they|has anyone) ?(repl|answer|respon|quote)|heard back|still waiting|status/.test(text)) {
      return { text: `Not yet. Suppliers usually reply within a day or two, and I'll follow up once with anyone who stays quiet for 24 hours. In this prototype you can skip the wait.`, chips: [{ label: 'Skip ahead 2 days', act: { t: 'skip' }, rec: true }] };
    }
    if (/(cancel|withdraw|undo|take back|unsend|recall) (the |my )?(message|inquiry|enquiry|request)/.test(text) && ctx.contacted.length) {
      return { text: "You can withdraw it, but suppliers may already have read it. There's no harm in leaving it: a quote doesn't commit you to anything." };
    }

    // After samples
    if (/(what if|if) (the )?samples? (is|are|looks?|turns? out|comes? back) (bad|poor|wrong|broken|cheap|not good|different)|bad samples?/.test(text)) {
      return { text: "Then you've lost the sample cost and nothing more. That's why I sample two suppliers: if one is poor, you order from the other. If both are poor, I'd look at the third quote or a different product before spending on stock." };
    }
    if (/(when|how long).*(samples?|parcel|package).*(arrive|come|get here|take)|samples? (arrive|arrival)/.test(text)) {
      return { text: ctx.samplesRequested ? 'Samples usually arrive in **7 to 10 days**. When they do, I walk you through an eight-point check before you order anything.' : 'Samples usually arrive 7 to 10 days after you request them.', chips: [ask('How do I check a sample?')] };
    }
    if (ctx.samplesRequested && /what (happens|now|next)|then what|what do i do (now|next)/.test(text)) {
      return { text: "Now you wait for the samples, about 7 to 10 days. When they arrive:\n\n1. Check both against the eight points\n2. Pick the supplier whose sample you trust\n3. Place the first order through Orvane's checkout\n\nNothing else is spent until you do.", chips: [ask('How do I check a sample?'), { label: 'Open my plan', act: { t: 'plan' } }] };
    }
    if (/(can i|how do i|i want to|let me) (start (over|again)|restart|reset|begin again|do (a|another) new search)|new search/.test(text)) {
      return { text: 'Starting over clears this search: your brief, the product, the suppliers and the quotes. Your plan so far goes with it.', chips: [{ label: 'Start a new search', act: { t: 'reset' }, rec: true }, { label: 'Keep this one', act: { t: 'ask', text: 'What should I do next?' } }] };
    }

    // Unsure noises
    if (/^(hmm+|umm+|uh+|er+|idk|i don'?t know|not sure|confused|lost|huh\??)[.!?]*$/.test(text)) {
      return { text: "No problem. Here's what I'd do next. You can also ask me anything about a product, a supplier or a cost.", chips: nextChip.length ? [...nextChip, ...stageChips(ctx, run).filter((c) => c.act.t === 'ask').slice(0, 1)] : stageChips(ctx, run) };
    }
    void chosen;
  }

  /* Places Scout has no data for */
  const place = text.match(OTHER_PLACES)?.[1];
  if (place && !MARKET_WORDS.some(([re]) => re.test(text))) {
    const name = place[0].toUpperCase() + place.slice(1);
    return {
      text: `I don't have data for ${name} yet, so I won't guess. The United States, Germany, the United Kingdom and Bangladesh work in this prototype.`,
      chips: [...MARKET_ORDER.filter((id) => id !== p.market).slice(0, 2).map((id) => ({ label: `Try ${MARKETS[id].name}`, act: { t: 'profile', patch: { market: id } } } as Chip)), { label: 'Compare all regions', act: { t: 'compareMarkets' } }],
    };
  }


  /* Is any of this real */
  if (/\breal\b.*\b(data|numbers?|figures?|suppliers?|products?|prices?)\b|simulated|made up|fake data/.test(text)) {
    return { text: 'No. Everything in this prototype is simulated: the products, suppliers, prices and demand. Nothing here is real market evidence.\n\nIn a real version, the verified figures would come from Orvane\'s own records, and the estimates from market data. I mark every figure as verified, estimate or unknown so you can always tell which is which.', chips: stageChips(ctx, run).slice(0, 2) };
  }

  /* What happens with samples: the same eight points as the check on screen */
  if (/(can|could|will) you (check|test|inspect|rate|judge) (the |my |our )?samples?/.test(text)) {
    return { text: "I can't. The samples are in your hands, not mine, so the eight-point check is yours. Rate each point good, minor issue or problem, and I'll compare them and recommend one the moment you're done." };
  }
  if (/what (counts as|is) a (problem|minor|minor issue)|problem or minor|difference between (a )?(problem|minor)|how (bad|serious) (is|should)|when is it a problem/.test(text)) {
    return { text: "**Minor issue**: something the supplier can fix before production without changing the product, like a rough edge, a smudged label or loose packaging. I'll ask them to fix it in the order.\n\n**Problem**: something that would make buyers send it back, like the wrong size, a strong smell, a part that breaks or a missing safety mark. I won't recommend ordering from a sample with a problem, because you'd get the same fault in every unit." };
  }
  if (/how (do|should|would) i (check|test|inspect|judge)|what (should|do) i (check|look for)|eight[- ]point|check(ing)? (a|the) samples?|what to check/.test(text)) {
    const pr = ctx.productId ? productById(ctx.productId) : run.fits[0]?.product;
    const pts = pr ? checkPoints(pr.category, p, stackFor(pr, p).price) : [];
    return { text: `When ${ctx.productId ? 'your samples arrive' : 'a sample arrives'}, check eight things:\n\n${pts.map((x, i) => `${i + 1}. **${x.title}**: ${x.hint}`).join('\n')}\n\nRate each one good, minor issue or problem, and I'll compare the samples for you.` };
  }

  if (/(what happens|then what|what next|what do i do) (after|once|when) (the |my )?samples?|after (the )?samples (arrive|come)/.test(text)) {
    return { text: 'Samples usually arrive in 7 to 10 days. I walk you through an eight-point check, you pick the supplier whose sample you trust, and then you place the first order through Orvane\'s normal checkout with buyer protection. Nothing before that commits you to an order.', chips: [ask('How do I check a sample?')] };
  }
  if (/negotiat|discount|better (price|deal)|haggle|bring (the |their )?price down|cheaper price/.test(text)) {
    const quotes = ctx.productId && ctx.quotesReady ? quotesFor(ctx.productId, p, ctx.contacted) : [];
    const cut = quotes.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta)[0];
    return { text: cut
      ? `Asking already worked once: ${cut.supplier.short} came down from ${money(cut.listed)} to ${money(cut.unit)} a unit. The next lever is volume. My message asked each supplier for a price at double the quantity, so compare those before you order.`
      : 'The message I draft asks each supplier for their best price at the minimum order and at double the quantity. Suppliers often cut the price for the larger number, and competing quotes give you something to point to. I would not push on price before you have seen a sample.', chips: stageChips(ctx, run).slice(0, 1) };
  }
  if (/\blogo\b|private label|own brand|brand(ing|ed)?\b|custom (packaging|print)/.test(text)) {
    return { text: 'The quote request already asks each supplier whether they can print your logo on the product. Their answers come back with the quotes, and custom printing usually raises the minimum order, so I flag it when it does.', chips: stageChips(ctx, run).slice(0, 1) };
  }
  if (/how long (will|does|would) (it|this|the whole thing) take|timeline|how soon|when (can|could|will) i (start|sell|launch|have)/.test(text) && !supNamed) {
    const lead = ctx.productId ? evaluateSuppliers(ctx.productId, p).shortlist[0]?.supplier.lead : null;
    return { text: `Roughly ${lead ? Math.round((3 + 10 + lead + 25) / 7) : '8 to 10'} weeks from today to stock in hand:\n\n- Quotes: 2 to 3 days\n- Samples: 7 to 10 days\n- Production: ${lead ? `about ${lead} days, by the supplier's own account` : '2 to 4 weeks, depending on the supplier'}\n- Sea freight: 3 to 4 weeks\n\nThese are estimates until a supplier confirms dates in a quote.` };
  }

  /* Meaning of a term */
  if (/what('?s| is| are| does)|mean|explain|define/.test(text)) {
    const hit = GLOSSARY.find(([re]) => re.test(text));
    if (hit && !/what if|what about/.test(text)) return { text: hit[1](ctx, subject), chips: stageChips(ctx, run).slice(0, 2) };
  }

  /* Two or more changes at once: "what if I had $4,000 and sold in Germany on Amazon?" */
  const sc = scenario(text, p, nums);
  if (sc.parts.length >= 2) {
    const next = { ...p, ...sc.patch };
    const alt = evaluate(next, { ad: sc.ad, price: sc.price !== undefined ? { id: subject.product.id, value: sc.price } : undefined });
    const briefChanges = Object.keys(sc.patch).length > 0;
    if (wantsChange && briefChanges && sc.ad === undefined && sc.price === undefined) return { text: `Updating your brief: ${list(sc.parts)}.`, acts: [{ t: 'profile', patch: sc.patch }] };
    const sub = alt.results.find((r) => r.product.id === subject.product.id)!;
    const lines = [`With ${list(sc.parts)}, the ${sub.product.short} makes **${money(sub.stack.profit)} per sale** (it makes ${money(subject.stack.profit)} now)${sub.stack.profit <= 0 ? ', so it loses money' : ''}.`];
    if (briefChanges) {
      lines.push(alt.fits.length
        ? `${alt.fits.length} ${alt.fits.length === 1 ? 'product fits' : 'products fit'}:\n${alt.fits.slice(0, 3).map((r, i) => `${i + 1}. ${r.product.short}, ${money(r.stack.profit)} per sale (${r.verdict.label.toLowerCase()})`).join('\n')}`
        : `Nothing fits: the smallest first order would be ${money0(alt.over[0].stack.firstOrder)}, over a ${money0(alt.cap)} limit.`);
    }
    return { text: lines.join('\n\n'), chips: briefChanges ? [{ label: 'Apply this to my brief', act: { t: 'profile', patch: sc.patch }, rec: true }] : undefined };
  }

  /* Two products side by side in another market */
  const market = MARKET_WORDS.find(([re]) => re.test(text))?.[1];
  if (market && market !== p.market && prods.length >= 2 && /compare|versus|\bvs\b|against|or the|side by side|better/.test(text)) {
    const next = evaluate({ ...p, market });
    const rows = prods.slice(0, 3).map((id) => next.results.find((r) => r.product.id === id)!);
    const best = [...rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
    return {
      text: `In ${MARKETS[market].name}:\n${rows.map((r) => `- ${r.product.short}: ${money(r.stack.profit)} per sale, ${money0(r.stack.firstOrder)} first order (${r.verdict.label.toLowerCase()})`).join('\n')}\n\nThere I would take the **${best.product.short}**: ${best.verdict.reason}.`,
      chips: [{ label: `Switch to ${MARKETS[market].name}`, act: { t: 'profile', patch: { market } }, rec: true }, { label: `Compare them in ${theMarket(p)}`, act: { t: 'compare', ids: prods.slice(0, 3) } }],
    };
  }

  /* A different market */
  if (market && market !== p.market && !/duty|tariff/.test(text)) {
    if (wantsChange) return { text: `Switching your market to ${MARKETS[market].name}.`, acts: [{ t: 'profile', patch: { market } }] };
    const next = evaluate({ ...p, market });
    const diff = diffRuns(run, next);
    const top = next.fits.slice(0, 3).map((r, i) => `${i + 1}. ${r.product.short}, ${money(r.stack.profit)} per sale (${r.verdict.label.toLowerCase()})`);
    return {
      text: `In ${MARKETS[market].name}: ${diff.headline}\n\n${top.join('\n')}\n\n${diff.notes.join(' ')}`,
      chips: [{ label: `Switch to ${MARKETS[market].name}`, act: { t: 'profile', patch: { market } }, rec: true }, ask('Why does the order change?', `Why does the order change in ${MARKETS[market].name}?`)],
    };
  }
  if (market && market === p.market && /what if|what about|how about|instead|switch|move to|sell(ing)? in|would|could/.test(text) && !/why|order/.test(text)) {
    const others = MARKET_ORDER.filter((id) => id !== market);
    const top = run.fits[0];
    const lines = others.map((id) => {
      const alt = evaluate({ ...p, market: id });
      const t = alt.fits[0];
      return `- ${MARKETS[id].the[0].toUpperCase()}${MARKETS[id].the.slice(1)}: ${t ? `the ${t.product.short} leads at ${money(t.stack.profit)} per sale, ${alt.fits.length} ${alt.fits.length === 1 ? 'product fits' : 'products fit'}` : 'nothing fits this budget'}`;
    });
    return {
      text: `You're already selling in ${theMarket(p)}${top ? `, where the **${top.product.short}** leads at ${money(top.stack.profit)} per sale` : ''}.\n\nFor comparison, with the same budget:\n${lines.join('\n')}`,
      chips: others.slice(0, 2).map((id) => ask(`What if I sold in ${MARKETS[id].the}?`)).concat([{ label: 'Compare all regions', act: { t: 'compareMarkets' } }]),
    };
  }
  if (market && market === p.market && /why|change|order/.test(text)) {
    const s = subject.stack;
    return { text: `You are already set to ${MARKETS[market].name}. Here the ${subject.product.short} pays ${money(s.duty)} duty per unit${s.tax ? ` and ${money(s.tax)} sales tax per sale` : ''}, and ads cost about ${money(s.ad)} per sale. Those three numbers, plus local demand, are what move the order between markets.` };
  }

  /* Ad cost what-if */
  if (/\bads?\b|advertis|\bcpa\b|cost per (sale|acquisition|customer)/.test(text)) {
    const s = subject.stack;
    const n = nums.find((x) => x > 0 && x < 100);
    if (n !== undefined) {
      const alt = stackFor(subject.product, p, { ad: n });
      return { text: `If ads cost ${money(n)} per sale, the ${subject.product.short} makes **${money(alt.profit)} per sale**${alt.profit <= 0 ? ', so it loses money' : ''}. My estimate is ${money(s.ad)}. ${s.profit > 0 ? `It stays in profit until ads cost ${money(s.breakEvenAd)}.` : ''}` };
    }
    return { text: `I assume about ${money(s.ad)} in ads for each sale ${p.channel === 'marketplace' ? 'on a marketplace' : 'through your own store'} in ${theMarket(p)}. It is my biggest guess, and it varies a lot with how good your photos and page are.\n\n${s.profit > 0 ? `The ${subject.product.short} stays in profit until ads cost **${money(s.breakEvenAd)}** per sale.` : `The ${subject.product.short} would need ads under ${money(Math.max(0, s.breakEvenAd))} per sale to break even.`}`, chips: [ask('What if ads cost $10?', `What if ads cost $10 per sale for the ${subject.product.short}?`)] };
  }

  /* Price what-if */
  if (/(sell|price|charge|priced|retail)\b.*\d/.test(text) && nums.length && !/budget|\bunits?\b|how much (would|will|could|can|do) i (make|earn|profit)/.test(text)) {
    const price = nums.find((x) => x >= 3 && x < 300);
    if (price !== undefined) {
      const alt = stackFor(subject.product, p, { price });
      return { text: `At ${money(price)} instead of ${money(subject.stack.price)}, the ${subject.product.short} makes **${money(alt.profit)} per sale** (${pct(alt.margin)} margin). ${alt.profit <= 0 ? 'That loses money.' : price > subject.stack.price ? 'Most shops in this market sell it for less, so expect slower sales.' : 'A lower price can sell faster, but it leaves less room if ads cost more than I expect.'}` };
    }
  }

  /* Budget */
  const inTaka = /taka|\btk\b|৳|\bbdt\b|\blakh|\blac\b/.test(text);
  const budget = inTaka ? extractBrief(text).patch.budget : nums.find((x) => x >= 300);
  if (budget && (inTaka || /budget|afford|spend|have|invest|only|\$/.test(text) || nums.length === 1)) {
    const b = Math.round(budget / 50) * 50;
    const tk = inTaka ? ` (about ${taka(Math.round((b * TAKA_PER_DOLLAR) / 10000) * 10000)})` : '';
    if (wantsChange) return { text: `Setting your budget to ${money0(b)}${tk}.`, acts: [{ t: 'profile', patch: { budget: b } }] };
    const next = evaluate({ ...p, budget: b });
    const names = next.fits.slice(0, 4).map((r) => r.product.short);
    const body = next.fits.length
      ? `**${next.fits.length} ${next.fits.length === 1 ? 'product fits' : 'products fit'}**: ${list(names)}${next.fits.length > 4 ? ' and more' : ''}. The ${next.fits[0].product.short} would lead at ${money(next.fits[0].stack.profit)} per sale.`
      : `**Nothing fits.** The smallest first order is ${money0(next.over[0].stack.firstOrder)} for the ${next.over[0].product.short}, which needs a budget of ${money0(next.over[0].needsBudget)}.`;
    return { text: `With ${money0(b)}${tk}, your first order limit would be ${money0(capFor(b, shareOf(p)))}. ${body}`, chips: b !== p.budget ? [{ label: `Set my budget to ${money0(b)}`, act: { t: 'profile', patch: { budget: b } }, rec: true }] : undefined };
  }

  /* Channel */
  if (/own (online )?(store|shop|site|website)|shopify|my (own )?(store|shop|website|site)|online store/.test(text)) {
    if (p.channel === 'own') {
      const st = stackFor(subject.product, p);
      return { text: `You're already set to your own online store. I count ${MARKETS[p.market].pay.label.toLowerCase()} and about ${money(st.ad)} in ads for each sale.`, chips: stageChips(ctx, run) };
    }
    return { text: 'Switching to your own online store.', acts: [{ t: 'profile', patch: { channel: 'own' } }] };
  }
  if (/local (shop|retail|store)|market stall|retail/.test(text) && p.channel !== 'retail' && wantsChange) {
    return { text: 'Switching to local retail. I use online store costs for now, since retail data is not in this prototype.', acts: [{ t: 'profile', patch: { channel: 'retail' } }] };
  }
  if (/amazon|ebay|etsy|marketplace/.test(text) && p.channel !== 'marketplace') {
    if (wantsChange) return { text: 'Switching to selling on a marketplace.', acts: [{ t: 'profile', patch: { channel: 'marketplace' } }] };
    const alt = stackFor(subject.product, { ...p, channel: 'marketplace' });
    return { text: `On a marketplace the ${subject.product.short} would make **${money(alt.profit)} per sale** instead of ${money(subject.stack.profit)}. You pay a 15% fee (${money(alt.fees)}), but ads cost about ${money(alt.ad)} per sale because shoppers are already there.`, chips: [{ label: 'Switch to marketplace', act: { t: 'profile', patch: { channel: 'marketplace' } }, rec: true }] };
  }

  /* Can money buy a place in the ranking? */
  if (/(pay|paid|buy|bought)( (orvane|scout|you))? (to|for) (rank|be ranked|a (higher|better|top) (rank|place|spot)|the top|move up)|buy (a )?(higher |better )?(rank|place)|can (a )?suppliers? (pay|buy)|pay to (win|get on)/.test(text)) {
    return { text: `No. Money can't buy a place in my ranking.\n\n${PROMOTION_EXPLAINED}\n\n${VERIFIED_EXPLAINED}` };
  }

  /* Suppliers */
  if (supStage || supNamed) {
    const sr = evaluateSuppliers(supProductId, p);
    const target = sr.results.find((r) => r.supplier.id === resolvedSupplier) ?? sr.results[0];
    const quotes = ctx.quotesReady ? quotesFor(supProductId, p, ctx.contacted) : [];

    if (supNamed && /(move|get|go|rank|climb) (up|higher)|rank (better|higher)|on (to )?the shortlist|improve|what would it take/.test(text)) {
      const climb = auditNote(target, sr);
      if (climb) return { text: climb, chips: [{ label: `Open ${target.supplier.short}`, act: { t: 'openSupplier', id: target.supplier.id } }] };
      if (target.tier === 'shortlist') return { text: `${target.supplier.short} is already on the shortlist, ${ordinal(target.rank)} of ${sr.results.length}. To move higher it would need a better price or a stronger delivery record than the suppliers above it.` };
      if (target.tier === 'avoid') return { text: `Not while it asks buyers to pay outside Orvane. That one is a hard stop for me, because you'd have no protection if the order went wrong.` };
      if (target.tier === 'out') return { text: `${target.supplier.short} is only out because ${target.reason.replace(/^first order/, 'its first order')}. A bigger budget, or a smaller minimum order from them, would bring it back.` };
      return { text: `${target.supplier.short} is held back because ${target.reason}. ${target.supplier.type === 'Trading company' ? "As a reseller it has no factory of its own to audit, so the way up is proof from the factory it buys from." : ''}`.trim() };
    }

    if (/why not|why isn'?t|why (did|didn'?t)|left out|skip/.test(text) && supNamed) {
      if (target.tier === 'shortlist') {
        const picks = pickSamples(quotes);
        const q = quotes.find((x) => x.supplier.id === target.supplier.id);
        if (q && picks.length && !picks.includes(q)) {
          return { text: `${target.supplier.short} is a good supplier and stays on your shortlist. I left it out of the samples because ${picks[0].supplier.short} earns more per sale (${money(picks[0].stack.profit)} against ${money(q.stack.profit)}) and ${picks[1].supplier.short} needs the least money up front (${money0(picks[1].stack.firstOrder)} against ${money0(q.stack.firstOrder)}). It also took a follow-up to get a reply. You can add it for ${money0(q.sampleCost)}.` };
        }
        return { text: `${target.supplier.short} is on the shortlist: ${target.reason}.` };
      }
      const climb = auditNote(target, sr);
      const more = target.flags.filter((f) => f.toLowerCase() !== target.reason.toLowerCase()).slice(0, 2);
      return { text: `**${target.label}: ${target.reason}.**${more.length ? ` ${more.join('. ')}.` : ''}${climb ? `\n\n${climb}` : ''}`, chips: [{ label: `Open ${target.supplier.short}`, act: { t: 'openSupplier', id: target.supplier.id } }] };
    }
    if (/safe|legit|trust|scam|reliab|risk|real\b|fake|genuine/.test(text)) {
      const pool = resolvedSupplier ? [target] : sr.shortlist.length ? [sr.shortlist[0]] : [target];
      const r = pool[0];
      const s = r.supplier;
      if (r.tier === 'avoid') return { text: `**No. I would avoid ${s.short}.** ${r.flags.slice(0, 3).join('. ')}. A price that low with payment off the platform is the most common pattern in supplier scams.`, chips: [{ label: `Open ${s.short}`, act: { t: 'openSupplier', id: s.id } }] };
      const known = [`its business licence is checked`, s.audit ? `it passed a factory audit in ${monthLabel(s.audit)}` : null, `it has completed ${s.orders} orders on Orvane`, s.onTime ? `${pct(s.onTime)} arrived on time` : null].filter(Boolean) as string[];
      return {
        text: `${r.tier === 'shortlist' ? `**As safe as I can verify.**` : `**Ask before you commit.**`} For ${s.short}, ${list(known)}.${r.flags.length ? `\n\nWatch for: ${r.flags.join('. ').toLowerCase()}.` : ''}\n\nWhat nobody can know yet is the quality of the product itself. That is what a sample is for.`,
        chips: [{ label: `Open ${s.short}`, act: { t: 'openSupplier', id: s.id } }, ask('What does a factory audit prove?')],
      };
    }
    if (/cheap|lowest|smallest|least|low(er)? (price|moq|order)|less (money|upfront)/.test(text)) {
      const ok = sr.results.filter((r) => r.tier === 'shortlist' || r.tier === 'ask');
      const small = [...ok].sort((a, b) => a.stack.firstOrder - b.stack.firstOrder)[0];
      const cheapest = [...sr.results].sort((a, b) => a.unit - b.unit)[0];
      return { text: `The smallest first order I'd trust is **${small.supplier.short}**: ${small.moq} units for ${money0(small.stack.firstOrder)}.${cheapest.tier === 'avoid' ? `\n\n${cheapest.supplier.short} lists the lowest unit price (${money(cheapest.unit)}), but it ${cheapest.reason}. I would not send it money.` : ''}`, chips: [{ label: `Open ${small.supplier.short}`, act: { t: 'openSupplier', id: small.supplier.id } }] };
    }
    if (/compare|versus|\bvs\b|difference|side by side/.test(text)) return { text: 'Here they are side by side. Rows where they differ are highlighted.', acts: [{ t: 'compareSup' }] };
    if (/best|which (one|supplier|quote)|recommend|pick|choose|your pick|who should/.test(text)) {
      if (quotes.length) {
        const picks = pickSamples(quotes);
        return { text: `On the quotes, **${picks[0].supplier.short}** is best on profit (${money(picks[0].stack.profit)} per sale at ${money(picks[0].unit)} a unit)${picks[1] ? ` and **${picks[1].supplier.short}** needs the least up front (${money0(picks[1].stack.firstOrder)})` : ''}. I would sample both before choosing, because price tells you nothing about quality.`, chips: stageChips(ctx, run).slice(0, 1) };
      }
      const top = sr.shortlist[0] ?? sr.results[0];
      const waiting = ctx.stage === 'waiting';
      return { text: `${waiting ? 'The replies are not in yet. Going by their listings, ' : ''}**${top.supplier.short}** ranks first: ${top.reason}. ${sr.shortlist[1] ? `${sr.shortlist[1].supplier.short} is the one to pick if you want the ${sr.shortlist[1].reason}.` : ''} ${waiting ? 'I will compare the real quotes as soon as they arrive.' : `I'd get quotes from all ${sr.shortlist.length} before deciding.`}`, chips: stageChips(ctx, run).slice(0, 1) };
    }
    if (/ship|deliver|how long|lead time|arrive|when/.test(text)) {
      const rows = sr.shortlist.map((r) => `- ${r.supplier.short}: ${r.supplier.lead} days to make, by its own account`);
      return { text: `Production times for the ${sr.product.short}:\n${rows.join('\n')}\n\nAdd about three to four weeks for sea freight. These are estimates until a supplier confirms them in a quote.` };
    }
    if (/sample/.test(text)) {
      if (quotes.length) {
        const picks = pickSamples(quotes);
        return { text: `Samples cost ${list(quotes.map((q) => `${money0(q.sampleCost)} from ${q.supplier.short}`))}, shipping included. I'd order from ${list(picks.map((q) => q.supplier.short))}: ${money0(picks.reduce((a, q) => a + q.sampleCost, 0))} in total.`, chips: stageChips(ctx, run).slice(0, 1) };
      }
      return { text: 'Sample prices come back with the quotes. Ask the shortlist for a quote and I will put sample costs in the same table.', chips: stageChips(ctx, run).slice(0, 1) };
    }
    if (/go wrong|worst|risk|worr|downside|catch/.test(text)) {
      const pr = run.results.find((r) => r.product.id === supProductId)!;
      return { text: `Three things, in order of how much I'd worry:\n\n1. **Quality** is unknown until samples arrive. That is why samples come before any order.\n2. **Ad cost** is my biggest guess. The ${pr.product.short} stays in profit until ads cost ${money(pr.stack.breakEvenAd)} per sale; I assumed ${money(pr.stack.ad)}.\n3. **Duty** on goods from China into ${theMarket(p)} can change. Today it adds ${money(pr.stack.duty)} per unit.\n\nYour downside before samples is the sample cost only.` };
    }
    if (supNamed) {
      const facts = supplierFacts(target, sr).slice(0, 4).map((f) => `- ${f.label}: ${f.value}`);
      return { text: `**${target.supplier.name}: ${target.label}${target.reason ? `, ${target.reason}` : ''}.**\n\n${facts.join('\n')}\n\nUnit price ${money(target.unit)}, minimum ${target.moq} units, first order ${money0(target.stack.firstOrder)}.`, chips: [{ label: `Open ${target.supplier.short}`, act: { t: 'openSupplier', id: target.supplier.id } }] };
    }
  }

  /* Products */
  if (/compare|versus|\bvs\b|difference between|side by side/.test(text)) {
    const ids = prods.length >= 2 ? prods.slice(0, 3) : run.fits.filter((r) => r.verdict.tier !== 'skip').slice(0, 3).map((r) => r.product.id);
    if (ids.length >= 2) return { text: 'Here they are side by side. Rows where they differ are highlighted.', acts: [{ t: 'compare', ids }] };
  }
  /* "Which has the fewest returns?", "which is growing fastest?" */
  const sup = SUPERLATIVES.find((x) => x.re.test(text));
  if (sup) {
    const pool = run.fits.length ? run.fits : run.results;
    const ranked = sup.sort(pool, p);
    const best = ranked[0];
    const second = ranked[1];
    const scope = run.fits.length ? `Of the ${run.fits.length} that fit your budget` : `Of all ${run.results.length}`;
    const lines = [`${scope}, the **${best.product.short}** ${sup.says(best)}.${second ? ` The ${second.product.short} comes next.` : ''}`];
    if (best.verdict.tier === 'skip') lines.push(`That alone does not make it a good pick. My verdict on it is still "${best.verdict.label}": ${best.verdict.reason}.`);
    else if (run.fits[0] && best.product.id !== run.fits[0].product.id) lines.push(`Overall I still rank the ${run.fits[0].product.short} first for your brief, because I weigh more than this one thing.`);
    return { text: lines.join('\n\n'), chips: [{ label: `Open the ${best.product.short}`, act: { t: 'open', id: best.product.id } }] };
  }

  /* What a number of sales adds up to */
  if (/how much (would|will|could|can|do|did) i (make|earn|profit|get)|total profit|profit (on|from|for) (the |my )?(first |whole )?order|if i s[eo]ll (all|out|\d)|sell(ing)? (all|\d+) (of them|units)/.test(text)) {
    const s = subject.stack;
    if (s.profit <= 0) return { text: `Nothing: at these numbers the ${subject.product.short} loses ${money(-s.profit)} on every sale, so more sales means a bigger loss.` };
    const asked = nums.find((x) => x >= 10 && x <= 100000 && Number.isInteger(x) && x !== p.budget);
    const n = asked ?? s.moq;
    return { text: `Selling ${asked ? n : `the whole first order of ${n}`} units of the ${subject.product.short} leaves about **${money0(n * s.profit)}** after every cost, the product itself included. That is ${money(s.profit)} a sale.\n\n${asked && asked > s.moq ? `Your first order is only ${s.moq} units, so that would take a reorder. ` : ''}It rests on ads costing ${money(s.ad)} per sale, which is my biggest guess. You have your ${money0(s.firstOrder)} back after ${s.breakEvenUnits} sales.` };
  }

  /* What it costs to get going */
  if (/how much (do|will|would) i (need|have to (spend|pay|put in))|total (cost|outlay|spend)|what (will|would|does) (it|this|that) cost( me)?|up[- ]?front|to get started|start[- ]?up cost/.test(text)) {
    const s = subject.stack;
    const left = p.budget - s.firstOrder - 50;
    return { text: `To start with the ${subject.product.short} you need about **${money0(s.firstOrder)}** for the first order: ${s.moq} units, with shipping and duty included. Samples add roughly $40 to $60 before that.\n\n${left >= 0 ? `From your ${money0(p.budget)} that leaves about ${money0(left)} for launch ads and a buffer.` : `That is more than your ${money0(p.budget)} budget once samples are counted, which is why I set it aside.`}` };
  }

  /* A straight yes or no */
  if (/is (it|this|that) (worth|a good idea|any good|smart)|should i (do|go for|buy|sell|pick|choose) (it|this|that|them)|would you (do|buy|sell|pick) (it|this|that)|good (idea|choice|pick)\??$|worth it/.test(text)) {
    const yes = subject.verdict.tier === 'worth';
    const name = subject.product.short;
    return { text: `${yes ? `Yes, I would test the ${name}.` : subject.verdict.tier === 'care' ? `The ${name}: only with care.` : `No, I would not take the ${name}.`} ${describe(subject, run)}`, chips: yes && !ctx.productId ? [{ label: `Choose the ${subject.product.short}`, act: { t: 'choose', id: subject.product.id }, rec: true }] : [{ label: `Open the ${subject.product.short}`, act: { t: 'open', id: subject.product.id } }] };
  }

  if (/(highest|most|max|biggest|best) (profit|margin|money)|most profitable/.test(text)) {
    const all = [...run.results].sort((a, b) => b.stack.profit - a.stack.profit);
    const fit = [...run.fits].sort((a, b) => b.stack.profit - a.stack.profit)[0];
    const top = all[0];
    const lines = [top.verdict.tier === 'out'
      ? `The most profit per sale is the **${top.product.short}** at ${money(top.stack.profit)}, but its first order of ${money0(top.stack.firstOrder)} is over your limit.`
      : `The most profit per sale is the **${top.product.short}** at ${money(top.stack.profit)}.`];
    if (fit && fit !== top) lines.push(`Of the ones that fit, the **${fit.product.short}** earns the most: ${money(fit.stack.profit)}.`);
    const chips: Chip[] = [];
    if (p.priorities.includes('risk') && !p.priorities.includes('profit')) {
      lines.push('You asked me to keep risk low, so I rank by more than profit. Which matters more to you?');
      chips.push({ label: 'Keep lower risk', act: { t: 'ask', text: 'Keep my priorities as they are' } }, { label: 'Rank by profit', act: { t: 'profile', patch: { priorities: ['profit'] } } });
    }
    return { text: lines.join('\n\n'), chips };
  }
  if (/keep my priorities/.test(text)) return { text: `Keeping ${list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase()))}. The order stays as it is.`, chips: stageChips(ctx, run).slice(0, 2) };
  if (/cheap|smallest|lowest|least|low(er)? (moq|order)|less (money|upfront)|minimum/.test(text)) {
    const by = [...run.results].sort((a, b) => a.stack.firstOrder - b.stack.firstOrder).slice(0, 3);
    const rows = by.map((r) => `- ${r.product.short}: ${money0(r.stack.firstOrder)} for ${r.stack.moq} units, ${money(r.stack.profit)} per sale (${r.verdict.label.toLowerCase()})`);
    const sane = by.find((r) => r.verdict.tier === 'worth' || r.verdict.tier === 'care');
    const allOver = by.every((r) => r.verdict.tier === 'out');
    const verdictLine = allOver
      ? `All of them are over your ${money0(run.cap)} first order limit. The ${by[0].product.short} fits from a ${money0(by[0].needsBudget)} budget.`
      : `${sane ? `Of these, I'd only test the ${sane.product.short}.` : 'None of these is one I would test.'} A small order is not safer if each sale earns too little.`;
    return { text: `The smallest first orders:\n${rows.join('\n')}\n\n${verdictLine}`, chips: sane ? [{ label: `Open the ${sane.product.short}`, act: { t: 'open', id: sane.product.id } }] : undefined };
  }
  if (/break[- ]?even|money back|recoup|pay ?back|how many (do i|units|would i)|earn back/.test(text)) {
    const s = subject.stack;
    if (s.profit <= 0) return { text: `The ${subject.product.short} never pays back at these numbers: each sale loses ${money(-s.profit)}.` };
    return { text: `You get your ${money0(s.firstOrder)} back after selling **${s.breakEvenUnits} of ${s.moq} units** of the ${subject.product.short}. Everything after that, about ${money0((s.moq - s.breakEvenUnits) * (s.profit + s.landed))}, is yours, minus anything you spend on samples.` };
  }
  if (/break ?down|where does (the|my) money|how (do|did) you (calculate|work|get|arrive)|the maths?|costs?\b|cost stack|show.*(working|maths?)/.test(text)) {
    return { text: `Here is one sale of the ${subject.product.short} in ${theMarket(p)}:\n\n${stackLines(subject, p)}`, acts: ctx.stage === 'opportunities' ? [{ t: 'open', id: subject.product.id, maths: true }] : undefined };
  }
  if (/why/.test(text) || /tell me (more )?about|what about the|how about the|is the .* (good|worth)|thoughts on/.test(text)) {
    if (/first|top|rank|lead|number one|#1|pick/.test(text) && !prods.length && run.fits[0]) {
      const top = run.fits[0];
      const second = run.fits[1];
      return { text: `${describe(top, run)}${second ? `\n\nIt beats the ${second.product.short} mainly on ${top.stack.profit > second.stack.profit ? `profit (${money(top.stack.profit)} against ${money(second.stack.profit)})` : `risk: the ${second.product.short} earns more, but ${second.verdict.reason}`}.` : ''}`, chips: [{ label: 'See the maths', act: { t: 'open', id: top.product.id, maths: true } }] };
    }
    if (/order|change|different|moved?/.test(text) && !prods.length) {
      return { text: `The order comes from six things: profit per sale, how demand is moving, how crowded the market is, returns, how steady sales are through the year, and how much of your budget the first order uses. Your priorities (${list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase())) || 'none set'}) decide which of those count most.` };
    }
    return { text: `The ${subject.product.short}${subject.rank ? ` ranks ${ordinal(subject.rank)}` : ''}. ${describe(subject, run)}`, chips: [{ label: `Open the ${subject.product.short}`, act: { t: 'open', id: subject.product.id } }] };
  }
  if (/what should i|which (one|product)|recommend|best (product|option|one|idea)|your pick|what would you/.test(text)) {
    const top = run.fits[0];
    if (!top) return { text: `Nothing fits ${money0(p.budget)} yet. The closest is the ${run.over[0].product.short}, which needs a budget of ${money0(run.over[0].needsBudget)}.`, chips: [{ label: `Raise budget to ${money0(run.over[0].needsBudget)}`, act: { t: 'profile', patch: { budget: run.over[0].needsBudget } }, rec: true }] };
    const second = run.fits[1];
    return { text: `I'd test the **${top.product.short}**. ${explain(top, run).points[0].text}${second && second.verdict.tier !== 'skip' ? `\n\nIf you want a cheaper way in, the ${second.product.short} costs ${money0(second.stack.firstOrder)} to start and makes ${money(second.stack.profit)} per sale.` : ''}`, chips: [{ label: `Choose the ${top.product.short}`, act: { t: 'choose', id: top.product.id }, rec: true }, { label: 'See the maths', act: { t: 'open', id: top.product.id, maths: true } }] };
  }
  if (/demand|trend|season|popular|selling|winter|summer|spike/.test(text)) {
    const d = subject.demand;
    return { text: `Demand for the ${subject.product.short} in ${theMarket(p)} is **${trendText(d.trend).toLowerCase()}** over 12 months, ${demandNote(subject)}. ${explain(subject, run).points[1].text}`, chips: [{ label: 'See the 12-month chart', act: { t: 'open', id: subject.product.id, maths: true } }] };
  }
  if (/duty|tariff|tax|vat|customs/.test(text)) {
    const hit = GLOSSARY.find(([re]) => re.test(text));
    if (hit) return { text: hit[1](ctx, subject) };
  }
  if (/return/.test(text)) {
    return { text: `About ${pct(subject.product.returns)} of ${subject.product.short} orders come back. I count that as ${money(subject.stack.returns)} off each sale. ${subject.product.returns >= 0.08 ? 'That is high for pet supplies, which is why I flag it.' : 'That is low for pet supplies.'}` };
  }
  if (/next|what now|where are we|what do i do|continue|go on/.test(text)) {
    return { text: 'Here is the next step.', chips: stageChips(ctx, run) };
  }
  if (/help|what can you|how (do|does) (this|you|it) work|who are you|what are you/.test(text)) {
    return { text: `I work out what one sale really earns after shipping, duty, fees, ads and returns, then rank products for your brief. I check suppliers, tell you who to avoid, and contact the good ones once you approve the message.\n\nYou can ask me things like:`, chips: [ask('What if my budget was $4,000?'), ask('What if ads cost $10 per sale?'), ask('How many do I need to sell to get my money back?')] };
  }
  const hit = GLOSSARY.find(([re]) => re.test(text));
  if (hit) return { text: hit[1](ctx, subject) };
  if (prods.length) return { text: `The ${subject.product.short}${subject.rank ? ` ranks ${ordinal(subject.rank)}` : ''}. ${describe(subject, run)}`, chips: [{ label: `Open the ${subject.product.short}`, act: { t: 'open', id: subject.product.id } }] };

  return {
    text: "I didn't catch what you need there. I can answer questions about these products, suppliers and costs, or change your brief. Try one of these:",
    chips: stageChips(ctx, run),
  };
}

/** Names the model and the interface can both use. */
export const PRODUCT_IDS = PRODUCTS.map((x) => x.id);
export const SUPPLIER_IDS = SUPPLIERS.map((x) => x.id);
export const nameOf = (id: string) => productById(id)?.short ?? id;
export { CHANNELS, round2 };
