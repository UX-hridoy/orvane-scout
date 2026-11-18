import type { Channel, Experience, Market, MarketId, Priority, Product, Profile, Supplier, Split, CategoryId } from './types';

/**
 * The simulated world behind Orvane. Every figure here is fictional.
 * Nothing on screen is typed by hand: the interface reads these records
 * and the engine in ./engine.ts works out the rest.
 */

const CARD = { pct: 0.029, fixed: 0.3, label: 'Card fees of 2.9% plus $0.30 a sale' };

export const MARKETS: Record<MarketId, Market> = {
  US: { id: 'US', name: 'United States', short: 'US', adj: 'US', the: 'the US', duty: { CN: 0.25, VN: 0.12 }, vat: 0, adOwn: 7, adMarketplace: 3, shipMult: 1, scale: 1, pay: CARD, refusals: 0 },
  DE: { id: 'DE', name: 'Germany', short: 'Germany', adj: 'German', the: 'Germany', duty: { CN: 0.047, VN: 0.047 }, vat: 0.19, adOwn: 5.5, adMarketplace: 2.5, shipMult: 1.15, scale: 1, pay: CARD, refusals: 0 },
  UK: { id: 'UK', name: 'United Kingdom', short: 'UK', adj: 'UK', the: 'the UK', duty: { CN: 0.04, VN: 0.04 }, vat: 0.2, adOwn: 6, adMarketplace: 2.75, shipMult: 1.1, scale: 1, pay: CARD, refusals: 0 },
  // Simplified from Bangladesh's tariff: 25% customs duty on household plastics, plus regulatory and
  // supplementary duty, with 15% VAT inside the shelf price. Most online orders are paid in cash on delivery.
  BD: {
    id: 'BD', name: 'Bangladesh', short: 'Bangladesh', adj: 'Bangladeshi', the: 'Bangladesh',
    duty: { CN: 0.45, VN: 0.45 }, vat: 0.15, adOwn: 1.6, adMarketplace: 0.9, shipMult: 0.75, scale: 0.5,
    pay: { pct: 0.01, fixed: 0.12, label: 'Cash-on-delivery charge of 1% plus $0.12 a sale' },
    refusals: 0.05,
    dutyNote: '25% customs duty plus regulatory and supplementary duty, simplified to 45%',
  },
};

export const MARKET_ORDER: MarketId[] = ['US', 'DE', 'UK', 'BD'];

/** Markets a seller can pick but Scout has no data for. */
export const NO_DATA_MARKETS = [{ id: 'AU', name: 'Australia' }];

export const CHANNELS: Record<Channel, { name: string; hint: string }> = {
  own: { name: 'Own online store', hint: 'You bring the shoppers, usually with ads' },
  marketplace: { name: 'Marketplace', hint: 'Amazon, eBay and similar. Higher fees, cheaper ads' },
  retail: { name: 'Local retail', hint: 'Markets, shops, wholesale to stores' },
  unsure: { name: 'Not sure yet', hint: 'Scout assumes an online store for now' },
};
export const CHANNEL_ORDER: Channel[] = ['own', 'marketplace', 'retail', 'unsure'];

export const PRIORITIES: Record<Priority, { name: string; hint: string }> = {
  risk: { name: 'Lower risk', hint: 'Few returns, room for error, less competition' },
  steady: { name: 'Steady demand', hint: 'Sells all year, not a spike' },
  profit: { name: 'Profitability', hint: 'Most money per sale' },
  growth: { name: 'Growth potential', hint: 'Demand that is climbing' },
  simple: { name: 'Simple sourcing', hint: 'Small first order, easy to buy' },
};
export const PRIORITY_ORDER: Priority[] = ['risk', 'steady', 'profit', 'growth', 'simple'];

export const EXPERIENCE: Record<Experience, { name: string; hint: string }> = {
  new: { name: 'First-time seller', hint: 'Scout explains terms as it goes' },
  existing: { name: 'Existing seller', hint: 'Shorter answers, trade terms' },
};

export const DEFAULT_PROFILE: Profile = {
  market: 'US',
  budget: 2500,
  channel: 'own',
  priorities: ['risk', 'steady'],
  experience: 'new',
};

/** Share of the budget Scout lets a first order use by default. The rest covers samples, launch ads and a buffer. */
export const FIRST_ORDER_SHARE = 0.7;

/**
 * Three ways to split a budget. New sellers start on Balanced; existing
 * sellers, who usually already pay for ads, start on More stock. Never
 * 100%: money for samples always stays back, because samples are the only
 * way to check quality before ordering.
 */
export const SPLITS: Record<Split, { name: string; share: number; hint: string }> = {
  safe: { name: 'Careful', share: 0.6, hint: 'Most money kept for surprises' },
  balanced: { name: 'Balanced', share: 0.7, hint: 'Best for a first launch' },
  stock: { name: 'More stock', share: 0.85, hint: 'If ads are paid from other money' },
};
export const SPLIT_ORDER: Split[] = ['safe', 'balanced', 'stock'];

export const PAYMENT_FEE = { pct: 0.029, fixed: 0.3 };
export const MARKETPLACE_FEE = 0.15;

/** Categories with product data. Their character comes from the data itself; these are only names. */
export const CATEGORY_META: Record<CategoryId, { name: string; lower: string; line: string }> = {
  pet: { name: 'Pet supplies', lower: 'pet supplies', line: 'Small, light, bought again and again' },
  kitchen: { name: 'Kitchen', lower: 'kitchen', line: 'Steady demand, crowded and cheap' },
  fitness: { name: 'Home fitness', lower: 'home fitness', line: 'Sells mostly in January, bulky to ship' },
  electronics: { name: 'Phone accessories', lower: 'phone accessories', line: 'Light, but more returns and fast price drops' },
};
export const CATEGORY_ORDER: CategoryId[] = ['pet', 'kitchen', 'fitness', 'electronics'];
/** Kept for older references: the starting category. */
export const CATEGORY = { id: 'pet' as CategoryId, name: CATEGORY_META.pet.name };

const d = (trend: number, level: number, vol: number, shape: Product['demand']['US']['shape'] = 'steady') => ({ trend, level, vol, shape });

const PET: Omit<Product, 'category'>[] = [
  {
    id: 'travel-set',
    name: 'Collapsible travel bowl and bottle set',
    short: 'Travel bowl set',
    blurb: 'Fold-flat silicone bowl with a 500 ml bottle that clips to a lead or bag.',
    cost: 3.2, moq: 300, ship: 1.3, returns: 0.03, listings: 46,
    price: { US: 24.99, DE: 27.99, UK: 25.99, BD: 13.99 },
    demand: { US: d(18, 68, 0.2), DE: d(0, 34, 0.2), UK: d(11, 55, 0.2), BD: d(14, 30, 0.2) },
    crowd: { US: 42, DE: 36, UK: 44, BD: 30 },
  },
  {
    id: 'slow-feeder',
    name: 'Slow-feeder dog bowl',
    short: 'Slow-feeder bowl',
    blurb: 'Ridged bowl that slows fast eaters. Dishwasher-safe, non-slip base.',
    cost: 2.6, moq: 300, ship: 1.4, returns: 0.03, listings: 61,
    price: { US: 19.99, DE: 22.99, UK: 19.99, BD: 11.49 },
    demand: { US: d(6, 60, 0.15), DE: d(12, 62, 0.15), UK: d(3, 50, 0.15), BD: d(9, 34, 0.15) },
    crowd: { US: 55, DE: 40, UK: 58, BD: 34 },
  },
  {
    id: 'led-collar',
    name: 'LED light-up dog collar',
    short: 'LED collar',
    blurb: 'USB-rechargeable collar with three light modes for walks after dark.',
    cost: 2.8, moq: 300, ship: 1.2, returns: 0.08, listings: 38,
    price: { US: 21.99, DE: 23.99, UK: 21.99, BD: 12.99 },
    demand: { US: d(9, 52, 0.5, 'winter'), DE: d(2, 46, 0.5, 'winter'), UK: d(6, 50, 0.5, 'winter'), BD: d(4, 22, 0.4, 'winter') },
    crowd: { US: 50, DE: 40, UK: 52, BD: 28 },
  },
  {
    id: 'lick-mat',
    name: 'Silicone lick mat',
    short: 'Lick mat',
    blurb: 'Textured mat with suction cups that keeps a dog busy at bath time.',
    cost: 1.4, moq: 500, ship: 0.6, returns: 0.02, listings: 124,
    price: { US: 14.99, DE: 15.99, UK: 13.99, BD: 6.99 },
    demand: { US: d(0, 58, 0.1), DE: d(4, 38, 0.1), UK: d(-2, 52, 0.1), BD: d(6, 26, 0.1) },
    crowd: { US: 90, DE: 90, UK: 86, BD: 55 },
  },
  {
    id: 'groom-glove',
    name: 'Deshedding grooming glove',
    short: 'Grooming glove',
    blurb: 'Rubber-tipped glove that lifts loose fur while you stroke.',
    cost: 1.9, moq: 400, ship: 0.7, returns: 0.05, listings: 87,
    price: { US: 16.99, DE: 17.99, UK: 15.99, BD: 8.99 },
    demand: { US: d(-4, 45, 0.2), DE: d(-3, 40, 0.2), UK: d(-5, 42, 0.2), BD: d(16, 40, 0.2) },
    crowd: { US: 72, DE: 66, UK: 70, BD: 38 },
  },
  {
    id: 'hair-roller',
    name: 'Pet hair remover roller',
    short: 'Hair remover roller',
    blurb: 'Reusable roller that pulls fur off sofas and car seats. No sticky sheets.',
    cost: 1.6, moq: 500, ship: 0.8, returns: 0.02, listings: 93,
    price: { US: 9.99, DE: 11.99, UK: 9.99, BD: 5.99 },
    demand: { US: d(140, 58, 0.9, 'spike'), DE: d(60, 40, 0.8, 'spike'), UK: d(90, 50, 0.85, 'spike'), BD: d(70, 42, 0.8, 'spike') },
    crowd: { US: 76, DE: 60, UK: 72, BD: 60 },
  },
  {
    id: 'cooling-mat',
    name: 'Dog cooling mat, large',
    short: 'Cooling mat',
    blurb: 'Pressure-activated gel mat. No water, no power, wipes clean.',
    cost: 6.8, moq: 200, ship: 4.9, returns: 0.06, listings: 29,
    price: { US: 34.99, DE: 36.99, UK: 34.99, BD: 22.99 },
    demand: { US: d(4, 50, 0.9, 'summer'), DE: d(6, 46, 0.9, 'summer'), UK: d(3, 40, 0.9, 'summer'), BD: d(25, 48, 0.45, 'summer') },
    crowd: { US: 48, DE: 45, UK: 50, BD: 22 },
  },
  {
    id: 'cat-perch',
    name: 'Cat window perch',
    short: 'Window perch',
    blurb: 'Hammock seat that holds to glass with four suction cups. Up to 15 kg.',
    cost: 7.5, moq: 200, ship: 3.8, returns: 0.07, listings: 22,
    price: { US: 39.99, DE: 44.99, UK: 39.99, BD: 27.99 },
    demand: { US: d(5, 44, 0.15), DE: d(7, 42, 0.15), UK: d(4, 40, 0.15), BD: d(32, 52, 0.15) },
    crowd: { US: 40, DE: 36, UK: 42, BD: 20 },
  },
  {
    id: 'dog-bed',
    name: 'Orthopedic dog bed, medium',
    short: 'Orthopedic bed',
    blurb: 'Memory-foam bed with a raised rim and a washable cover.',
    cost: 14, moq: 100, ship: 9.5, returns: 0.09, listings: 140,
    price: { US: 69.99, DE: 74.99, UK: 69.99, BD: 44.99 },
    demand: { US: d(3, 70, 0.2), DE: d(4, 62, 0.2), UK: d(2, 60, 0.2), BD: d(5, 24, 0.2) },
    crowd: { US: 78, DE: 70, UK: 76, BD: 35 },
  },
];

const KITCHEN: Omit<Product, 'category'>[] = [
  {
    id: 'herb-keeper', name: 'Fresh herb keeper', short: 'Herb keeper',
    blurb: 'Clear pod with a water well that keeps cut herbs fresh in the fridge for up to three weeks.',
    cost: 3.1, moq: 300, ship: 1.2, returns: 0.04, listings: 38,
    price: { US: 22.99, DE: 24.99, UK: 21.99, BD: 12.99 },
    demand: { US: d(12, 44, 0.15), DE: d(9, 38, 0.15), UK: d(10, 40, 0.15), BD: d(8, 22, 0.15) },
    crowd: { US: 46, DE: 38, UK: 44, BD: 24 },
  },
  {
    id: 'silicone-lids', name: 'Silicone stretch lids, set of 6', short: 'Stretch lids',
    blurb: 'Six food-safe lids that stretch over bowls, tins and cut fruit. Replace cling film.',
    cost: 1.6, moq: 500, ship: 0.5, returns: 0.03, listings: 72,
    price: { US: 14.99, DE: 15.99, UK: 14.99, BD: 7.99 },
    demand: { US: d(4, 62, 0.15), DE: d(7, 50, 0.15), UK: d(5, 56, 0.15), BD: d(6, 26, 0.15) },
    crowd: { US: 78, DE: 66, UK: 74, BD: 40 },
  },
  {
    id: 'spice-jars', name: 'Magnetic spice jars, set of 12', short: 'Spice jars',
    blurb: 'Twelve steel-lid jars that stick to the fridge or a wall plate, with printed labels.',
    cost: 6.2, moq: 200, ship: 2.1, returns: 0.05, listings: 41,
    price: { US: 39.99, DE: 42.99, UK: 37.99, BD: 21.99 },
    demand: { US: d(9, 50, 0.25), DE: d(6, 42, 0.25), UK: d(8, 46, 0.25), BD: d(10, 20, 0.25) },
    crowd: { US: 52, DE: 44, UK: 50, BD: 28 },
  },
  {
    id: 'oil-sprayer', name: 'Glass oil sprayer', short: 'Oil sprayer',
    blurb: 'Fine-mist sprayer for cooking oil, popular with air-fryer owners.',
    cost: 2.4, moq: 400, ship: 0.9, returns: 0.07, listings: 54,
    price: { US: 15.99, DE: 16.99, UK: 14.99, BD: 8.99 },
    demand: { US: d(38, 48, 0.75, 'spike'), DE: d(30, 40, 0.75, 'spike'), UK: d(34, 44, 0.75, 'spike'), BD: d(20, 18, 0.75, 'spike') },
    crowd: { US: 64, DE: 52, UK: 60, BD: 30 },
  },
  {
    id: 'mixing-bowls', name: 'Nesting mixing bowls with lids', short: 'Mixing bowls',
    blurb: 'Five stainless bowls that nest into one, each with a snap-on lid.',
    cost: 7.8, moq: 300, ship: 3.4, returns: 0.05, listings: 66,
    price: { US: 34.99, DE: 36.99, UK: 33.99, BD: 18.99 },
    demand: { US: d(2, 58, 0.2), DE: d(1, 50, 0.2), UK: d(3, 54, 0.2), BD: d(5, 24, 0.2) },
    crowd: { US: 82, DE: 72, UK: 78, BD: 42 },
  },
  {
    id: 'bag-clips', name: 'Bag sealing clips, pack of 24', short: 'Bag clips',
    blurb: 'Colour-coded clips that keep snacks and coffee fresh.',
    cost: 1.1, moq: 1000, ship: 0.3, returns: 0.03, listings: 95,
    price: { US: 9.99, DE: 10.99, UK: 9.99, BD: 4.99 },
    demand: { US: d(-4, 70, 0.15), DE: d(-2, 58, 0.15), UK: d(-3, 64, 0.15), BD: d(2, 30, 0.15) },
    crowd: { US: 90, DE: 80, UK: 86, BD: 50 },
  },
];

const FITNESS: Omit<Product, 'category'>[] = [
  {
    id: 'resistance-bands', name: 'Fabric resistance bands, set of 3', short: 'Resistance bands',
    blurb: 'Three non-slip fabric loops in light, medium and heavy, with a carry bag.',
    cost: 2.9, moq: 300, ship: 0.8, returns: 0.05, listings: 58,
    price: { US: 24.99, DE: 26.99, UK: 23.99, BD: 12.99 },
    demand: { US: d(6, 64, 0.5, 'winter'), DE: d(4, 56, 0.5, 'winter'), UK: d(5, 60, 0.5, 'winter'), BD: d(9, 26, 0.4, 'winter') },
    crowd: { US: 58, DE: 50, UK: 56, BD: 30 },
  },
  {
    id: 'jump-rope', name: 'Weighted jump rope', short: 'Jump rope',
    blurb: 'Tangle-free rope with removable handle weights and a step counter.',
    cost: 3.4, moq: 300, ship: 1.1, returns: 0.05, listings: 36,
    price: { US: 24.99, DE: 25.99, UK: 22.99, BD: 12.99 },
    demand: { US: d(15, 46, 0.3), DE: d(10, 40, 0.3), UK: d(12, 44, 0.3), BD: d(12, 20, 0.3) },
    crowd: { US: 44, DE: 38, UK: 42, BD: 22 },
  },
  {
    id: 'ab-wheel', name: 'Ab wheel with knee mat', short: 'Ab wheel',
    blurb: 'Wide double wheel for balance, with a thick foam knee pad.',
    cost: 4.6, moq: 200, ship: 2.4, returns: 0.07, listings: 49,
    price: { US: 27.99, DE: 29.99, UK: 26.99, BD: 14.99 },
    demand: { US: d(-2, 50, 0.7, 'winter'), DE: d(-1, 44, 0.7, 'winter'), UK: d(-2, 48, 0.7, 'winter'), BD: d(4, 18, 0.6, 'winter') },
    crowd: { US: 60, DE: 52, UK: 58, BD: 28 },
  },
  {
    id: 'foam-roller', name: 'Textured foam roller', short: 'Foam roller',
    blurb: 'Firm roller with a ridged surface for sore muscles. Hollow core, 33 cm.',
    cost: 5.2, moq: 200, ship: 3.9, returns: 0.05, listings: 31,
    price: { US: 29.99, DE: 31.99, UK: 27.99, BD: 15.99 },
    demand: { US: d(10, 46, 0.3), DE: d(8, 40, 0.3), UK: d(9, 42, 0.3), BD: d(6, 16, 0.3) },
    crowd: { US: 40, DE: 34, UK: 38, BD: 20 },
  },
  {
    id: 'yoga-mat', name: 'Non-slip yoga mat, 6 mm', short: 'Yoga mat',
    blurb: 'Thick mat with a grippy top and alignment lines. Comes with a strap.',
    cost: 6.8, moq: 300, ship: 3.6, returns: 0.08, listings: 88,
    price: { US: 34.99, DE: 36.99, UK: 32.99, BD: 18.99 },
    demand: { US: d(3, 72, 0.45, 'winter'), DE: d(2, 64, 0.45, 'winter'), UK: d(3, 68, 0.45, 'winter'), BD: d(10, 28, 0.4, 'winter') },
    crowd: { US: 86, DE: 76, UK: 82, BD: 44 },
  },
  {
    id: 'grip-trainer', name: 'Adjustable hand grip trainer', short: 'Grip trainer',
    blurb: 'Spring grip with a dial from 5 to 60 kg.',
    cost: 1.7, moq: 500, ship: 0.4, returns: 0.09, listings: 63,
    price: { US: 12.99, DE: 13.99, UK: 11.99, BD: 6.99 },
    demand: { US: d(-8, 38, 0.3), DE: d(-6, 32, 0.3), UK: d(-7, 36, 0.3), BD: d(1, 14, 0.3) },
    crowd: { US: 70, DE: 60, UK: 66, BD: 34 },
  },
];

const ELECTRONICS: Omit<Product, 'category'>[] = [
  {
    id: 'cable-organiser', name: 'Magnetic cable organiser', short: 'Cable organiser',
    blurb: 'Six magnetic clips on a weighted base that keep charging cables on the desk.',
    cost: 1.3, moq: 500, ship: 0.2, returns: 0.04, listings: 34,
    price: { US: 14.99, DE: 15.99, UK: 13.99, BD: 6.99 },
    demand: { US: d(22, 40, 0.2), DE: d(18, 34, 0.2), UK: d(20, 38, 0.2), BD: d(16, 18, 0.2) },
    crowd: { US: 38, DE: 32, UK: 36, BD: 20 },
  },
  {
    id: 'phone-stand', name: 'Foldable aluminium phone stand', short: 'Phone stand',
    blurb: 'Adjustable desk stand that folds flat. Fits phones and small tablets.',
    cost: 2.8, moq: 300, ship: 0.5, returns: 0.06, listings: 77,
    price: { US: 19.99, DE: 21.99, UK: 18.99, BD: 9.99 },
    demand: { US: d(8, 66, 0.15), DE: d(6, 58, 0.15), UK: d(7, 62, 0.15), BD: d(12, 30, 0.15) },
    crowd: { US: 72, DE: 62, UK: 68, BD: 38 },
  },
  {
    id: 'phone-wallet', name: 'Magnetic phone wallet', short: 'Phone wallet',
    blurb: 'Vegan leather card holder that snaps onto the back of magnetic phones.',
    cost: 2.5, moq: 300, ship: 0.3, returns: 0.1, listings: 52,
    price: { US: 19.99, DE: 21.99, UK: 18.99, BD: 9.99 },
    demand: { US: d(28, 55, 0.7, 'spike'), DE: d(22, 46, 0.7, 'spike'), UK: d(25, 50, 0.7, 'spike'), BD: d(18, 20, 0.6, 'spike') },
    crowd: { US: 64, DE: 54, UK: 60, BD: 30 },
  },
  {
    id: 'cleaning-kit', name: 'Earbud and phone cleaning kit', short: 'Cleaning kit',
    blurb: 'Soft brush, putty and pen tips that clean earbuds, ports and speaker grilles.',
    cost: 1.4, moq: 500, ship: 0.2, returns: 0.04, listings: 29,
    price: { US: 11.99, DE: 12.99, UK: 10.99, BD: 5.99 },
    demand: { US: d(14, 32, 0.2), DE: d(10, 28, 0.2), UK: d(12, 30, 0.2), BD: d(10, 14, 0.2) },
    crowd: { US: 30, DE: 26, UK: 28, BD: 16 },
  },
  {
    id: 'charging-stand', name: '3-in-1 wireless charging stand', short: 'Charging stand',
    blurb: 'Charges a phone, watch and earbuds at once. Needs radio and electrical safety tests.',
    cost: 11.5, moq: 200, ship: 1.2, returns: 0.14, listings: 68,
    price: { US: 49.99, DE: 54.99, UK: 47.99, BD: 26.99 },
    demand: { US: d(5, 60, 0.3), DE: d(4, 52, 0.3), UK: d(5, 56, 0.3), BD: d(9, 22, 0.3) },
    crowd: { US: 80, DE: 70, UK: 76, BD: 40 },
  },
  {
    id: 'ring-light', name: 'Clip-on selfie ring light', short: 'Selfie ring light',
    blurb: 'Small rechargeable light that clips onto a phone for video calls.',
    cost: 3.1, moq: 300, ship: 0.7, returns: 0.12, listings: 81,
    price: { US: 16.99, DE: 17.99, UK: 15.99, BD: 8.99 },
    demand: { US: d(-12, 35, 0.3), DE: d(-9, 30, 0.3), UK: d(-10, 32, 0.3), BD: d(-2, 16, 0.3) },
    crowd: { US: 76, DE: 66, UK: 72, BD: 36 },
  },
];

export const PRODUCTS: Product[] = [
  ...PET.map((x) => ({ ...x, category: 'pet' as const })),
  ...KITCHEN.map((x) => ({ ...x, category: 'kitchen' as const })),
  ...FITNESS.map((x) => ({ ...x, category: 'fitness' as const })),
  ...ELECTRONICS.map((x) => ({ ...x, category: 'electronics' as const })),
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
export const productsIn = (c: CategoryId) => PRODUCTS.filter((p) => p.category === c);

/**
 * Six supplier profiles. Each lists every product in the category at a price
 * relative to the typical unit cost, so the same companies can be compared
 * whichever product the seller picks.
 */
const PET_SUPPLIERS: Omit<Supplier, 'category'>[] = [
  {
    id: 'ningbo', name: 'Ningbo Hearth Pet Products', short: 'Ningbo Hearth', city: 'Ningbo', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2026-03', years: 7, orders: 412, onTime: 0.96, replyHrs: 6,
    priceK: 1, moqK: 1, shipAdd: 0, lead: 20, promoted: false, offPlatform: false,
    sample: { price: 18, ship: 22 },
    quote: { k: 0.96875, day: 0, followUp: false, note: 'Logo printing available for $0.15 more per unit.' },
    tint: '#FFE9D6',
  },
  {
    id: 'shenzhen', name: 'Shenzhen Loop and Leash', short: 'Loop and Leash', city: 'Shenzhen', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2024-09', years: 5, orders: 286, onTime: 0.93, replyHrs: 12,
    priceK: 1.078125, moqK: 2 / 3, shipAdd: 0, lead: 15, promoted: true, offPlatform: false,
    showcase: ['A 3-minute video tour of its moulding line', 'Full catalogue of 46 pet products', 'Custom colours from 300 units'],
    sample: { price: 0, ship: 12 },
    quote: { k: 1, day: 1, followUp: false, note: 'Listed price confirmed. Free sample, you pay shipping.' },
    tint: '#E4EEFF',
  },
  {
    id: 'haiphong', name: 'Hai Phong PetWorks', short: 'Hai Phong PetWorks', city: 'Hai Phong', origin: 'VN', type: 'Manufacturer',
    licence: true, audit: '2026-01', years: 3, orders: 97, onTime: 0.94, replyHrs: 30,
    priceK: 1.125, moqK: 1, shipAdd: 0.15, lead: 25, promoted: false, offPlatform: false,
    sample: { price: 13, ship: 12 },
    quote: { k: 0.98611, day: 2, followUp: true, note: 'Replied after one follow-up. Small discount for a first order.' },
    tint: '#E3F4EA',
  },
  {
    id: 'xiamen', name: 'Xiamen Pawsome Supply', short: 'Xiamen Pawsome', city: 'Xiamen', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: null, years: 2, orders: 64, onTime: 0.9, replyHrs: 9,
    priceK: 1.03125, moqK: 1, shipAdd: 0, lead: 18, promoted: true, offPlatform: false,
    showcase: ['Photos of its packing and quality check area', 'Full catalogue of 31 pet products', 'Ships samples within 3 days'],
    sample: { price: 15, ship: 20 },
    quote: { k: 1, day: 1, followUp: false, note: 'Listed price confirmed.' },
    tint: '#F1E9FB',
  },
  {
    id: 'yiwu', name: 'Yiwu Brightpaw Trading', short: 'Yiwu Brightpaw', city: 'Yiwu', origin: 'CN', type: 'Trading company',
    licence: true, audit: null, years: 4, orders: 530, onTime: 0.91, replyHrs: 4,
    priceK: 0.84375, moqK: 5 / 3, shipAdd: 0, lead: 12, promoted: false, offPlatform: false,
    sample: { price: 10, ship: 20 },
    quote: { k: 1, day: 0, followUp: false, note: 'Listed price confirmed.' },
    tint: '#FDF1C7',
  },
  {
    id: 'dongguan', name: 'Dongguan Silico Goods', short: 'Dongguan Silico', city: 'Dongguan', origin: 'CN', type: 'Unclear',
    licence: true, audit: null, years: 0.3, orders: 9, onTime: null, replyHrs: 1,
    priceK: 0.75, moqK: 1, shipAdd: 0, lead: 10, promoted: false, offPlatform: true,
    sample: { price: 0, ship: 0 },
    quote: { k: 1, day: 0, followUp: false, note: '' },
    tint: '#F0F0F0',
  },
];

const KITCHEN_SUPPLIERS: Omit<Supplier, 'category'>[] = [
  {
    id: 'foshan', name: 'Foshan Brightware Housewares', short: 'Foshan Brightware', city: 'Foshan', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2026-02', years: 6, orders: 384, onTime: 0.95, replyHrs: 8,
    priceK: 1, moqK: 1, shipAdd: 0, lead: 21, promoted: false, offPlatform: false,
    sample: { price: 15, ship: 20 },
    quote: { k: 0.97, day: 0, followUp: false, note: 'Can print your logo on the box from 500 units.' },
    tint: '#FFE9D6',
  },
  {
    id: 'keenline', name: 'Yangjiang Keenline Kitchenware', short: 'Keenline', city: 'Yangjiang', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2025-06', years: 9, orders: 612, onTime: 0.92, replyHrs: 14,
    priceK: 1.06, moqK: 2 / 3, shipAdd: 0, lead: 16, promoted: true, offPlatform: false,
    showcase: ['A short video of its steel pressing line', 'Full catalogue of 120 kitchen products', 'Food-contact test reports for every material'],
    sample: { price: 0, ship: 14 },
    quote: { k: 1, day: 1, followUp: false, note: 'Listed price confirmed. A smaller first order is fine.' },
    tint: '#E4EEFF',
  },
  {
    id: 'saigon', name: 'Saigon Homecraft', short: 'Saigon Homecraft', city: 'Ho Chi Minh City', origin: 'VN', type: 'Manufacturer',
    licence: true, audit: '2025-11', years: 3, orders: 118, onTime: 0.93, replyHrs: 26,
    priceK: 1.12, moqK: 1, shipAdd: 0.12, lead: 24, promoted: false, offPlatform: false,
    sample: { price: 12, ship: 14 },
    quote: { k: 0.985, day: 2, followUp: true, note: 'Replied after one follow-up. Offers 3% off a repeat order.' },
    tint: '#E3F4EA',
  },
  {
    id: 'easyhome', name: 'Jinhua Easyhome Trading', short: 'Easyhome Trading', city: 'Jinhua', origin: 'CN', type: 'Trading company',
    licence: true, audit: null, years: 4, orders: 452, onTime: 0.9, replyHrs: 5,
    priceK: 0.88, moqK: 1.6, shipAdd: 0, lead: 12, promoted: false, offPlatform: false,
    sample: { price: 10, ship: 18 },
    quote: { k: 1, day: 0, followUp: false, note: 'Listed price confirmed.' },
    tint: '#FDF1C7',
  },
];

const FITNESS_SUPPLIERS: Omit<Supplier, 'category'>[] = [
  {
    id: 'corepower', name: 'Nantong Corepower Fitness', short: 'Corepower', city: 'Nantong', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2026-04', years: 8, orders: 521, onTime: 0.95, replyHrs: 7,
    priceK: 1, moqK: 1, shipAdd: 0, lead: 22, promoted: false, offPlatform: false,
    sample: { price: 16, ship: 24 },
    quote: { k: 0.96, day: 0, followUp: false, note: 'Can print your logo on the product from 300 units.' },
    tint: '#FFE9D6',
  },
  {
    id: 'stride', name: 'Quanzhou Stride Sports', short: 'Stride Sports', city: 'Quanzhou', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2024-11', years: 5, orders: 263, onTime: 0.92, replyHrs: 11,
    priceK: 1.07, moqK: 2 / 3, shipAdd: 0, lead: 18, promoted: true, offPlatform: false,
    showcase: ['A video of its stitching and testing room', 'Full catalogue of 64 fitness products', 'Stock ready to ship in November'],
    sample: { price: 0, ship: 16 },
    quote: { k: 1, day: 1, followUp: false, note: 'Listed price confirmed. Free sample, you pay shipping.' },
    tint: '#E4EEFF',
  },
  {
    id: 'hanoi', name: 'Hanoi Activeworks', short: 'Hanoi Activeworks', city: 'Hanoi', origin: 'VN', type: 'Manufacturer',
    licence: true, audit: '2026-01', years: 2, orders: 74, onTime: 0.94, replyHrs: 30,
    priceK: 1.14, moqK: 1, shipAdd: 0.2, lead: 26, promoted: false, offPlatform: false,
    sample: { price: 14, ship: 16 },
    quote: { k: 0.98, day: 2, followUp: true, note: 'Replied after one follow-up. Can send part of the order by air for January.' },
    tint: '#E3F4EA',
  },
  {
    id: 'flexgear', name: 'Wenzhou Flexgear', short: 'Wenzhou Flexgear', city: 'Wenzhou', origin: 'CN', type: 'Unclear',
    licence: true, audit: null, years: 0.4, orders: 11, onTime: null, replyHrs: 1,
    priceK: 0.74, moqK: 1, shipAdd: 0, lead: 9, promoted: false, offPlatform: true,
    sample: { price: 0, ship: 0 },
    quote: { k: 1, day: 0, followUp: false, note: '' },
    tint: '#F0F0F0',
  },
];

const ELECTRONICS_SUPPLIERS: Omit<Supplier, 'category'>[] = [
  {
    id: 'voltway', name: 'Zhuhai Voltway Electronics', short: 'Voltway', city: 'Zhuhai', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2026-03', years: 6, orders: 702, onTime: 0.96, replyHrs: 5,
    priceK: 1, moqK: 1, shipAdd: 0, lead: 18, promoted: false, offPlatform: false,
    sample: { price: 14, ship: 18 },
    quote: { k: 0.97, day: 0, followUp: false, note: 'Safety test reports for the US and EU come with the order.' },
    tint: '#FFE9D6',
  },
  {
    id: 'linkcase', name: 'Huizhou Linkcase Tech', short: 'Linkcase', city: 'Huizhou', origin: 'CN', type: 'Manufacturer',
    licence: true, audit: '2025-04', years: 4, orders: 308, onTime: 0.91, replyHrs: 10,
    priceK: 1.05, moqK: 2 / 3, shipAdd: 0, lead: 14, promoted: true, offPlatform: false,
    showcase: ['Photos of its assembly and testing line', 'Full catalogue of 85 phone accessories', 'New colours every quarter'],
    sample: { price: 0, ship: 12 },
    quote: { k: 1, day: 1, followUp: false, note: 'Listed price confirmed. Test reports on request.' },
    tint: '#E4EEFF',
  },
  {
    id: 'bacninh', name: 'Bac Ninh Smartparts', short: 'Bac Ninh Smartparts', city: 'Bac Ninh', origin: 'VN', type: 'Manufacturer',
    licence: true, audit: '2025-12', years: 3, orders: 141, onTime: 0.93, replyHrs: 28,
    priceK: 1.13, moqK: 1, shipAdd: 0.08, lead: 22, promoted: false, offPlatform: false,
    sample: { price: 12, ship: 14 },
    quote: { k: 0.98, day: 2, followUp: true, note: 'Replied after one follow-up. Small discount for a first order.' },
    tint: '#E3F4EA',
  },
  {
    id: 'gadgetmart', name: 'Guangzhou Gadgetmart Trading', short: 'Gadgetmart', city: 'Guangzhou', origin: 'CN', type: 'Trading company',
    licence: true, audit: null, years: 3, orders: 826, onTime: 0.89, replyHrs: 3,
    priceK: 0.86, moqK: 1.7, shipAdd: 0, lead: 10, promoted: false, offPlatform: false,
    sample: { price: 8, ship: 16 },
    quote: { k: 1, day: 0, followUp: false, note: 'Listed price confirmed.' },
    tint: '#FDF1C7',
  },
];

export const SUPPLIERS: Supplier[] = [
  ...PET_SUPPLIERS.map((x) => ({ ...x, category: 'pet' as const })),
  ...KITCHEN_SUPPLIERS.map((x) => ({ ...x, category: 'kitchen' as const })),
  ...FITNESS_SUPPLIERS.map((x) => ({ ...x, category: 'fitness' as const })),
  ...ELECTRONICS_SUPPLIERS.map((x) => ({ ...x, category: 'electronics' as const })),
];

export const supplierById = (id: string) => SUPPLIERS.find((s) => s.id === id);

export const ORIGIN_NAME = { CN: 'China', VN: 'Vietnam' } as const;

/** The seller in the story. */
export const SELLER = { name: 'Sam', business: 'Sam Rivera', inbox: 'sam.rivera@inbox.orvane.example' };
