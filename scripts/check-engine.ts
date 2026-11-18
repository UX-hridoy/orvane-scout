/**
 * Checks the engine against the figures in the foundation document.
 * Run with: npm run test:engine
 */
import { DEFAULT_PROFILE, MARKET_ORDER } from '../lib/data';
import { compareMarkets, diffRuns, evaluate, evaluateSuppliers, pickSamples, quotesFor } from '../lib/engine';
import type { Profile } from '../lib/types';

let failed = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
}
const P = (patch: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...patch });
const table = (p: Profile) => evaluate(p).fits.map((r) => [r.product.id, r.stack.profit, r.stack.firstOrder, r.verdict.tier]);

eq('US ranking', table(P()), [
  ['travel-set', 10.92, 1590, 'worth'], ['slow-feeder', 6.86, 1395, 'worth'], ['led-collar', 7.59, 1410, 'care'],
  ['lick-mat', 4.61, 1175, 'care'], ['groom-glove', 5.28, 1228, 'skip'], ['hair-roller', -0.6, 1400, 'skip'],
]);
eq('US over budget', evaluate(P()).over.map((r) => [r.product.id, r.stack.profit, r.stack.firstOrder]).sort(), [
  ['cat-perch', 15.55, 2636], ['cooling-mat', 11.18, 2680], ['dog-bed', 27.36, 2700],
]);
eq('DE ranking', evaluate(P({ market: 'DE' })).fits.map((r) => [r.product.id, r.stack.profit, r.verdict.tier]), [
  ['slow-feeder', 7.83, 'worth'], ['travel-set', 11.23, 'care'], ['led-collar', 7.43, 'care'],
  ['lick-mat', 4.7, 'care'], ['groom-glove', 5.11, 'skip'], ['hair-roller', 1.09, 'skip'],
]);
const uk = evaluate(P({ market: 'UK' }));
eq('UK top', [uk.fits[0].product.id, uk.fits[0].stack.profit], ['travel-set', 9.07]);
eq('UK roller', uk.results.find((r) => r.product.id === 'hair-roller')!.stack.profit, -1);
eq('Marketplace travel set', evaluate(P({ channel: 'marketplace' })).fits[0].stack.profit, 12.19);
eq('Budget 4000 brings 3 back', evaluate(P({ budget: 4000 })).over.length, 0);
eq('Budget 800 fits nothing', evaluate(P({ budget: 800 })).fits.length, 0);
const us = evaluate(P());
eq('Stack lines', [us.fits[0].stack.cost, us.fits[0].stack.ship, us.fits[0].stack.duty, us.fits[0].stack.fees, us.fits[0].stack.ad, us.fits[0].stack.returns], [3.2, 1.3, 0.8, 1.02, 7, 0.75]);

const sup = evaluateSuppliers('travel-set', P());
eq('Suppliers', sup.results.map((r) => [r.supplier.id, r.unit, r.moq, r.stack.firstOrder, r.stack.profit, r.tier]), [
  ['ningbo', 3.2, 300, 1590, 10.92, 'shortlist'], ['shenzhen', 3.45, 200, 1122, 10.61, 'shortlist'], ['haiphong', 3.6, 300, 1644, 10.74, 'shortlist'],
  ['xiamen', 3.3, 300, 1626, 10.8, 'ask'], ['yiwu', 2.7, 500, 2340, 11.54, 'out'], ['dongguan', 2.4, 300, 1290, 11.92, 'avoid'],
]);
const quotes = quotesFor('travel-set', P(), sup.shortlist.map((r) => r.supplier.id));
eq('Quotes', quotes.map((q) => [q.supplier.id, q.unit, q.stack.firstOrder, q.stack.profit, q.sampleCost]), [
  ['ningbo', 3.1, 1554, 11.04, 40], ['shenzhen', 3.45, 1122, 10.61, 12], ['haiphong', 3.55, 1629, 10.79, 25],
]);
eq('Sample picks', pickSamples(quotes).map((q) => q.supplier.id), ['ningbo', 'shenzhen']);

const diff = diffRuns(evaluate(P()), evaluate(P({ market: 'DE' })));
console.log('\nUS -> DE:', diff.headline);
diff.moves.forEach((m) => console.log(`  ${m.name}: ${m.from} -> ${m.to} (${m.dir}) ${m.why}`));
diff.notes.forEach((n) => console.log('  note:', n));
const d2 = diffRuns(evaluate(P()), evaluate(P({ budget: 4000 })));
console.log('\n$2,500 -> $4,000:', d2.headline);
d2.moves.forEach((m) => console.log(`  ${m.name}: ${m.from} -> ${m.to} (${m.dir}) ${m.why}`));
const d3 = diffRuns(evaluate(P()), evaluate(P({ priorities: ['profit', 'growth'] })));
console.log('\nrisk+steady -> profit+growth:', d3.headline);
d3.moves.forEach((m) => console.log(`  ${m.name}: ${m.from} -> ${m.to} (${m.dir}) ${m.why}`));
console.log('\nUS verdicts:');
us.results.forEach((r) => console.log(`  ${r.rank ?? '-'} ${r.product.short.padEnd(20)} ${r.verdict.label}: ${r.verdict.reason}  [score ${r.score.toFixed(1)}]`));
console.log('\nUK verdicts:');
uk.results.forEach((r) => console.log(`  ${r.rank ?? '-'} ${r.product.short.padEnd(20)} ${r.stack.profit} ${r.verdict.label}: ${r.verdict.reason}`));
console.log('\nSupplier reasons:');
sup.results.forEach((r) => console.log(`  ${r.rank} ${r.supplier.short.padEnd(20)} ${r.label}: ${r.reason} [${r.score.toFixed(1)}]`));

/* Bangladesh: a lower-price market judged against its own prices */
const bd = evaluate(P({ market: 'BD' }));
eq('BD leader', bd.fits[0].product.id, 'travel-set');
eq('BD leader is worth testing', bd.fits[0].verdict.tier, 'worth');
eq('BD travel set profit', bd.fits[0].stack.profit, 3.57);
eq('BD window perch needs $4,000', bd.over.find((r) => r.product.id === 'cat-perch')!.needsBudget, 4000);
eq('BD with $4,000 leads with the window perch', evaluate(P({ market: 'BD', budget: 4000 })).fits[0].product.id, 'cat-perch');
eq('Best region for the default brief', compareMarkets(P(), MARKET_ORDER).best!.market.id, 'US');
eq('Nothing worth testing anywhere at $1,000', compareMarkets(P({ budget: 1000 }), MARKET_ORDER).best, null);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
