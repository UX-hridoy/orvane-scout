import { auditPath } from './engine';
import { list, ordinal } from './format';
import type { SupRun, SupplierResult } from './types';

/**
 * How Orvane makes money from suppliers, said the same way everywhere.
 *
 * Promotion buys visibility: a higher place when buyers browse Orvane
 * themselves, and a richer profile (video, catalogue) shown in Scout,
 * labelled as the supplier's own. It never enters Scout's ranking, so it
 * neither helps nor hurts a supplier there.
 *
 * Orvane Verified is the honest way up: the supplier pays an independent
 * inspector to audit its factory, and the inspector decides the result.
 * A passed audit is new evidence, so it can raise the ranking.
 */

export const PROMOTED_TAG = 'Pays Orvane for visibility when buyers browse, and for a richer profile. Scout ranks by record only.';

export const PROMOTION_EXPLAINED =
  '**Promoted** suppliers pay Orvane for visibility: a higher place when you browse Orvane yourself, and a richer profile with their own video and catalogue, which I label as theirs. My ranking uses only their track record, so paying neither helps nor hurts them here.';

export const VERIFIED_EXPLAINED =
  "**Orvane Verified** is a factory audit by an independent inspector. The supplier books and pays for it, and the inspector, not Orvane, decides whether it passes. A passed audit is real evidence, so it can move a supplier up my ranking. Paying for promotion can't.";

const place = (r: SupplierResult, run: SupRun) => `${ordinal(r.rank)} of ${run.results.length}`;

/** The note in a promoted supplier's drawer. */
export function promotedNote(r: SupplierResult, run: SupRun): string {
  return `${r.supplier.short} pays Orvane for visibility when buyers browse, and for the profile below. Scout's ranking uses only its record, where it places ${place(r, run)}.`;
}

/** One line for Scout's message about the shortlist, covering every promoted supplier at once. */
export function promotedLine(run: SupRun): string | null {
  const promo = run.results.filter((r) => r.supplier.promoted);
  if (!promo.length) return null;
  const names = list(promo.map((r) => r.supplier.short));
  const where = list(promo.map((r) => ordinal(r.rank)));
  return promo.length === 1
    ? `${names} pays Orvane for promotion. That doesn't move it here: its record puts it ${where}.`
    : `${names} pay Orvane for promotion. That doesn't move them here: their records put them ${where}.`;
}

/** For a supplier held back only by a missing audit: what an Orvane Verified audit would change, worked out by the engine. */
export function auditNote(r: SupplierResult, run: SupRun): string | null {
  const next = auditPath(r, run);
  if (!next) return null;
  const joins = next.tier === 'shortlist';
  const move = next.rank < r.rank
    ? `move from ${ordinal(r.rank)} to ${ordinal(next.rank)}${joins ? ' and join the shortlist' : ''}`
    : joins ? `join the shortlist in ${ordinal(next.rank)} place` : `stay ${ordinal(next.rank)}`;
  return `A factory audit is the one check ${r.supplier.short} hasn't passed. If it booked an Orvane Verified audit and passed, it would ${move}. The supplier pays for the audit; an independent inspector decides the result.`;
}
