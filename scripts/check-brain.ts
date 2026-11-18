/** Checks that Scout's built-in language layer reads requests the way a seller means them. */
import type { Act, Ctx, Rating } from '../lib/acts';
import { answer, command, extractBrief, opening } from '../lib/brain';
import { capOf, compareCategories, evaluate, evaluateSuppliers, quotesFor, splitOf } from '../lib/engine';
import { checkPoints, checkVerdict, sampleResults } from '../lib/samples';
import { CATEGORY_ORDER, DEFAULT_PROFILE } from '../lib/data';
import { BANK, CTX, JOURNEY } from './question-bank';
import { rulesFor } from '../lib/knowledge';
import { productById } from '../lib/data';

const base: Ctx = { stage: 'opportunities', profile: DEFAULT_PROFILE, productId: null, focusProductId: null, focusSupplierId: null, contacted: [], quotesReady: false, sampleIds: [], samplesRequested: false, recall: { productId: null, supplierId: null }, auto: false };
const sup: Ctx = { ...base, stage: 'suppliers', productId: 'travel-set' };
const quotes: Ctx = { ...sup, stage: 'quotes', contacted: ['ningbo', 'shenzhen', 'haiphong'], quotesReady: true };

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  if (!ok) { failed++; console.error(`✗ ${name}`, got ?? ''); } else console.log(`✓ ${name}`);
};
const acts = (q: string, c: Ctx): Act[] => (command(q, c) ?? answer(q, c)).acts ?? [];
const says = (q: string, c: Ctx): string => (command(q, c) ?? answer(q, c)).text;
const does = (q: string, c: Ctx, t: Act['t'], extra: Record<string, unknown> = {}) => {
  const a = acts(q, c).find((x) => x.t === t) as Record<string, unknown> | undefined;
  check(`"${q}" → ${t}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`, Boolean(a) && Object.entries(extra).every(([k, v]) => JSON.stringify(a![k]) === JSON.stringify(v)), acts(q, c));
};

/* Telling Scout to do something */
does('choose the slow feeder', base, 'choose', { id: 'slow-feeder' });
does('go with the second one', base, 'choose', { id: 'slow-feeder' });
does("let's pick the LED collar", base, 'choose', { id: 'led-collar' });
does('find suppliers', base, 'choose', { id: 'travel-set' });
does('ask them for quotes', sup, 'draftInquiry');
does('please contact the suppliers', sup, 'draftInquiry');
does('request samples', quotes, 'draftSamples');
does('review my plan', quotes, 'review');
does('back to products', sup, 'goto', { stage: 'opportunities' });
does('open the lick mat', base, 'open', { id: 'lick-mat' });
does('show me ningbo', sup, 'openSupplier', { id: 'ningbo' });
does('open the second one', sup, 'openSupplier', { id: 'shenzhen' });
does('continue', sup, 'draftInquiry');
does('take it from here', base, 'auto');
does('do it for me', sup, 'auto');
does('just find me the best product', { ...base, stage: 'start' }, 'auto');
does('stop', { ...sup, auto: true }, 'stopAuto');
does('I have $5,000 and sell in the UK', base, 'profile', { patch: { market: 'UK', budget: 5000 } });
does('switch to Germany', base, 'profile', { patch: { market: 'DE' } });
does('compare the slow feeder and the lick mat', base, 'compare', { ids: ['slow-feeder', 'lick-mat'] });

/* Asking is not telling */
check('"should I choose the slow feeder?" does not choose', !acts('should I choose the slow feeder?', base).some((a) => a.t === 'choose'));
check('"what if I sold in Germany?" does not change the brief', !acts('what if I sold in Germany?', base).some((a) => a.t === 'profile'));
check('"can you ask them for quotes?" before a product explains what is missing', /need a product/.test(says('ask them for quotes', base)));
check('"request samples" before quotes explains the order of steps', /after the quotes/.test(says('request samples', sup)));

/* Answers come from the engine */
check('two changes at once are one scenario', /Germany as your market, a \$4,000 budget and selling on a marketplace/.test(says('what if I had $4,000 and sold in Germany on Amazon?', base)));
check('ad cost and market together', /ads at \$10\.00 per sale/.test(says('what if ads cost $10 and I sold in the UK?', base)));
check('fewest returns names the lick mat', /Lick mat\*\* has the fewest returns/.test(says('which has the fewest returns?', base)));
check('fastest growth warns about the loss-maker', /growing fastest[\s\S]*Skip for now/.test(says('which is growing fastest?', base)));
check('units sold becomes a total', /\$2,184/.test(says('how much would I make if I sell 200 units?', base)));
check('"it" follows the last product discussed', /LED collar/.test(says('is it worth it?', { ...base, recall: { productId: 'led-collar', supplierId: null } })));
check('"is it safe" follows the last supplier discussed', /avoid Dongguan Silico/.test(says('is it safe?', { ...sup, recall: { productId: null, supplierId: 'dongguan' } })));
check('simulated data is admitted plainly', /^No\. Everything in this prototype is simulated/.test(says('is this real data?', base)));
check('out of scope is declined', /outside what I do/.test(says('book me a flight to Shenzhen', base)));
check('asking about the market already set compares the others', /already selling in Germany[\s\S]*The US/.test(says('What if I sold in Germany instead?', { ...base, profile: { ...DEFAULT_PROFILE, market: 'DE' } })));
check('unknown market is not guessed', /don't have data for Canada/.test(says('what about Canada?', base)));

/* How sellers open */
const opens: [string, 'new' | 'existing' | undefined, 'idea' | 'suppliers' | null][] = [
  ["Hey I am a new merchant I want to source product for my business but I dont know which product I should go for", 'new', 'idea'],
  ['I want to start selling but no idea what', 'new', 'idea'],
  ["I'm a beginner, what should I sell?", 'new', 'idea'],
  ['help me find a product to sell', undefined, 'idea'],
  ['I already sell on Amazon and want to add a new product', 'existing', 'idea'],
  ['I run a Shopify store and want to expand my range', 'existing', 'idea'],
  ['My current supplier is always late, I need a better one', 'existing', 'suppliers'],
  // Needing a cheaper supplier for a product they have means they already sell it.
  ['I need a cheaper supplier for my slow feeder bowls', 'existing', 'suppliers'],
  ['We are an existing seller looking for a new manufacturer', 'existing', 'suppliers'],
];
for (const [q, exp, goal] of opens) {
  const o = opening(q);
  check(`opening "${q.slice(0, 48)}" → ${exp ?? 'experience unknown'}, ${goal}`, Boolean(o) && o!.experience === exp && o!.goal === goal, o);
}
check('a new seller is not read as an existing one', extractBrief('Hey I am a new merchant, I dont know which product').patch.experience === 'new');
check('an Amazon seller keeps the marketplace channel', extractBrief('I already sell on Amazon and want to add a new product').patch.channel === 'marketplace');
check('"find suppliers for my slow feeder" waits for the brief at the start', !acts('find suppliers for my slow feeder', { ...base, stage: 'start' }).some((a) => a.t === 'choose'));

/* Bangladesh and every region */
does('compare all regions', base, 'compareMarkets');
does('which market is best for me?', base, 'compareMarkets');
does('where should I sell?', base, 'compareMarkets');
does('switch to Bangladesh', base, 'profile', { patch: { market: 'BD' } });
check('3 lakh taka becomes a dollar budget', extractBrief('I have 3 lakh taka and sell in Bangladesh').patch.budget === 2450, extractBrief('I have 3 lakh taka and sell in Bangladesh').patch);
check('a taka what-if is answered in dollars and taka', /\$4,100 \(about ৳5,00,000\)/.test(says('what if I had 5 lakh taka?', base)), says('what if I had 5 lakh taka?', base));
check('Dhaka means Bangladesh', extractBrief('I sell from Dhaka on Facebook').patch.market === 'BD');
check('"what if I sold in Bangladesh?" answers from the engine', /In Bangladesh/.test(says('what if I sold in Bangladesh?', base)));

/* Categories are compared, not dismissed */
check('"why not another category" compares the four with real numbers', /Pet supplies\*\*: \d+ of 9 fit[\s\S]*Kitchen\*\*: \d+ of 6 fit[\s\S]*Home fitness[\s\S]*Phone accessories[\s\S]*no product data/.test(says('Why not another category?', { ...base, stage: 'category' })));
check('electronics gets a reasoned verdict with its rules', /hard for a first product[\s\S]*FCC/.test(says('what about electronics?', { ...base, stage: 'category' })));
check('a budget too small for a category is named', /over your \$1,750 limit/.test(says('can I sell clothes instead?', base)));
check('a pet product without data points to the nearest ones', /not one of the nine[\s\S]*LED collar|slow-feeder/.test(says('what about dog toys?', base)));

check('"how do you pick products" explains the ranking', /what you'd actually keep[\s\S]*Paid listings never/.test(says('How do you pick which products to show me?', { ...base, stage: 'start' })));

/* Promotion and verification */
const supCtx = { ...base, stage: 'suppliers' as const, productId: 'slow-feeder' };
check('promotion is explained as visibility, never rank', /visibility[\s\S]*neither helps nor hurts/.test(says('what does promoted mean?', supCtx)));
check('money cannot buy a rank', /^No\. Money can't buy a place/.test(says('can a supplier pay to rank higher?', supCtx)));
check('an unaudited factory gets its computed way up', /Orvane Verified audit and passed, it would join the shortlist in fourth place/.test(says('how could Xiamen get on the shortlist?', supCtx)));
check('a reseller is not offered a factory audit', !/Orvane Verified audit and passed/.test(says('how could Yiwu rank higher?', supCtx)));
check('Scout never says it ignores a payment', !/ignore/.test(says('what does promoted mean?', supCtx) + says('how does Orvane make money?', supCtx)));

/* A question about the first-order limit is answered, never read as a new budget */
const setupCtx = { ...base, stage: 'setup' as const };
for (const q of ['why 1750 when my budget is 2500', 'why is my first order only $1,750?', 'can I use all $2,500 for stock?', 'why not spend my whole budget?']) {
  check(`"${q}" explains the split`, command(q, setupCtx) === null && /Balanced[\s\S]*70% of your budget[\s\S]*never go above 85%/.test(says(q, setupCtx)));
}

/* The split: Scout's pick follows experience, and plain words change it */
const pro = { ...DEFAULT_PROFILE, experience: 'existing' as const };
check('an existing seller starts on More stock (85%)', splitOf(pro) === 'stock' && capOf(pro) === 2125);
check('a new seller starts on Balanced (70%)', splitOf(DEFAULT_PROFILE) === 'balanced' && capOf(DEFAULT_PROFILE) === 1750);
check('"I already have ad money" moves to More stock', JSON.stringify(command('I already have ad money, use more for stock', setupCtx)?.acts) === JSON.stringify([{ t: 'profile', patch: { split: 'stock' } }]));
check('a new seller is warned when stock leaves little back', /\$375[\s\S]*tight for a first launch/.test(command('use more for stock', setupCtx)?.text ?? ''));
check('"play it safe" moves to Careful', command('play it safe', setupCtx)?.acts?.[0]?.t === 'profile');
check('the existing seller explanation names the reason', /existing seller/.test(says('why is my first order only $2,125?', { ...setupCtx, profile: pro })));
check('more on stock lets more products fit, or as many', evaluate({ ...DEFAULT_PROFILE, split: 'stock' }).fits.length >= evaluate(DEFAULT_PROFILE).fits.length);

/* Four categories with products and suppliers */
for (const c of CATEGORY_ORDER) {
  const run = evaluate({ ...DEFAULT_PROFILE, category: c });
  const lead = run.fits.find((r) => r.verdict.tier !== 'skip');
  check(`${c}: has products, a lead and at least two shortlisted suppliers`, run.results.length >= 6 && Boolean(lead) && evaluateSuppliers(lead!.product.id, { ...DEFAULT_PROFILE, category: c }).shortlist.length >= 2);
  check(`${c}: suppliers only make this kind of product`, evaluateSuppliers(run.results[0].product.id, DEFAULT_PROFILE).results.every((r) => r.supplier.category === c));
}
check('Scout picks pet supplies for the default brief', compareCategories(DEFAULT_PROFILE).best === 'pet');
check('Scout picks home fitness in Germany when profit matters most', compareCategories({ ...DEFAULT_PROFILE, market: 'DE', priorities: ['profit'] }).best === 'fitness');
check('"what about kitchen?" answers with real numbers', /of 6 products fit[\s\S]*Herb keeper|herb keeper/.test(says('what about kitchen?', { ...base, stage: 'category' })));
check('naming a product from another category points there', /yoga mat is in home fitness/.test(says('how much does the yoga mat make?', base)));
check('the pet journey is unchanged', evaluate(DEFAULT_PROFILE).fits[0].product.id === 'travel-set' && capOf(DEFAULT_PROFILE) === 1750);

/* After samples: the check is the seller's, and Scout's verdict follows their ratings */
check('"what should I check" lists the same eight points as the screen', /Matches the listing photos[\s\S]*Worth the price/.test(says('what should I check?', CTX.chk)));
check('Scout says plainly it cannot check samples itself', /^I can't\. The samples are in your hands/.test(says('can you check the samples for me?', CTX.chk)));
{
  const prof = DEFAULT_PROFILE;
  const qs = quotesFor('travel-set', prof, ['ningbo', 'shenzhen', 'haiphong']);
  const picks = qs.filter((q) => ['ningbo', 'shenzhen'].includes(q.supplier.id));
  const pts = checkPoints('pet', prof, 24.99);
  const all = (v: Rating) => Object.fromEntries(pts.map((x) => [x.id, v]));
  const good = checkVerdict(sampleResults(picks, pts, { ningbo: all('good'), shenzhen: all('good') }), qs);
  check('both samples pass: the one with more profit per sale is picked', good.kind === 'pick' && good.best.q.supplier.id === 'ningbo');
  const fixed = checkVerdict(sampleResults(picks, pts, { ningbo: { ...all('good'), finish: 'minor', size: 'minor' }, shenzhen: all('good') }), qs);
  check('fewer fixes beats more profit', fixed.kind === 'pick' && fixed.best.q.supplier.id === 'shenzhen');
  const bad = checkVerdict(sampleResults(picks, pts, { ningbo: { ...all('good'), parts: 'problem' }, shenzhen: { ...all('good'), photos: 'problem', smell: 'problem' } }), qs);
  check('both fail: no order, and the next supplier is offered', bad.kind === 'none' && bad.closest.q.supplier.id === 'ningbo' && bad.next?.supplier.id === 'haiphong');
  const pending = checkVerdict(sampleResults(picks, pts, { ningbo: all('good') }), qs);
  check('no verdict until every point is rated', pending.kind === 'pending' && pending.left === 8);
}

/* The question bank: every one answered, none with the fallback */
const missed = BANK.filter(([stage, q]) => /didn't catch/.test((command(q, CTX[stage]) ?? answer(q, CTX[stage])).text));
check(`question bank: ${BANK.length - missed.length} of ${BANK.length} answered`, missed.length === 0, missed.map(([, q]) => q));

const lost = JOURNEY.filter(([stage, q]) => /didn't catch/.test((command(q, CTX[stage]) ?? answer(q, CTX[stage])).text));
check(`journey map: ${JOURNEY.length - lost.length} of ${JOURNEY.length} answered`, lost.length === 0, lost.map(([, q]) => q));

/* Questions that used to get a confident answer to a different question */
const on = (stage: string, q: string) => (command(q, CTX[stage]) ?? answer(q, CTX[stage])).text;
check('certificates get the selling rules, not other markets', /you'll need/.test(on('opp', 'Does this product need safety certificates to sell in the US?')));
check('sea or air compares freight, not factory times', /\*\*Sea\*\*, for the first order/.test(on('done', 'Should I ship by sea or by air?')));
check('suppliers outside China names Vietnam', /Vietnam/.test(on('sup', 'Are there suppliers outside China?')));
check('a link or photo is admitted, not read as a marketplace switch', /can't open links/.test(on('opp', 'I found this product on Amazon, can you find it for me?')));
check('asking for a lower price is honest about one round', /can't send a second round/.test(on('quo', 'Can you ask for a lower price?')));
check('both samples failing offers the next supplier', /Hai Phong/.test(on('chk', 'Both samples failed, what now?')));
check('a wireless charger needs FCC in the US and CE in Germany', rulesFor(productById('charging-stand')!, 'US').some((r) => /FCC/.test(r.name)) && rulesFor(productById('charging-stand')!, 'DE').some((r) => /CE/.test(r.name)));
check('a phone stand needs no papers in the US', rulesFor(productById('phone-stand')!, 'US').length === 0);
check('copying a brand exactly is refused', /I won't help copy/.test(on('opp', 'can I copy this brand exactly?')));
check('the beginner category question still compares categories', /four categories/.test(on('cat', 'Which category is best for a beginner?')));

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll language checks pass.');
