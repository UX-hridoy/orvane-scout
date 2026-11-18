import { rulesFor } from './knowledge';
import type { Act, Ctx, ScoutEvent } from './acts';
import { CATEGORIES } from './categories';
import { CHANNELS, EXPERIENCE, MARKETS, PRIORITIES, PRODUCTS, SPLITS, SUPPLIERS, productById } from './data';
import { demandNote, shareOf, splitOf, diffRuns, evaluate, evaluateSuppliers, explain, pickSamples, quotesFor, supplierFacts } from './engine';
import { money, money0 } from './format';
import type { Channel, Experience, MarketId, Priority, Profile, ProductResult, Run } from './types';

/**
 * What a live model can know and do as Scout. The model never does its own
 * arithmetic: every figure comes from the same engine the interface uses,
 * reached through these tools. The definitions are plain data, so the server
 * route and the Claude artifact can both hand them to their model.
 */

export interface ScoutTool {
  name: string;
  description: string;
  /** JSON Schema for the one object argument. */
  schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run(input: Record<string, unknown>): unknown;
}

const productIds = PRODUCTS.map((p) => p.id);
const supplierIds = SUPPLIERS.map((s) => s.id);

const MARKET_IDS: MarketId[] = ['US', 'DE', 'UK', 'BD'];
const CHANNEL_IDS: Channel[] = ['own', 'marketplace', 'retail', 'unsure'];
const PRIORITY_IDS: Priority[] = ['risk', 'steady', 'profit', 'growth', 'simple'];

const briefProps = {
  market: { type: 'string', enum: MARKET_IDS, description: 'Where the seller sells' },
  budget: { type: 'number', minimum: 300, maximum: 20000, description: 'Total budget in US dollars' },
  channel: { type: 'string', enum: CHANNEL_IDS, description: 'own = own online store, marketplace = Amazon and similar' },
  priorities: {
    type: 'array', maxItems: 3, items: { type: 'string', enum: PRIORITY_IDS },
    description: 'risk = lower risk, steady = steady demand, profit = profitability, growth = growth potential, simple = simple sourcing',
  },
  category: { type: 'string', enum: ['pet', 'kitchen', 'fitness', 'electronics'], description: 'Which category to rank: pet supplies, kitchen, home fitness or phone accessories (electronics)' },
  split: { type: 'string', enum: ['safe', 'balanced', 'stock'], description: 'How much of the budget goes on stock: safe = 60%, balanced = 70%, stock = 85%' },
};

/** Models send loosely typed input. Keep only what is valid. */
function readBrief(input: Record<string, unknown>, withExperience = false): Partial<Profile> {
  const out: Partial<Profile> = {};
  if (MARKET_IDS.includes(input.market as MarketId)) out.market = input.market as MarketId;
  const b = Number(input.budget);
  if (Number.isFinite(b) && b >= 300) out.budget = Math.min(20000, Math.round(b / 50) * 50);
  if (CHANNEL_IDS.includes(input.channel as Channel)) out.channel = input.channel as Channel;
  if (Array.isArray(input.priorities)) {
    const pr = input.priorities.filter((x): x is Priority => PRIORITY_IDS.includes(x as Priority)).slice(0, 3);
    if (pr.length) out.priorities = pr;
  }
  if (input.category === 'pet' || input.category === 'kitchen' || input.category === 'fitness' || input.category === 'electronics') out.category = input.category;
  if (input.split === 'safe' || input.split === 'balanced' || input.split === 'stock') out.split = input.split;
  if (withExperience && (input.experience === 'new' || input.experience === 'existing')) out.experience = input.experience as Experience;
  return out;
}
const asProduct = (v: unknown) => (typeof v === 'string' && productIds.includes(v) ? v : null);

const row = (r: ProductResult) => ({
  id: r.product.id,
  name: r.product.name,
  rank: r.rank ?? 'over budget',
  verdict: r.verdict.label,
  reason: r.verdict.reason,
  profitPerSale: r.stack.profit,
  marginPct: Math.round(r.stack.margin * 100),
  shelfPrice: r.stack.price,
  minOrder: r.stack.moq,
  firstOrderTotal: r.stack.firstOrder,
  demand12mPct: r.demand.trend,
  demandNote: demandNote(r),
  crowdedness0to100: r.crowd,
  returnsPct: Math.round(r.product.returns * 100),
});

const table = (run: Run) => ({
  firstOrderLimit: run.cap,
  productsThatFit: run.fits.map(row),
  overBudget: run.over.map((r) => ({ ...row(r), fitsFromBudget: r.needsBudget })),
});

const STAGE_NOTE: Record<Ctx['stage'], string> = {
  start: 'They have not started yet. Offer to find a product idea, or to run the whole search for them.',
  setup: 'They are answering the three setup questions (market, budget, sales channel).',
  category: 'They are choosing a category: pet supplies, kitchen, home fitness or phone accessories.',
  pick: 'They are picking a product to find suppliers for.',
  opportunities: 'They are looking at the ranked product list and have not chosen a product yet.',
  suppliers: 'They chose a product and are looking at the supplier shortlist. No inquiry has been sent.',
  waiting: 'An inquiry has been sent to the shortlisted suppliers. Replies are not in yet.',
  check: 'Their samples have arrived. They are rating each sample on eight points (good, minor issue, problem); only they can judge a sample in hand. Scout compares once every point is rated.',
  order: 'Scout has prepared their first order with the chosen supplier. Nothing is paid until they approve it.',
  ordered: 'Their first order is placed. Money stays with Orvane until the goods arrive and match the sample.',
  quotes: 'Quotes are in from the contacted suppliers. They have not requested samples yet.',
  decision: 'They are reviewing the final plan before requesting samples.',
  done: 'Samples have been requested. The journey is complete.',
};

export function scoutInstructions(ctx: Ctx, opts: { chipsTool: boolean }): string {
  const p = ctx.profile;
  const run = evaluate(p);
  const chosen = ctx.productId ? productById(ctx.productId) : null;
  const recall = ctx.recall?.productId && ctx.recall.productId !== ctx.productId ? productById(ctx.recall.productId) : null;
  return `You are Scout, the sourcing agent inside Orvane, a B2B marketplace. You help a seller decide what to sell and whom to buy it from, and you move their search forward for them.

# How you work
- Everything you know about products, suppliers and markets comes from the data below and from your tools. It is simulated marketplace data. Never use outside knowledge for prices, demand, duty rates or suppliers, and never invent a figure.
- For any "what if" (another market, budget, sales channel, set of priorities, ad cost or shelf price), call \`recalculate\` and answer from its result. Do not do the arithmetic yourself.
- Only call \`updateBrief\` when the seller clearly tells you to change their brief. "What if I sold in Germany?" is a what-if: use \`recalculate\`, then offer the switch as a next step.
- Call \`productDetail\` or \`supplierCheck\` before explaining a cost breakdown or judging a supplier.
- Use \`showOnScreen\` when seeing something would help more than describing it.
- When the seller tells you to do a step (show the products, choose a product, ask for quotes, move on, review the plan, request samples, or run the rest for them), call \`takeStep\`. Do not just describe the step.
- You can prepare a message to suppliers and a sample request, but you cannot send or pay. Both open an approval sheet, and only the seller's click sends anything.
- You have data for the United States, Germany, the United Kingdom and Bangladesh, and for four product categories: pet supplies, kitchen, home fitness and phone accessories, six to nine products each, with suppliers for each. Bangladesh figures are in US dollars, at about 122 taka to the dollar. For anything else, say plainly that you don't have data for it and offer what you can do instead.

# How Orvane works (answer these from here, never invent alternatives)
- The first order may use only part of the budget. Three splits: Careful (60% on stock), Balanced (70%, Scout's pick for new sellers) and More stock (85%, Scout's pick for existing sellers, who usually pay for ads from other money). Never more than 85%: samples must always be paid for. The rest pays for samples, launch ads and a buffer, because running out of money after the stock arrives is the most common first-order failure. The seller can change the split on the budget card or by asking; use the split field to change it.
- Suppliers: Scout reads every listing, keeps those with a verified licence and a track record, then shortlists those that pass every check within the budget. Promoted suppliers pay Orvane for visibility when buyers browse Orvane and for a richer profile (their own video and catalogue, shown labelled as theirs); promotion never enters the ranking, so it neither helps nor hurts them. Orvane Verified is a factory audit by an independent inspector that the supplier pays for and the inspector decides; a passed audit is real evidence and can raise the ranking. Money alone can never buy a place. Paying outside Orvane is the classic scam pattern, so such suppliers are set aside.
- The quote request asks for the best unit price at the minimum order and at double it, the minimum order and production time, the sample cost with shipping, and logo printing. Suppliers see only the seller's business name and Orvane inbox, never email, phone, budget or payment details. Scout follows up once after 24 hours of silence, then stops.
- Payment always goes through Orvane's checkout, which holds the money until the goods arrive as described.
- Samples arrive in 7 to 10 days. Scout samples two suppliers (best profit and smallest first order) so a poor sample still leaves an option. After samples: an eight-point check, then the seller places the first order. Nothing else is spent before that.
- Timeline to stock in hand: about a week for quotes and samples, production (each supplier states its own days), then three to four weeks at sea.
- Scout cannot know sales speed. For income questions give the per-sale profit and simple what-ifs (for example 1, 3 or 10 sales a day), and name ad cost as the biggest guess.
- Pet supplies, kitchen, home fitness and phone accessories have product data; to look at another of these, use the category field. For other categories you may reason from these category-level estimates, and must say they are estimates:
${CATEGORIES.map((c) => `  - ${c.name}: ${c.verdict}. Returns ${c.returns}; ${c.shipping}; sells ${c.season}; typical first order about $${c.firstOrder}${c.rules ? `; rules: ${c.rules(p)}` : ''}.`).join('\n')}
- In this concept Scout is free for sellers; Orvane earns from supplier fees and paid promotion.
- Bangladesh: duty simplified to 45%, 15% VAT inside the price, most orders cash on delivery with some parcels refused at the door, profit judged against local prices (about half the US level). Budgets may be given in taka; there are about 122 taka to the dollar, and one lakh is 100,000.

# How you talk
- Lead with the verdict or the number, then the reason. Two to four short sentences is typical. Stay under 90 words unless the seller asks for detail.
- Every claim about money or demand carries its number. Profit, ad cost and demand are estimates, so say "about". Licences, audits and order counts are verified. Product quality is unknown until samples arrive.
- Say what you don't know in plain words. Name the biggest guess when it matters; for profit that is ad cost per sale.
- Disagree when the numbers disagree with the seller. If they like a product that loses money, say so and name the cost that causes it.
- No hype. Never say winning, guaranteed, viral, explode or passive income.
- Use **bold** for one or two key figures at most, and short "- " lists when listing. No headings, tables or emoji. All money is in US dollars.
- Write only the answer. Do not announce that you are about to use a tool.
- ${p.experience === 'new' ? 'The seller is new to sourcing. Explain a trade term in a few plain words the first time you use it.' : 'The seller knows trade terms. Be brief.'}
- ${opts.chipsTool
    ? 'Finish every answer by calling `suggestNextSteps` with two or three follow-ups the seller could tap, each under seven words.'
    : 'End every answer with one last line in exactly this form, listing two or three follow-ups the seller could tap, each under seven words:\nNEXT: first follow-up | second follow-up | third follow-up'}

# The seller
Sam. ${EXPERIENCE[p.experience].name}.
Brief: sells in ${MARKETS[p.market].name}; budget ${money0(p.budget)}; channel: ${CHANNELS[p.channel].name}; priorities: ${p.priorities.map((x) => PRIORITIES[x].name).join(', ') || 'none set'}.
Split: ${SPLITS[splitOf(p)].name}${p.split ? '' : ' (Scout\'s pick)'}. The first order may use at most ${Math.round(shareOf(p) * 100)}% of the budget (${money0(run.cap)}). The rest is held for samples, launch ads and a buffer.

# Where they are
${STAGE_NOTE[ctx.stage]}
${chosen ? `Chosen product: ${chosen.name} (id ${chosen.id}).` : 'No product chosen yet.'}
${recall ? `The conversation last touched this product, so "it" most likely means: ${recall.id}.` : ''}
${ctx.focusProductId ? `They currently have this product open on screen: ${ctx.focusProductId}.` : ''}
${ctx.focusSupplierId ? `They currently have this supplier open on screen: ${ctx.focusSupplierId}.` : ''}
${ctx.contacted.length ? `Suppliers contacted: ${ctx.contacted.join(', ')}. Quotes ${ctx.quotesReady ? 'are in (use the `quotes` tool)' : 'are not in yet'}.` : ''}
${ctx.samplesRequested ? `Samples requested from: ${ctx.sampleIds.join(', ')}.` : ''}

# Current ranking for this brief
${JSON.stringify(table(run))}

Supplier ids: ${supplierIds.join(', ')}.`;
}

export function scoutTools(ctx: Ctx, emit: (e: ScoutEvent) => void, opts: { chipsTool: boolean }): ScoutTool[] {
  let profile: Profile = { ...ctx.profile };
  let productId = ctx.productId;
  const merge = (patch: Partial<Profile>): Profile => ({ ...profile, ...patch });

  const tools: ScoutTool[] = [
    {
      name: 'recalculate',
      description: 'Re-run the product ranking and the cost of one sale under different assumptions, without changing anything on screen. Use this for every what-if. Returns what changed and the new ranking.',
      schema: {
        type: 'object',
        properties: {
          ...briefProps,
          adCostPerSale: { type: 'number', minimum: 0, maximum: 100, description: 'Ad cost per sale in dollars to assume instead of the estimate' },
          shelfPriceProductId: { type: 'string', enum: productIds, description: 'Product to test a different shelf price for' },
          shelfPrice: { type: 'number', minimum: 1, maximum: 500, description: 'The shelf price to test for that product, in dollars' },
        },
      },
      run(input) {
        const next = merge(readBrief(input));
        const ad = Number.isFinite(Number(input.adCostPerSale)) && input.adCostPerSale !== undefined && input.adCostPerSale !== null ? Number(input.adCostPerSale) : undefined;
        const pid = asProduct(input.shelfPriceProductId);
        const price = pid && Number(input.shelfPrice) > 0 ? { id: pid, value: Number(input.shelfPrice) } : undefined;
        const base = evaluate(profile);
        const run = evaluate(next, { ad, price });
        const diff = diffRuns(base, run);
        return { assumed: { ...next, adCostPerSale: ad, shelfPrice: price }, whatChanged: { summary: diff.headline, moves: diff.moves.map((m) => `${m.name}: ${m.why}`), notes: diff.notes }, ...table(run) };
      },
    },
    {
      name: 'productDetail',
      description: 'The full cost of one sale for a product under the current brief, with the reasons behind its verdict, its main risk and its break-even points.',
      schema: { type: 'object', properties: { productId: { type: 'string', enum: productIds } }, required: ['productId'] },
      run(input) {
        const id = asProduct(input.productId);
        if (!id) throw new Error(`Unknown product. Use one of: ${productIds.join(', ')}`);
        const run = evaluate(profile);
        const r = run.results.find((x) => x.product.id === id)!;
        const e = explain(r, run);
        const s = r.stack;
        return {
          ...row(r),
          oneSale: { shelfPrice: s.price, salesTaxInsidePrice: s.tax, unitCost: s.cost, shippingPerUnit: s.ship, importDuty: s.duty, paymentOrMarketplaceFees: s.fees, adCostPerSale_biggestGuess: s.ad, returnsAllowance: s.returns, profitPerSale: s.profit },
          landedCostPerUnit: s.landed,
          unitsToSellToRecoverFirstOrder: Number.isFinite(s.breakEvenUnits) ? s.breakEvenUnits : 'never at these numbers',
          adCostWhereProfitHitsZero: s.breakEvenAd,
          reasons: e.points.map((x) => `${x.text} (${x.ev})`),
          mainRisk: e.risk.text,
          supplierListingsOnOrvane: r.product.listings,
          papersNeededToSell: rulesFor(r.product, profile.market).map((x) => `${x.name}: ${x.why}`),
        };
      },
    },
    {
      name: 'supplierCheck',
      description: 'Every supplier Scout checked for a product: verdict, price, minimum order, first order total, profit per sale, verified facts and warning signs.',
      schema: { type: 'object', properties: { productId: { type: 'string', enum: productIds, description: 'Defaults to the chosen product' } } },
      run(input) {
        const id = asProduct(input.productId) ?? productId ?? evaluate(profile).fits[0]?.product.id ?? productIds[0];
        const run = evaluateSuppliers(id, profile);
        return {
          product: run.product.name,
          listingsChecked: run.product.listings,
          typicalUnitPrice: run.medianUnit,
          suppliers: run.results.map((r) => ({
            id: r.supplier.id, name: r.supplier.name, rank: r.rank, verdict: r.label, reason: r.reason,
            paysToBePromoted: r.supplier.promoted, type: r.supplier.type,
            unitPrice: r.unit, minOrder: r.moq, firstOrderTotal: r.stack.firstOrder, profitPerSale: r.stack.profit,
            warningSigns: r.flags,
            facts: supplierFacts(r, run).map((f) => `${f.label}: ${f.value} (${f.ev})`),
          })),
        };
      },
    },
    {
      name: 'quotes',
      description: 'The quotes that came back from contacted suppliers, with sample costs and which two Scout would sample.',
      schema: { type: 'object', properties: {} },
      run() {
        if (!productId || !ctx.contacted.length) return { status: 'No inquiry has been sent yet.' };
        if (!ctx.quotesReady) return { status: 'The inquiry was sent. Replies are not in yet.' };
        const qs = quotesFor(productId, profile, ctx.contacted);
        const picks = pickSamples(qs);
        return {
          quotes: qs.map((q) => ({
            id: q.supplier.id, name: q.supplier.name, listedUnitPrice: q.listed, quotedUnitPrice: q.unit, minOrder: q.moq,
            firstOrderTotal: q.stack.firstOrder, profitPerSale: q.stack.profit, sampleCostWithShipping: q.sampleCost,
            repliedAfterDays: q.day, neededFollowUp: q.followUp, note: q.note,
          })),
          scoutWouldSample: picks.map((q) => q.supplier.name),
          sampleTotal: picks.reduce((a, q) => a + q.sampleCost, 0),
        };
      },
    },
    {
      name: 'updateBrief',
      description: "Change the seller's brief on screen. Only when the seller clearly asks for the change. Returns what moved in the ranking.",
      schema: { type: 'object', properties: { ...briefProps, experience: { type: 'string', enum: ['new', 'existing'] } } },
      run(input) {
        const clean = readBrief(input, true);
        if (!Object.keys(clean).length) return { status: 'Nothing to change.' };
        const before = evaluate(profile);
        profile = merge(clean);
        const after = evaluate(profile);
        const diff = diffRuns(before, after);
        emit({ type: 'act', act: { t: 'profile', patch: clean, quiet: true } });
        return { status: 'The brief on screen is updated. The seller can undo it.', whatChanged: { summary: diff.headline, moves: diff.moves.map((m) => `${m.name}: ${m.why}`), notes: diff.notes }, ...table(after) };
      },
    },
    {
      name: 'showOnScreen',
      description: "Open something on the seller's screen: a product, its cost breakdown, a supplier, a side-by-side comparison of products, suppliers or every market, or their plan. Returns whether it opened.",
      schema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['product', 'productMaths', 'supplier', 'compareProducts', 'compareSuppliers', 'compareMarkets', 'plan'] },
          ids: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'Product ids or one supplier id, depending on the view' },
        },
        required: ['view'],
      },
      run(input) {
        const ids = Array.isArray(input.ids) ? input.ids.map(String) : [];
        const prods = ids.filter((id) => productIds.includes(id));
        const sup = ids.find((id) => supplierIds.includes(id));
        const view = String(input.view);
        let act: Act | null = null;
        if (view === 'product' && prods[0]) act = { t: 'open', id: prods[0] };
        if (view === 'productMaths' && prods[0]) act = { t: 'open', id: prods[0], maths: true };
        if (view === 'supplier' && sup) act = { t: 'openSupplier', id: sup };
        if (view === 'compareProducts') act = { t: 'compare', ids: prods.length >= 2 ? prods : undefined };
        if (view === 'compareSuppliers') act = { t: 'compareSup' };
        if (view === 'compareMarkets') act = { t: 'compareMarkets' };
        if (view === 'plan') act = { t: 'plan' };
        if (!act) return { status: 'Could not open that. Check the ids.' };
        emit({ type: 'act', act });
        return { status: 'Shown on screen.' };
      },
    },
    {
      name: 'takeStep',
      description: 'Move the seller\'s search forward on screen. showProducts ranks the products. chooseProduct picks one and checks its suppliers. draftQuoteRequest and draftSampleRequest open an approval sheet; nothing is sent or paid until the seller approves. runTheRest lets Scout carry the whole search to the next approval. Returns what happened.',
      schema: {
        type: 'object',
        properties: {
          step: { type: 'string', enum: ['showProducts', 'chooseProduct', 'draftQuoteRequest', 'skipTheWait', 'reviewPlan', 'draftSampleRequest', 'backToProducts', 'runTheRest'] },
          productId: { type: 'string', enum: productIds, description: 'Only for chooseProduct' },
        },
        required: ['step'],
      },
      run(input) {
        const step = String(input.step);
        const go = (act: Act, status: string) => { emit({ type: 'act', act }); return { status }; };
        if (step === 'showProducts') return go({ t: 'category' }, 'The ranked product list is on screen.');
        if (step === 'chooseProduct') {
          const id = asProduct(input.productId) ?? evaluate(profile).fits[0]?.product.id;
          if (!id) return { status: 'No product fits the budget, so there is nothing to choose. Suggest raising the budget.' };
          const r = evaluate(profile).results.find((x) => x.product.id === id)!;
          productId = id;
          return go({ t: 'choose', id }, r.verdict.tier === 'skip' || r.verdict.tier === 'out'
            ? `Scout's own verdict on the ${r.product.short} is "${r.verdict.label}: ${r.verdict.reason}", so the screen now asks the seller to confirm or switch.`
            : `The ${r.product.short} is chosen and its suppliers are being checked on screen.`);
        }
        if (step === 'draftQuoteRequest') {
          if (!productId) return { status: 'No product is chosen yet. Choose one first.' };
          if (ctx.contacted.length) return { status: 'The quote request was already sent.' };
          const sr = evaluateSuppliers(productId, profile);
          if (!sr.shortlist.length) return { status: 'No supplier passes every check, so there is nobody to ask.' };
          return go({ t: 'draftInquiry' }, `The message to ${sr.shortlist.length} suppliers is open for approval. It is not sent until the seller presses Send.`);
        }
        if (step === 'skipTheWait') return ctx.stage === 'waiting' ? go({ t: 'skip' }, 'Skipping ahead two days. The quotes are arriving on screen.') : { status: 'There is nothing to wait for right now.' };
        if (step === 'reviewPlan') return ctx.quotesReady ? go({ t: 'review' }, 'The plan is on screen.') : { status: 'The plan needs quotes first. They are not in yet.' };
        if (step === 'draftSampleRequest') return ctx.quotesReady ? go({ t: 'draftSamples' }, 'The sample request is open for approval. Nothing is paid until the seller approves.') : { status: 'Samples come after quotes. They are not in yet.' };
        if (step === 'backToProducts') return go({ t: 'goto', stage: 'opportunities' }, 'Back on the product list.');
        if (step === 'runTheRest') return go({ t: 'auto' }, 'Scout is now running the search on screen and will stop at the next approval.');
        return { status: 'Unknown step.' };
      },
    },
  ];

  if (opts.chipsTool) {
    tools.push({
      name: 'suggestNextSteps',
      description: 'Offer two or three short follow-ups the seller can tap. Call this once, at the end of every answer.',
      schema: { type: 'object', properties: { options: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', maxLength: 60 } } }, required: ['options'] },
      run(input) {
        const options = (Array.isArray(input.options) ? input.options : []).map(String).filter(Boolean).slice(0, 3);
        if (options.length) emit({ type: 'chips', chips: options });
        return { status: 'Shown.' };
      },
    });
  }
  return tools;
}

/** A short line for the working checklist while a tool runs. */
export function stepLabel(name: string, input: Record<string, unknown>): string | null {
  if (name === 'recalculate') {
    if (input.market) return `Recalculating for ${MARKETS[input.market as Profile['market']]?.name ?? 'another market'}`;
    if (input.budget) return `Recalculating with a ${money0(Number(input.budget))} budget`;
    if (input.adCostPerSale !== undefined && input.adCostPerSale !== null) return `Testing ads at ${money(Number(input.adCostPerSale))} per sale`;
    if (input.shelfPrice) return 'Testing a different shelf price';
    if (input.channel) return 'Recalculating for a different sales channel';
    return 'Re-ranking for different priorities';
  }
  if (name === 'productDetail') return `Checking the maths on the ${productById(String(input.productId))?.short ?? 'product'}`;
  if (name === 'supplierCheck') return 'Checking supplier records';
  if (name === 'quotes') return 'Reading the quotes';
  if (name === 'updateBrief') return 'Updating your brief';
  if (name === 'showOnScreen') return 'Opening it on screen';
  if (name === 'takeStep') return 'Moving your search forward';
  return null;
}

/** Splits a streamed answer into the words to show and the follow-ups on its last line. */
export function splitNext(full: string): { text: string; chips: string[] } {
  const m = full.match(/\n?\s*NEXT:\s*(.*)\s*$/s);
  if (!m || m.index === undefined) {
    // Hide a half-written marker while the answer is still arriving.
    const partial = full.match(/\n\s*(N|NE|NEX|NEXT)$/);
    return { text: (partial && partial.index !== undefined ? full.slice(0, partial.index) : full).trimEnd(), chips: [] };
  }
  const chips = m[1].split('|').map((x) => x.trim().replace(/^[-•\d.)\s]+/, '')).filter((x) => x.length > 1 && x.length <= 60).slice(0, 3);
  return { text: full.slice(0, m.index).trimEnd(), chips };
}
