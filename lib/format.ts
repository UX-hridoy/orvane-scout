/** Rounds to cents on the exact decimal value, so 0.475 stored as 0.47499… gives 0.47. */
export const round2 = (n: number) => Number(n.toFixed(2));

export function money(n: number): string {
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '−$' : '$') + v;
}

export function money0(n: number): string {
  return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function trendText(t: number): string {
  if (t === 0) return 'Flat';
  return t > 0 ? `Up ${t}%` : `Down ${Math.abs(t)}%`;
}

export const ordinal = (n: number) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][n - 1] ?? `#${n}`;

export function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-03" becomes "Mar 2026" */
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
