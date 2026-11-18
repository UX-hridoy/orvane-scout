import type { Rating } from './acts';
import { MARKETS } from './data';
import { money, money0 } from './format';
import type { CategoryId, Profile, Quote } from './types';

/**
 * After samples are requested: the days things happen on, the eight-point
 * check the seller does with the samples in hand, and what Scout makes of
 * their answers. Scout never rates a sample itself: only the seller can hold
 * it, so every judgement here starts from their ratings.
 */

/* ───────────── Dates ───────────── */

/** Every event is a number of days after the quote request. Shown as real dates, counted from the day the prototype was opened. */
const START = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; })();
export const dateOf = (day: number) => new Date(START.getTime() + day * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** How long samples take, in days after they are requested. */
export const SAMPLE_DAYS = { ship: 2, from: 7, to: 10, arrive: 8 };
/** Sea freight and customs after production. */
export const FREIGHT_DAYS = { sea: 28, customs: 4 };

export function orderTimeline(day: number, lead: number) {
  const made = day + 2 + lead;
  const landed = made + FREIGHT_DAYS.sea;
  const arrives = landed + FREIGHT_DAYS.customs;
  return [
    { key: 'placed', label: 'Order placed', day },
    { key: 'confirmed', label: 'Supplier confirms', day: day + 2 },
    { key: 'made', label: `Made in ${lead} days`, day: made },
    { key: 'sea', label: `By sea, about ${FREIGHT_DAYS.sea} days`, day: landed },
    { key: 'arrives', label: 'Clears customs and arrives', day: arrives },
  ];
}

/* ───────────── The eight-point check ───────────── */

/** title: the row label. noun: how Scout names it in a sentence ("failed on the finish"). */
export interface Point { id: string; title: string; hint: string; noun: string }

export function checkPoints(category: CategoryId, p: Profile, price: number): Point[] {
  const fourth: Record<CategoryId, Point> = {
    pet: { id: 'smell', title: 'No strong smell', hint: 'A chemical smell means cheap material. Pets notice it first.', noun: 'the smell' },
    kitchen: { id: 'smell', title: 'No strong smell', hint: 'Anything that touches food should smell of nothing.', noun: 'the smell' },
    fitness: { id: 'strength', title: 'Holds up under force', hint: 'Pull, press or stretch it harder than a buyer would.', noun: 'strength' },
    electronics: { id: 'works', title: 'Works as described', hint: 'Charge it, connect it and use it for a day.', noun: 'how it works' },
  };
  return [
    { id: 'photos', title: 'Matches the listing photos', hint: 'Colour, shape and parts are what you were shown.', noun: 'matching the photos' },
    { id: 'size', title: 'Size and weight as listed', hint: 'Measure it. Small differences turn into bad reviews.', noun: 'size' },
    { id: 'finish', title: 'Clean finish', hint: 'No rough edges, marks, loose threads or glue.', noun: 'the finish' },
    fourth[category],
    { id: 'parts', title: 'Moving parts work', hint: 'Clips, lids, hinges and buttons, twenty times each.', noun: 'the moving parts' },
    { id: 'packaging', title: 'Packaging protects it', hint: 'Would it survive a courier, and does it look ready to sell?', noun: 'the packaging' },
    { id: 'labels', title: 'Labels are right', hint: `Material, origin and any safety marks ${MARKETS[p.market].the} needs.`, noun: 'the labels' },
    { id: 'value', title: 'Worth the price', hint: `Would you pay ${money(price)} for it yourself?`, noun: 'value for money' },
  ];
}

export type Ratings = Record<string, Record<string, Rating>>;

export interface SampleResult { q: Quote; rated: number; problems: Point[]; minors: Point[]; complete: boolean }

export function sampleResults(picks: Quote[], points: Point[], ratings: Ratings): SampleResult[] {
  return picks.map((q) => {
    const r = ratings[q.supplier.id] ?? {};
    return {
      q,
      rated: points.filter((pt) => r[pt.id]).length,
      problems: points.filter((pt) => r[pt.id] === 'problem'),
      minors: points.filter((pt) => r[pt.id] === 'minor'),
      complete: points.every((pt) => r[pt.id]),
    };
  });
}

/** What Scout makes of the seller's ratings. */
export type CheckVerdict =
  | { kind: 'pending'; left: number }
  | { kind: 'pick'; best: SampleResult; other: SampleResult | null; why: string }
  | { kind: 'none'; closest: SampleResult; next: Quote | null };

const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const lower = (pts: Point[]) => pts.map((p) => p.noun);
/** "the finish and the packaging" */
export const nouns = (pts: Point[]) => and(lower(pts));

export function checkVerdict(results: SampleResult[], quotes: Quote[]): CheckVerdict {
  const left = results.reduce((n, r) => n + (r.complete ? 0 : 8 - r.rated), 0);
  if (left) return { kind: 'pending', left };
  // A sample with a problem is not one to order from. Among the rest: fewest fixes, then most profit per sale.
  const clean = results.filter((r) => !r.problems.length).sort((a, b) => a.minors.length - b.minors.length || b.q.stack.profit - a.q.stack.profit);
  if (!clean.length) {
    const closest = [...results].sort((a, b) => a.problems.length - b.problems.length || b.q.stack.profit - a.q.stack.profit)[0];
    const sampled = new Set(results.map((r) => r.q.supplier.id));
    const next = quotes.filter((q) => !sampled.has(q.supplier.id)).sort((a, b) => b.stack.profit - a.stack.profit)[0] ?? null;
    return { kind: 'none', closest, next };
  }
  const best = clean[0];
  const other = results.find((r) => r !== best) ?? null;
  const parts: string[] = [];
  if (!other) parts.push(best.minors.length ? `It passed, with ${best.minors.length === 1 ? 'one small fix' : `${best.minors.length} small fixes`} to ask for` : 'It passed every point');
  else if (other.problems.length) parts.push(`${other.q.supplier.short} failed on ${and(lower(other.problems))}`);
  else if (best.minors.length < other.minors.length) parts.push(`It needs fewer fixes than ${other.q.supplier.short}`);
  else parts.push(`Both passed, and it earns more per sale (${money(best.q.stack.profit)} against ${money(other.q.stack.profit)})`);
  if (other && best.minors.length) parts.push(`ask ${best.q.supplier.short} to fix ${and(lower(best.minors))} before production`);
  return { kind: 'pick', best, other, why: parts.join('; ') };
}

/** What a seller has left for launch after samples and the first order. */
export const leftForLaunch = (p: Profile, spent: number, order: number) => Math.max(0, p.budget - spent - order);
export const fmtLeft = (n: number) => money0(n);
