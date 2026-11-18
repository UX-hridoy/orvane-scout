import type { Diff, Profile, CategoryId } from './types';

export type Rating = 'good' | 'minor' | 'problem';

/** decision: review the plan. done: samples requested, on their way. check: samples arrived, the seller checks them. order: Scout's draft first order. ordered: order placed. */
export type Stage = 'start' | 'setup' | 'category' | 'pick' | 'opportunities' | 'suppliers' | 'waiting' | 'quotes' | 'decision' | 'done' | 'check' | 'order' | 'ordered';
export type Entry = 'idea' | 'category' | 'suppliers';

/** Everything a chip, a typed request or the live model can ask the interface to do. */
export type Act =
  | { t: 'start'; entry: Entry }
  | { t: 'market'; id: string }
  | { t: 'budget'; value: number }
  | { t: 'channel'; id: Profile['channel'] }
  | { t: 'category'; id?: CategoryId }
  | { t: 'profile'; patch: Partial<Profile>; quiet?: boolean }
  | { t: 'undo'; profile: Profile }
  | { t: 'open'; id: string; maths?: boolean }
  | { t: 'openSupplier'; id: string }
  | { t: 'compare'; ids?: string[] }
  | { t: 'compareSup' }
  /** Every market side by side for the current brief. */
  | { t: 'compareMarkets' }
  | { t: 'choose'; id: string; force?: boolean }
  | { t: 'draftInquiry' }
  | { t: 'skip' }
  | { t: 'review' }
  | { t: 'draftSamples' }
  /** Samples arrive (the wait is skipped in this prototype). */
  | { t: 'arrive' }
  /** The seller's rating of one point on one sample. */
  | { t: 'rate'; id: string; point: string; value: Rating }
  | { t: 'rateRest'; id: string }
  /** Prepare the first order with this supplier, then ask for approval. */
  | { t: 'orderFrom'; id: string }
  | { t: 'draftOrder' }
  /** A new sample from one supplier, after a failed check. */
  | { t: 'resample'; id: string }
  | { t: 'plan' }
  | { t: 'goto'; stage: Stage }
  | { t: 'ask'; text: string }
  /** Scout runs the journey itself and stops at every approval. */
  | { t: 'auto'; text?: string }
  | { t: 'stopAuto' }
  | { t: 'reset' };

export interface Chip { label: string; act: Act; rec?: boolean }

export interface Reply { text: string; chips?: Chip[]; acts?: Act[] }

export type Widget =
  | { kind: 'market' }
  | { kind: 'budget' }
  | { kind: 'channel' }
  | { kind: 'changed'; diff: Diff; undo: Profile; extra?: string[] }
  | { kind: 'applied'; label: string; undo: Profile };

export interface Msg {
  id: number;
  from: 'scout' | 'user';
  text?: string;
  chips?: Chip[];
  widget?: Widget;
  /** Steps Scout is working through, shown as a checklist. */
  steps?: { label: string; done: boolean }[];
  /** True while Scout is still working or the answer is still arriving. */
  pending?: boolean;
  answered?: boolean;
}

/** What Scout knows about the session when it answers a typed question. */
export interface Ctx {
  stage: Stage;
  profile: Profile;
  productId: string | null;
  focusProductId: string | null;
  focusSupplierId: string | null;
  contacted: string[];
  quotesReady: boolean;
  sampleIds: string[];
  samplesRequested: boolean;
  /** The product and supplier the conversation last touched, so "it" and "them" resolve. */
  recall?: { productId: string | null; supplierId: string | null };
  /** True while Scout is running the journey on its own. */
  auto?: boolean;
}

/** One event in a live answer, whichever model writes it. */
export type ScoutEvent =
  | { type: 'step'; label: string }
  | { type: 'text'; delta: string }
  /** Replaces the whole answer so far. */
  | { type: 'set'; text: string }
  | { type: 'act'; act: Act }
  | { type: 'chips'; chips: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface Turn { role: 'user' | 'assistant'; content: string }

/** How the interface reaches a live model. The Next.js app uses the server route; the artifact asks Claude directly. */
export interface Transport {
  status(): Promise<{ live: boolean; model: string | null }>;
  /** Resolves true when an answer was delivered, false when the built-in layer should answer instead. */
  ask(args: { question: string; history: Turn[]; ctx: Ctx }, onEvent: (e: ScoutEvent) => void): Promise<boolean>;
}
