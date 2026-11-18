export type MarketId = 'US' | 'DE' | 'UK' | 'BD';
export type Origin = 'CN' | 'VN';
export type Channel = 'own' | 'marketplace' | 'retail' | 'unsure';
export type Priority = 'risk' | 'steady' | 'profit' | 'growth' | 'simple';
export type Experience = 'new' | 'existing';
export type Evidence = 'verified' | 'estimate' | 'unknown';
export type Tier = 'worth' | 'care' | 'skip' | 'out';
export type SupTier = 'shortlist' | 'ask' | 'out' | 'avoid';
export type Shape = 'steady' | 'winter' | 'summer' | 'spike';

export interface Profile {
  market: MarketId;
  budget: number;
  channel: Channel;
  priorities: Priority[];
  experience: Experience;
  /** How the budget splits between stock and money kept back. Unset: Scout picks from experience. */
  split?: Split;
  /** The category being looked at. Unset: pet supplies. */
  category?: CategoryId;
}

export type Split = 'safe' | 'balanced' | 'stock';

export interface Market {
  id: MarketId;
  name: string;
  short: string;
  /** "US demand", "German demand" */
  adj: string;
  /** How the market reads in a sentence: "the US", "Germany". */
  the: string;
  /**
   * Price level against the US, UK and Germany. Where shelf prices are lower,
   * a smaller profit per sale is still a good one, so the thin-profit lines move with it.
   */
  scale: number;
  /** What an own-store sale costs to take payment for. */
  pay: { pct: number; fixed: number; label: string };
  /** Extra share of orders that never complete, such as cash-on-delivery parcels refused at the door. */
  refusals: number;
  /** Plain words on how import duty is worked out here. */
  dutyNote?: string;
  duty: Record<Origin, number>;
  vat: number;
  adOwn: number;
  adMarketplace: number;
  shipMult: number;
}

export interface Demand {
  /** 12-month change in percent */
  trend: number;
  /** Search and sales volume index, 0 to 100 */
  level: number;
  /** How uneven demand is through the year, 0 to 1 */
  vol: number;
  shape: Shape;
}

/** The product categories with product-by-product data. */
export type CategoryId = 'pet' | 'kitchen' | 'fitness' | 'electronics';

export interface Product {
  id: string;
  category: CategoryId;
  name: string;
  short: string;
  blurb: string;
  cost: number;
  moq: number;
  ship: number;
  returns: number;
  listings: number;
  price: Record<MarketId, number>;
  demand: Record<MarketId, Demand>;
  crowd: Record<MarketId, number>;
}

export interface Stack {
  price: number;
  tax: number;
  net: number;
  cost: number;
  ship: number;
  duty: number;
  fees: number;
  ad: number;
  returns: number;
  profit: number;
  margin: number;
  landed: number;
  moq: number;
  firstOrder: number;
  breakEvenUnits: number;
  breakEvenAd: number;
}

export interface Verdict {
  tier: Tier;
  label: string;
  reason: string;
}

export interface ProductResult {
  product: Product;
  stack: Stack;
  demand: Demand;
  crowd: number;
  score: number;
  factors: Record<string, number>;
  verdict: Verdict;
  /** Position among products that fit the budget, 1-based. Null when over budget. */
  rank: number | null;
  /** Budget at which an over-budget product would fit. */
  needsBudget: number;
}

export interface Run {
  profile: Profile;
  cap: number;
  results: ProductResult[];
  fits: ProductResult[];
  over: ProductResult[];
  weights: Record<string, number>;
}

export interface Supplier {
  id: string;
  /** Suppliers make one kind of product, so each belongs to one category. */
  category: CategoryId;
  name: string;
  short: string;
  city: string;
  origin: Origin;
  type: 'Manufacturer' | 'Trading company' | 'Unclear';
  licence: boolean;
  /** YYYY-MM of the last factory audit on record */
  audit: string | null;
  years: number;
  orders: number;
  onTime: number | null;
  replyHrs: number;
  priceK: number;
  moqK: number;
  shipAdd: number;
  lead: number;
  /** Pays Orvane for visibility when buyers browse, and for a richer profile. Never used in Scout's ranking. */
  promoted: boolean;
  /** A promoted supplier's own content. Shown labelled as theirs, never scored. */
  showcase?: string[];
  offPlatform: boolean;
  sample: { price: number; ship: number };
  quote: { k: number; day: number; followUp: boolean; note: string };
  tint: string;
}

export interface SupplierResult {
  supplier: Supplier;
  unit: number;
  moq: number;
  stack: Stack;
  score: number;
  tier: SupTier;
  label: string;
  reason: string;
  rank: number;
  flags: string[];
}

export interface SupRun {
  product: Product;
  profile: Profile;
  cap: number;
  results: SupplierResult[];
  shortlist: SupplierResult[];
  medianUnit: number;
}

export interface Quote {
  supplier: Supplier;
  listed: number;
  unit: number;
  moq: number;
  stack: Stack;
  day: number;
  followUp: boolean;
  note: string;
  sampleCost: number;
  delta: number;
}

export interface Move {
  id: string;
  name: string;
  from: number | null;
  to: number | null;
  tierFrom: Tier;
  tierTo: Tier;
  dir: 'up' | 'down' | 'in' | 'out' | 'verdict';
  why: string;
}

export interface Diff {
  kind: 'market' | 'budget' | 'channel' | 'priorities' | 'mixed';
  headline: string;
  moves: Move[];
  notes: string[];
  changed: boolean;
}
