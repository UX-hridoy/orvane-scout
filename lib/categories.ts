import type { Reply } from './acts';
import { CATEGORY_META, CATEGORY_ORDER, MARKETS } from './data';
import { capOf, compareCategories } from './engine';
import { list, money, money0 } from './format';

/** Lower-cases a name for use mid-sentence, but leaves initialisms like LED alone. */
const soft = (name: string) => name.replace(/\b([A-Z])([a-z])/g, (_, a: string, b: string) => a.toLowerCase() + b);
import type { CategoryId, Profile } from './types';

/**
 * What Scout knows about whole categories. Pet supplies, kitchen, home
 * fitness and phone accessories also have product data, so for those Scout
 * answers with real figures; the rest are category-level estimates: not
 * supplies has product-by-product figures in this prototype. Like every
 * other figure here, they are simulated.
 */

export type Fit = 'good' | 'care' | 'hard';

export interface Category {
  id: string;
  name: string;
  /** Words a seller might use for it. */
  words: RegExp;
  fit: Fit;
  /** Share of orders sent back, as a range. */
  returns: string;
  /** How heavy or bulky it is to ship. */
  shipping: string;
  /** When it sells. */
  season: string;
  /** Rules to meet before selling, if any. */
  rules?: (p: Profile) => string;
  /** A typical first order, landed, in dollars. */
  firstOrder: number;
  /** The one thing that decides it for a first product. */
  verdict: string;
  /** What it would take to make it work. */
  take: string;
}

const rulesFor = (us: string, eu: string, bd: string) => (p: Profile) => (p.market === 'US' ? us : p.market === 'BD' ? bd : eu);

export const CATEGORIES: Category[] = [
  {
    id: 'pet', name: 'Pet supplies', words: /\bpets?\b|pet supplies|dog|cat\b/,
    fit: 'good', returns: '3 to 8%', shipping: 'small and light', season: 'all year, people buy again', firstOrder: 1400,
    verdict: 'small, light, bought again and again, and rarely sent back',
    take: 'nothing special. It is the easiest place to start',
  },
  {
    id: 'kitchen', name: 'Kitchen', words: /kitchen|storage|cookware|utensils?|containers?|home goods|household/,
    fit: 'care', returns: '4 to 7%', shipping: 'light, sometimes bulky', season: 'all year', firstOrder: 1500,
    verdict: 'steady demand, but very crowded and cheap, so little is left after ads',
    take: 'a product with a clear twist that people will pay more for, not another plain container',
  },
  {
    id: 'fitness', name: 'Home fitness', words: /fitness|gym|exercise|workout|yoga|sports?|dumbbells?|weights/,
    fit: 'care', returns: '6 to 9%', shipping: 'heavy or bulky', season: 'peaks in January, quiet in summer', firstOrder: 2600,
    verdict: 'heavy to ship and most sales come in a few weeks each January',
    take: 'small, light items like resistance bands, and stock that arrives before New Year',
  },
  {
    id: 'electronics', name: 'Phone accessories', words: /electronics?|gadgets?|phone (cases?|accessories)|chargers?|cables?|earbuds|headphones|speakers?|smart ?watch|tech/,
    fit: 'hard', returns: '10 to 15%', shipping: 'small and light', season: 'all year, peaks before holidays', firstOrder: 2200,
    verdict: 'many returns and faulty units, and prices drop fast as new models arrive',
    rules: rulesFor('FCC rules for anything that sends a signal', 'CE marking and electrical safety tests', 'BTRC approval for anything wireless'),
    take: 'a supplier with test reports, and a budget for faulty units',
  },
  {
    id: 'fashion', name: 'Clothing and fashion', words: /cloth(es|ing)|fashion|apparel|t-?shirts?|dress(es)?|shoes|sneakers|wear|hijab|saree|bags?|jewel(le)?ry|accessories/,
    fit: 'hard', returns: '20 to 30%', shipping: 'light', season: 'changes every season', firstOrder: 3000,
    verdict: 'one in four orders comes back over size or fit, and you need every size and colour in stock',
    take: 'one style in a few sizes, a clear size chart, and money set aside for returns',
  },
  {
    id: 'beauty', name: 'Beauty and skincare', words: /beauty|cosmetics?|skin ?care|make-?up|hair ?care|serums?|creams?|perfumes?|fragrance/,
    fit: 'hard', returns: '5 to 10%', shipping: 'small, some liquids', season: 'all year', firstOrder: 3500,
    verdict: 'ingredients and labels are regulated, and buyers need to trust the brand before they put it on their skin',
    rules: rulesFor('FDA registration and ingredient labelling', 'a safety report and a responsible person in the EU or UK', 'BSTI approval and labelling'),
    take: 'a supplier who supplies the safety documents, and patience to build reviews',
  },
  {
    id: 'toys', name: 'Toys', words: /toys?|games?|puzzles?|plush|lego|kids/,
    fit: 'hard', returns: '5 to 8%', shipping: 'light but boxy', season: 'most sales in the weeks before Christmas', firstOrder: 2400,
    verdict: 'safety testing is required for children\'s products, and most of the year\'s sales come in one season',
    rules: rulesFor('third-party testing and a Children\'s Product Certificate', 'EN 71 testing and CE marking', 'BSTI standards for children\'s goods'),
    take: 'test reports from the supplier, and stock that lands by October',
  },
  {
    id: 'baby', name: 'Baby products', words: /baby|babies|infant|toddler|nursery|stroller|diapers?/,
    fit: 'hard', returns: '6 to 10%', shipping: 'light to bulky', season: 'all year', firstOrder: 3000,
    verdict: 'the strictest safety rules of any category, and a mistake can hurt a child',
    rules: rulesFor('mandatory safety standards and testing for most items', 'EN safety standards and CE marking', 'BSTI standards for children\'s goods'),
    take: 'experience with product testing. Not a first product',
  },
];

const FIT_WORD: Record<Fit, string> = { good: 'Good first category', care: 'Possible, with care', hard: 'Hard for a first product' };

export function findCategory(text: string): Category | null {
  const t = text.toLowerCase();
  // Pet words count only when nothing else is named, so "dog toys" stays with pets.
  const others = CATEGORIES.filter((c) => c.id !== 'pet' && c.words.test(t));
  if (CATEGORIES[0].words.test(t)) return CATEGORIES[0];
  return others[0] ?? null;
}

const hasData = (id: string): id is CategoryId => (CATEGORY_ORDER as string[]).includes(id);
const look = (id: CategoryId, rec = false) => ({ label: `Look at ${CATEGORY_META[id].lower}`, act: { t: 'category' as const, id }, rec });

/** "Why not another category?": the four categories with data, judged for this brief, then the rest in a line. */
export function categoryOverview(p: Profile, _inCategoryStep: boolean): Reply {
  const { views, best } = compareCategories(p);
  const cur = p.category ?? 'pet';
  const rows = views.map((v) => `- **${CATEGORY_META[v.id].name}**: ${v.run.fits.length} of ${v.run.results.length} fit${v.lead ? `, best is the ${soft(v.lead.product.short)} at ${money(v.lead.stack.profit)} a sale` : ', none worth testing'}.`);
  return {
    text: [
      `For your brief I'd start with **${CATEGORY_META[best].lower}**. How the four categories with product data compare:`,
      rows.join('\n'),
      'Fashion, beauty, toys and baby products have no product data yet. Each is harder for a first product: many returns, or safety rules to meet before you can sell.',
    ].join('\n\n'),
    chips: [
      ...(best !== cur ? [look(best, true)] : []),
      ...views.filter((v) => v.id !== best && v.id !== cur && v.lead).slice(0, 2).map((v) => look(v.id)),
    ],
  };
}

/** One named category, judged against the seller's brief. */
export function categoryDetail(c: Category, p: Profile, inCategoryStep: boolean): Reply {
  const cap = capOf(p);
  const m = MARKETS[p.market];
  if (hasData(c.id)) {
    const id = c.id;
    const { views, best } = compareCategories(p);
    const v = views.find((x) => x.id === id)!;
    const lead = v.lead;
    const head = `**${c.name}: ${FIT_WORD[c.fit].toLowerCase()}.** ${c.verdict[0].toUpperCase()}${c.verdict.slice(1)}.`;
    const mine = lead
      ? `For your brief, ${v.run.fits.length} of ${v.run.results.length} products fit. The best is the **${soft(lead.product.short)}** at ${money(lead.stack.profit)} a sale (${lead.verdict.label.toLowerCase()}).`
      : `For your brief, none of its ${v.run.results.length} products is worth testing${v.run.fits.length ? '' : `: the smallest first order is ${money0(v.run.over[0]?.stack.firstOrder ?? 0)}, over your ${money0(cap)} limit`}.`;
    const rules = c.rules ? ` Before selling in ${m.the} you need ${c.rules(p)}.` : '';
    const compare = best !== id ? ` I'd still start with ${CATEGORY_META[best].lower}.` : " It's my pick for your brief.";
    const cur = p.category ?? 'pet';
    return { text: `${head}\n\n${mine}${rules}${compare}`, chips: [...(id !== cur ? [look(id, best === id)] : []), ...(best !== id && best !== cur ? [look(best)] : [])] };
  }
  const facts = [
    `- Returns: about ${c.returns} of orders`,
    `- Shipping: ${c.shipping}`,
    `- When it sells: ${c.season}`,
    c.rules ? `- Rules in ${m.the}: ${c.rules(p)}` : null,
    `- Typical first order: about ${money0(c.firstOrder)}${c.firstOrder > cap ? `, over your ${money0(cap)} limit` : ', within your limit'}`,
  ].filter(Boolean).join('\n');
  const priorities = p.priorities;
  const clash = c.fit === 'hard' && (priorities.includes('risk') || priorities.includes('simple'))
    ? ` It also cuts against your priority of ${priorities.includes('risk') ? 'lower risk' : 'simple sourcing'}.`
    : c.season.startsWith('peaks') || c.season.startsWith('most') ? priorities.includes('steady') ? ' It also cuts against your priority of steady demand.' : '' : '';
  return {
    text: `**${c.name}: ${FIT_WORD[c.fit].toLowerCase()}.** ${c.verdict[0].toUpperCase()}${c.verdict.slice(1)}.${clash}\n\n${facts}\n\nTo make it work you'd need ${c.take}. These are category-level estimates: I don't have product data for ${c.name.toLowerCase()} in this prototype, so I can't rank its products the way I rank the four categories I do have.`,
    chips: [
      ...(inCategoryStep ? [look(compareCategories(p).best, true)] : []),
      { label: 'Compare all categories', act: { t: 'ask' as const, text: 'Why not another category?' } },
    ],
  };
}

/** A pet product Scout has no data for, like "dog toys": say so, and point to the nearest ones it has. */
export function petGap(text: string, names: { id: string; short: string }[]): Reply {
  const t = text.toLowerCase();
  const near = names.filter((n) => (/\bcat/.test(t) ? /perch|glove|roller/i : /\bdog/.test(t) ? /bowl|feeder|collar|bed|mat/i : /./).test(n.short)).slice(0, 3);
  return {
    text: `That's pet supplies, but not one of the products I have data for. The nearest I can judge are ${list(near.map((n) => `the ${soft(n.short)}`))}. In the full product, Scout would rank any pet product the same way.`,
    chips: near.slice(0, 2).map((n) => ({ label: `Open the ${soft(n.short)}`, act: { t: 'open' as const, id: n.id } })),
  };
}
