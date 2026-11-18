'use client';

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Act, Chip, Ctx, Entry, Msg, Rating, Reply, ScoutEvent, Stage, Transport, Turn } from '@/lib/acts';
import { SAMPLE_DAYS, checkPoints, checkVerdict, dateOf, leftForLaunch, orderTimeline, sampleResults, type Ratings } from '@/lib/samples';
import { LIMIT_Q, answer, categoryIn, command, entities, extractBrief, opening, stageChips } from '@/lib/brain';
import { CATEGORY_META, CHANNELS, DEFAULT_PROFILE, MARKETS, MARKET_ORDER, NO_DATA_MARKETS, PRIORITIES, SPLITS, productById } from '@/lib/data';
import { capOf, compareCategories, compareMarkets, splitOf, stackFor, diffRuns, diffSuppliers, evaluate, evaluateSuppliers, pickSamples, quotesFor } from '@/lib/engine';
import { list, money, money0 } from '@/lib/format';
import * as say from '@/lib/narrate';
import type { CategoryId, MarketId, Profile, Quote, Run, SupRun } from '@/lib/types';
import { serverTransport } from './transport';

export type Drawer = { kind: 'product'; id: string; maths: boolean } | { kind: 'supplier'; id: string } | null;

export interface State {
  stage: Stage;
  entry: Entry | null;
  profile: Profile;
  answered: { market: boolean; budget: boolean; channel: boolean };
  /** Priorities are still Scout's guess. */
  guessed: boolean;
  /** Experience is still Scout's guess. */
  expGuessed: boolean;
  thread: Msg[];
  busy: boolean;
  productId: string | null;
  drawer: Drawer;
  compare: string[];
  compareOpen: boolean;
  supCompareOpen: boolean;
  /** Every region side by side. */
  marketsOpen: boolean;
  /** The supplier conversations, from the top menu. */
  messagesOpen: boolean;
  contacted: string[];
  quotesReady: boolean;
  sampleIds: string[];
  samplesRequested: boolean;
  sheet: 'inquiry' | 'samples' | 'order' | null;
  /** Days since the quote request. Every event is dated from it. */
  day: number;
  /** The day the current samples were requested. */
  sampleDay: number | null;
  /** The seller's eight-point ratings, per supplier. */
  ratings: Ratings;
  /** The supplier the first order goes to, once chosen. */
  orderId: string | null;
  ordered: boolean;
  /** Money spent on samples so far, including any second sample. */
  spent: number;
  inquiryDraft: string;
  followUp: boolean;
  planOpen: boolean;
  /** Rank change per product after the last brief change. Positive means it moved up. */
  moved: Record<string, number>;
  error: boolean;
  panelOpen: boolean;
  live: boolean | null;
  model: string | null;
  planBump: number;
  /** Scout is running the journey itself and will stop at the next approval. */
  auto: boolean;
}

export interface PlanItem { key: string; title: string; detail: string }

const STAGE_INDEX: Record<Stage, number> = { start: 0, setup: 1, category: 1, pick: 1, opportunities: 2, suppliers: 3, waiting: 4, quotes: 4, decision: 5, done: 5, check: 5, order: 6, ordered: 7 };

function initial(): State {
  const w = say.welcome();
  return {
    stage: 'start', entry: null, profile: { ...DEFAULT_PROFILE },
    answered: { market: false, budget: false, channel: false }, guessed: true, expGuessed: true,
    thread: [{ id: 1, from: 'scout', text: w.text, chips: w.chips }],
    busy: false, productId: null, drawer: null, compare: [], compareOpen: false, supCompareOpen: false, marketsOpen: false, messagesOpen: false,
    contacted: [], quotesReady: false, sampleIds: [], samplesRequested: false,
    sheet: null, day: 0, sampleDay: null, ratings: {}, orderId: null, ordered: false, spent: 0, inquiryDraft: '', followUp: true, planOpen: false, moved: {}, error: false, panelOpen: false,
    live: null, model: null, planBump: 0, auto: false,
  };
}

interface Store {
  s: State;
  run: Run;
  supRun: SupRun | null;
  quotes: Quote[];
  picks: Quote[];
  plan: PlanItem[];
  stageIndex: number;
  tap: (chip: Chip) => void;
  act: (a: Act) => void;
  ask: (text: string) => void;
  set: (patch: Partial<State>) => void;
  toggleCompare: (id: string) => void;
  sendInquiry: () => void;
  paySamples: () => void;
  placeOrder: () => void;
  toggleSample: (id: string) => void;
  jump: (stage: Stage) => void;
  simulateError: () => void;
  retry: () => void;
  /** Hands the search to Scout. With a sentence, Scout reads the brief from it first. */
  autopilot: (text?: string) => void;
  closeSheet: () => void;
  /** The step the seller would most likely take next. */
  next: Chip | null;
}

const StoreContext = createContext<Store | null>(null);
export const useStore = () => {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore outside provider');
  return v;
};

const theMarket = (p: Profile) => MARKETS[p.market].the;
const STEP_MS = 480;

const AUTO_GAP = 1200;

export function StoreProvider({ children, transport = serverTransport }: { children: React.ReactNode; transport?: Transport }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const S = useRef<State>(null as unknown as State);
  if (!S.current) S.current = initial();
  const nextId = useRef(2);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const epoch = useRef(0);
  const liveFails = useRef(0);
  const autoSeq = useRef(0);
  const autoTarget = useRef<string | null>(null);
  /** What the conversation last touched, so "it" and "them" mean something. */
  const recall = useRef<{ productId: string | null; supplierId: string | null }>({ productId: null, supplierId: null });

  const set = (patch: Partial<State> | ((s: State) => Partial<State>)) => {
    S.current = { ...S.current, ...(typeof patch === 'function' ? patch(S.current) : patch) };
    bump();
  };
  const later = (fn: () => void, ms: number) => {
    const e = epoch.current;
    timers.current.push(setTimeout(() => { if (e === epoch.current) fn(); }, ms));
  };
  const push = (m: Omit<Msg, 'id'>): number => {
    const id = nextId.current++;
    set((s) => ({ thread: [...s.thread, { ...m, id }] }));
    return id;
  };
  const patchMsg = (id: number, patch: Partial<Msg> | ((m: Msg) => Partial<Msg>)) =>
    set((s) => ({ thread: s.thread.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) }));
  const scout = (r: Reply, extra: Partial<Msg> = {}) => push({ from: 'scout', text: r.text, chips: r.chips, ...extra });
  const user = (text: string) => {
    // The conversation opens with the seller's own words. The welcome only stood in until then, and the Start screen already says it.
    const s = S.current;
    if (s.stage === 'start' && s.thread.every((m) => m.from === 'scout' && m.id === 1)) set({ thread: [] });
    return push({ from: 'user', text });
  };

  /** Shows Scout working through steps, then delivers the result. */
  const work = (steps: string[], then: () => Reply | null) => {
    const id = push({ from: 'scout', pending: true, steps: steps.map((label) => ({ label, done: false })) });
    set({ busy: true });
    steps.forEach((_, i) => later(() => patchMsg(id, (m) => ({ steps: m.steps!.map((st, j) => (j <= i ? { ...st, done: true } : st)) })), STEP_MS * (i + 1)));
    later(() => {
      const r = then();
      patchMsg(id, { pending: false, text: r?.text, chips: r?.chips });
      set({ busy: false });
      if (S.current.auto) autoTick();
    }, STEP_MS * steps.length + 260);
  };

  const ctx = (): Ctx => {
    const s = S.current;
    return {
      stage: s.stage, profile: s.profile, productId: s.productId,
      focusProductId: s.drawer?.kind === 'product' ? s.drawer.id : null,
      focusSupplierId: s.drawer?.kind === 'supplier' ? s.drawer.id : null,
      contacted: s.contacted, quotesReady: s.quotesReady, sampleIds: s.sampleIds, samplesRequested: s.samplesRequested,
      recall: { ...recall.current }, auto: s.auto,
    };
  };

  /* ───────────── The guided journey ───────────── */

  const nextQuestion = (first = false) => {
    const a = S.current.answered;
    if (!a.market) scout(say.askMarket(first), { widget: { kind: 'market' } });
    else if (!a.budget) scout(say.askBudget(), { widget: { kind: 'budget' } });
    else if (!a.channel) scout(say.askChannel(), { widget: { kind: 'channel' } });
    else briefComplete();
  };

  const briefComplete = () => {
    const s = S.current;
    push({ from: 'scout', text: say.briefDone(s.profile, s.guessed, s.expGuessed) });
    const named = recall.current.productId;
    if (s.entry === 'suppliers' && named) { set({ stage: 'pick' }); choose(named, true); }
    else if (s.entry === 'suppliers') { set({ stage: 'pick' }); scout(say.pickProduct()); }
    else { set({ stage: 'category' }); scout(say.category(s.profile)); }
  };

  /** Moves the search to the category a product belongs to. Refused once a product is chosen, so suppliers and quotes never point at the wrong list. */
  const ensureCategory = (productId: string): boolean => {
    const pr = productById(productId);
    const s = S.current;
    if (!pr) return false;
    if (pr.category === (s.profile.category ?? 'pet')) return true;
    if (s.productId && STAGE_INDEX[s.stage] >= 3) {
      scout({
        text: `The ${pr.short} is in ${CATEGORY_META[pr.category].lower}, and you're already working on the ${productById(s.productId)!.short}.`,
        chips: [{ label: `Look at ${CATEGORY_META[pr.category].lower}`, act: { t: 'category', id: pr.category } }],
      });
      return false;
    }
    set({ profile: { ...s.profile, category: pr.category } });
    return true;
  };

  /** Look at another category. Before a product is chosen it's a simple switch; after, it starts a new search on the same brief. */
  const switchCategory = (id: CategoryId, confirmed = false) => {
    const s = S.current;
    const cur = s.profile.category ?? 'pet';
    const progress = Boolean(s.productId) && STAGE_INDEX[s.stage] >= 3;
    if (progress && !confirmed) {
      scout({
        text: `You've already chosen the ${productById(s.productId!)!.short} and ${s.contacted.length ? 'contacted its suppliers' : 'have its suppliers lined up'}. Looking at ${CATEGORY_META[id].lower} starts a new search on the same brief.`,
        chips: [
          { label: `Start a ${CATEGORY_META[id].lower} search`, act: { t: 'category', id, confirm: true } as Act, rec: true },
          { label: `Stay with the ${productById(s.productId!)!.short}`, act: { t: 'ask', text: 'never mind' } },
        ],
      });
      return;
    }
    if (progress) set({ productId: null, contacted: [], quotesReady: false, sampleIds: [], samplesRequested: false, compare: [] });
    if (id !== cur) set({ profile: { ...S.current.profile, category: id } });
    showProducts();
  };

  const showProducts = () => {
    set({ stage: 'opportunities', drawer: null, compareOpen: false });
    const run = evaluate(S.current.profile);
    const steps = [`Scanning ${run.results.length} ${CATEGORY_META[S.current.profile.category ?? 'pet'].lower} products`, run.over.length ? `Setting aside ${run.over.length} over your ${money0(run.cap)} first order limit` : `Checking each against your ${money0(run.cap)} first order limit`, `Working out what one sale earns in ${theMarket(S.current.profile)}`];
    work(steps, () => say.opportunities(evaluate(S.current.profile)));
  };

  const choose = (id: string, force = false) => {
    if (!ensureCategory(id)) return;
    const s = S.current;
    const run = evaluate(s.profile);
    const r = run.results.find((x) => x.product.id === id);
    if (!r) return;
    const best = run.fits[0];
    if (!force && (r.verdict.tier === 'skip' || r.verdict.tier === 'out') && best && best.product.id !== id && best.verdict.tier !== 'skip') {
      set({ drawer: null, compareOpen: false });
      scout({
        text: `Before I look for suppliers: I'd advise against the ${r.product.short}. **${r.verdict.label}: ${r.verdict.reason}.**\n\nThe ${best.product.short} makes about ${money(best.stack.profit)} per sale and fits your budget. It's your call.`,
        chips: [
          { label: `Use the ${best.product.short} instead`, act: { t: 'choose', id: best.product.id }, rec: true },
          { label: `Continue with the ${r.product.short}`, act: { t: 'choose', id, force: true } },
        ],
      });
      return;
    }
    recall.current = { productId: null, supplierId: null };
    set({
      productId: id, stage: 'suppliers', drawer: null, compareOpen: false, supCompareOpen: false, compare: [],
      contacted: [], quotesReady: false, sampleIds: [], samplesRequested: false, planBump: s.planBump + 1,
    });
    const p = r.product;
    work(
      [`Reading ${p.listings} supplier listings for the ${p.short}`, 'Checking licences, factory audits and order history', `Pricing a first order from each, landed in ${theMarket(s.profile)}`, 'Setting aside anything risky or over budget'],
      () => say.suppliers(evaluateSuppliers(id, S.current.profile)),
    );
  };

  const draftInquiry = () => {
    const s = S.current;
    if (!s.productId) return;
    const sup = evaluateSuppliers(s.productId, s.profile);
    if (!sup.shortlist.length) return;
    set({ sheet: 'inquiry', drawer: null, supCompareOpen: false, inquiryDraft: s.inquiryDraft || say.inquiryText(sup.product, s.profile, sup.shortlist.map((r) => r.moq)) });
  };

  const sendInquiry = () => {
    const s = S.current;
    if (!s.productId) return;
    const sup = evaluateSuppliers(s.productId, s.profile);
    const ids = sup.shortlist.map((r) => r.supplier.id);
    set({ sheet: null, contacted: ids, stage: 'waiting', quotesReady: false, planBump: s.planBump + 1 });
    user(`Send to ${ids.length} ${ids.length === 1 ? 'supplier' : 'suppliers'}`);
    scout(say.inquirySent(ids.length));
    if (S.current.auto) autoTick();
  };

  /** Closing an approval sheet without approving is a "not now", so Scout stops and waits. */
  const closeSheet = () => {
    const s = S.current;
    const wasInquiry = s.sheet === 'inquiry';
    set({ sheet: null });
    if (s.auto && wasInquiry) { set({ auto: false }); scout(say.autoPaused()); }
  };

  const skipAhead = () => {
    const s = S.current;
    if (!s.productId || s.stage !== 'waiting') return;
    const qs = quotesFor(s.productId, s.profile, s.contacted);
    const chased = qs.find((q) => q.followUp);
    const early = qs.filter((q) => !q.followUp).length;
    const steps = [`Day 1: ${early} of ${qs.length} suppliers replied`];
    if (chased) steps.push(`Day 2: ${s.followUp ? `no word from ${chased.supplier.short}, so I followed up` : `${chased.supplier.short} is still quiet`}`);
    steps.push(`Day ${chased ? 3 : 2}: all replies in. Updating profit for each quote`);
    work(steps, () => {
      const cur = S.current;
      const quotes = quotesFor(cur.productId!, cur.profile, cur.contacted);
      const picks = pickSamples(quotes);
      set({ stage: 'quotes', quotesReady: true, sampleIds: picks.map((q) => q.supplier.id), day: qs.some((q) => q.followUp) ? 3 : 2 });
      return say.quotes(quotes, picks, cur.profile);
    });
  };

  const currentPicks = () => {
    const s = S.current;
    if (!s.productId) return [];
    return quotesFor(s.productId, s.profile, s.contacted).filter((q) => s.sampleIds.includes(q.supplier.id));
  };

  const review = () => {
    if (!S.current.quotesReady) return;
    set({ stage: 'decision', drawer: null, supCompareOpen: false });
    scout(say.decision(currentPicks()));
  };

  const paySamples = () => {
    const picks = currentPicks();
    const total = picks.reduce((a, q) => a + q.sampleCost, 0);
    set((s) => ({ sheet: null, samplesRequested: true, stage: 'done', sampleDay: s.day, spent: s.spent + total, planBump: s.planBump + 1 }));
    user(`Pay ${money0(total)} and request samples`);
    scout(say.done(picks, S.current.day));
  };

  /* ───────────── After samples: delivery, the check, the first order ───────────── */

  const pointsFor = () => {
    const s = S.current;
    const pr = s.productId ? productById(s.productId) : null;
    return pr ? checkPoints(pr.category, s.profile, stackFor(pr, s.profile).price) : [];
  };
  const verdictNow = () => {
    const s = S.current;
    const quotes = s.productId ? quotesFor(s.productId, s.profile, s.contacted) : [];
    return checkVerdict(sampleResults(currentPicks(), pointsFor(), s.ratings), quotes);
  };

  /** In a real search the samples take a week; here the wait is skipped, and the days move on. */
  const arrive = () => {
    const s = S.current;
    if (s.stage !== 'done' || s.sampleDay === null) return;
    const d0 = s.sampleDay;
    work([`${dateOf(d0 + SAMPLE_DAYS.ship)}: samples shipped`, `${dateOf(d0 + SAMPLE_DAYS.arrive)}: delivered to you`], () => {
      set({ stage: 'check', day: d0 + SAMPLE_DAYS.arrive });
      return say.arrived(currentPicks());
    });
  };

  const rate = (id: string, point: string, value: Rating) => {
    const before = verdictNow().kind;
    set((s) => ({ ratings: { ...s.ratings, [id]: { ...(s.ratings[id] ?? {}), [point]: value } } }));
    const v = verdictNow();
    // Scout speaks once, when the last point is rated. Later changes update the card on screen.
    if (before === 'pending' && v.kind !== 'pending') scout(say.checked(v));
  };
  const rateRest = (id: string) => {
    const before = verdictNow().kind;
    const pts = pointsFor();
    set((s) => {
      const cur = { ...(s.ratings[id] ?? {}) };
      pts.forEach((pt) => { if (!cur[pt.id]) cur[pt.id] = 'good'; });
      return { ratings: { ...s.ratings, [id]: cur } };
    });
    const v = verdictNow();
    if (before === 'pending' && v.kind !== 'pending') scout(say.checked(v));
  };

  const orderFrom = (id: string) => {
    const s = S.current;
    const q = s.productId ? quotesFor(s.productId, s.profile, s.contacted).find((x) => x.supplier.id === id) : null;
    if (!q) return;
    const res = sampleResults(currentPicks(), pointsFor(), s.ratings).find((r) => r.q.supplier.id === id);
    set({ orderId: id, stage: 'order', drawer: null });
    scout(say.orderDraft(q, res ?? null, s.profile, s.spent, s.day));
  };

  const placeOrder = () => {
    const s = S.current;
    const q = s.productId && s.orderId ? quotesFor(s.productId, s.profile, s.contacted).find((x) => x.supplier.id === s.orderId) : null;
    if (!q || s.ordered) return;
    set((x) => ({ sheet: null, ordered: true, stage: 'ordered', planBump: x.planBump + 1 }));
    user(`Place the order for ${money0(q.stack.firstOrder)}`);
    scout(say.ordered(q, s.profile, s.spent, s.day));
  };

  /** A second sample after a failed check: from the same supplier once fixed, or the next one on the list. */
  const resample = (id: string) => {
    const s = S.current;
    const q = s.productId ? quotesFor(s.productId, s.profile, s.contacted).find((x) => x.supplier.id === id) : null;
    if (!q) return;
    const { [id]: _drop, ...keep } = s.ratings;
    void _drop;
    set({ sampleIds: [id], ratings: keep, stage: 'done', sampleDay: s.day, spent: s.spent + q.sampleCost, orderId: null });
    user(`Request a new sample from ${q.supplier.short} for ${money0(q.sampleCost)}`);
    scout(say.resampled(q, s.day));
  };

  /* ───────────── Changing the brief ───────────── */

  const changeProfile = (patch: Partial<Profile>, quiet = false): Profile | null => {
    const s = S.current;
    const prev = s.profile;
    const next: Profile = { ...prev, ...patch };
    if (JSON.stringify(prev) === JSON.stringify(next)) return null;
    const answered = { ...s.answered, ...(patch.market ? { market: true } : {}), ...(patch.budget ? { budget: true } : {}), ...(patch.channel ? { channel: true } : {}) };
    const guessed = s.guessed && !patch.priorities;
    const expGuessed = s.expGuessed && !patch.experience;
    // Experience picks the split until the seller chooses one, so a change of experience can move the first order limit.
    const splitMoved = Boolean(patch.experience) && !next.split && capOf(prev) !== capOf(next);

    if (STAGE_INDEX[s.stage] < 2) {
      set({ profile: next, answered, guessed, expGuessed });
      if (s.stage !== 'setup' && s.stage !== 'start' && !quiet) {
        const run = evaluate(next);
        const what = patch.budget ? `Budget set to ${money0(next.budget)}. Your first order limit is now ${money0(capOf(next))}.`
          : patch.split ? `${SPLITS[patch.split].name}: up to ${money0(capOf(next))} on stock, ${money0(next.budget - capOf(next))} kept back.`
          : patch.experience ? `${patch.experience === 'existing' ? 'Noted: you already sell.' : 'Noted: this is your first time sourcing.'}${splitMoved ? ` I've moved you to the ${SPLITS[splitOf(next)].name} split: up to ${money0(capOf(next))} on stock.` : ''}`
          : patch.market ? `Market set to ${MARKETS[next.market].name}.`
          : patch.channel ? `Sales channel set to ${CHANNELS[next.channel].name.toLowerCase()}.`
          : 'Brief updated.';
        const fit = run.fits.length ? ` ${run.fits.length} ${CATEGORY_META[next.category ?? 'pet'].lower} ${run.fits.length === 1 ? 'product fits' : 'products fit'} now.` : ' Nothing fits yet.';
        push({ from: 'scout', text: what + fit, widget: { kind: 'applied', label: 'Brief updated', undo: prev }, chips: run.fits.length && s.stage === 'category' ? [{ label: 'Show products that fit my brief', act: { t: 'category' }, rec: true }] : undefined });
      }
      return prev;
    }
    const a = evaluate(prev);
    const b = evaluate(next);
    const diff = diffRuns(a, b);
    const moved: Record<string, number> = {};
    for (const r of b.fits) {
      const o = a.results.find((x) => x.product.id === r.product.id)!;
      if (o.rank !== null && r.rank !== null && o.rank !== r.rank) moved[r.product.id] = o.rank - r.rank;
      if (o.rank === null) moved[r.product.id] = 99;
    }
    const extra: string[] = [];
    let nudge: Chip[] | undefined;
    if (s.productId && STAGE_INDEX[s.stage] >= 3) {
      extra.push(...diffSuppliers(evaluateSuppliers(s.productId, prev), evaluateSuppliers(s.productId, next)));
      const chosen = b.results.find((r) => r.product.id === s.productId)!;
      const was = a.results.find((r) => r.product.id === s.productId)!;
      if (chosen.verdict.tier !== was.verdict.tier) extra.unshift(`Your chosen product, the ${chosen.product.short}, is now "${chosen.verdict.label}": ${chosen.verdict.reason}.`);
      else if (chosen.stack.profit !== was.stack.profit) extra.unshift(`The ${chosen.product.short} now makes ${money(chosen.stack.profit)} per sale (was ${money(was.stack.profit)}).`);
      // Speak up when the change leaves the chosen product behind.
      const best = b.fits[0];
      const worse = chosen.verdict.tier === 'skip' || chosen.verdict.tier === 'out';
      const overtaken = best && best.verdict.tier === 'worth' && was.verdict.tier === 'worth' && chosen.verdict.tier !== 'worth';
      if (!s.samplesRequested && best && best.product.id !== s.productId && best.verdict.tier !== 'skip' && (worse || overtaken)) {
        extra.splice(1, 0, worse
          ? `I'd switch. The ${best.product.short} makes ${money(best.stack.profit)} per sale here and fits your budget.`
          : `The ${best.product.short} now ranks first for this brief: ${best.verdict.reason}.`);
        nudge = [
          { label: `Switch to the ${best.product.short}`, act: { t: 'choose', id: best.product.id }, rec: worse },
          { label: `Keep the ${chosen.product.short}`, act: { t: 'ask', text: `Keep the ${chosen.product.short}` } },
        ];
      }
    }
    set({ profile: next, answered, guessed, expGuessed, moved });
    later(() => set({ moved: {} }), 6000);
    const onlyExperience = Object.keys(patch).length === 1 && patch.experience && !splitMoved;
    if (splitMoved) extra.unshift(next.experience === 'existing' ? `You already sell, so I put more on stock: the ${SPLITS[splitOf(next)].name} split, up to ${money0(capOf(next))}.` : `You're new to sourcing, so I keep more back: the ${SPLITS[splitOf(next)].name} split, up to ${money0(capOf(next))}.`);
    if (onlyExperience) {
      if (!quiet) push({ from: 'scout', text: patch.experience === 'new' ? "Noted. I'll explain trade terms as we go." : "Noted. I'll keep it short and use trade terms.", widget: { kind: 'applied', label: 'Experience updated', undo: prev } });
      return prev;
    }
    if (!quiet) push({ from: 'scout', widget: { kind: 'changed', diff, undo: prev, extra }, chips: nudge });
    else if (nudge) later(() => push({ from: 'scout', text: extra.slice(0, 2).join(' '), chips: nudge }), 900);
    return prev;
  };

  /* ───────────── Scout runs the search itself ───────────── */

  const autoTick = (ms = AUTO_GAP) => {
    const n = ++autoSeq.current;
    later(() => { if (n === autoSeq.current) runAuto(); }, ms);
  };

  const startAuto = (text?: string) => {
    const s = S.current;
    if (s.auto) return;
    if (s.ordered) {
      scout({ text: 'This search is finished: your first order is placed. Start a new search and I can run that one for you.', chips: [{ label: 'Start a new search', act: { t: 'reset' } }] });
      return;
    }
    if (s.stage === 'check') {
      scout({ text: "This step needs you. I can't hold the samples, so the eight-point check is yours. Rate each point and I'll compare them the moment you're done." });
      return;
    }
    const found = text ? extractBrief(text) : { patch: {} as Partial<Profile>, noData: undefined };
    if (found.noData) {
      scout({
        text: `I don't have data for ${found.noData} yet, so I won't guess. Pick a market I do have and I'll run the search there.`,
        chips: MARKET_ORDER.map((id) => ({ label: MARKETS[id].name, act: { t: 'auto', text: `${text ?? ''} ${MARKETS[id].name}`.replace(new RegExp(found.noData!, 'i'), '') } })),
      });
      return;
    }
    if (STAGE_INDEX[s.stage] < 2) {
      const named = text ? entities(text).products[0] ?? null : null;
      // "Find suppliers for resistance bands", or "I want to sell kitchen products": the search starts in that category.
      const cat = named ? productById(named)!.category : text ? categoryIn(text) : null;
      const profile = { ...s.profile, ...found.patch, ...(cat ? { category: cat } : {}) };
      const assumed: string[] = [];
      if (!s.answered.market && !found.patch.market) assumed.push('a market');
      if (!s.answered.budget && !found.patch.budget) assumed.push('a budget');
      if (!s.answered.channel && !found.patch.channel) assumed.push('a sales channel');
      const target = named;
      autoTarget.current = target;
      set({
        profile, answered: { market: true, budget: true, channel: true }, auto: true,
        guessed: s.guessed && !found.patch.priorities, expGuessed: s.expGuessed && !found.patch.experience,
        entry: s.entry ?? (target ? 'suppliers' : 'idea'), stage: 'category',
      });
      push({ from: 'scout', text: say.autoStart(profile, assumed, target ? productById(target) ?? null : null) });
    } else {
      set({ auto: true });
      if (Object.keys(found.patch).length) changeProfile(found.patch);
      push({ from: 'scout', text: "On it. I'll carry on from here and stop before anything is sent or paid." });
    }
    autoTick(1000);
  };

  const stopAuto = () => {
    if (!S.current.auto) return;
    autoSeq.current++;
    set({ auto: false });
    scout({ text: "Paused. Everything stays as it is. Tell me to carry on whenever you like.", chips: [{ label: 'Carry on from here', act: { t: 'auto' }, rec: true }] });
  };

  /** One step of the journey, chosen from where things stand. Every piece of work calls back here when it finishes. */
  const runAuto = () => {
    const s = S.current;
    if (!s.auto) return;
    if (s.busy) { autoTick(400); return; }
    if (s.sheet) return; // An approval is open. Scout waits for the seller.
    const halt = (r: Reply) => { set({ auto: false }); scout(r); };
    const run = evaluate(s.profile);
    switch (s.stage) {
      case 'start': case 'setup': case 'category': case 'pick': {
        const target = autoTarget.current;
        autoTarget.current = null;
        if (target) { choose(target, true); return; }
        // Left to Scout, the search starts in the category Scout would pick for this brief.
        if (!s.profile.category) {
          const best = compareCategories(s.profile).best;
          set({ profile: { ...s.profile, category: best } });
          if (best !== 'pet') push({ from: 'scout', text: `For your brief, ${CATEGORY_META[best].lower} comes out ahead of pet supplies, so I'm looking there.` });
        }
        showProducts();
        return;
      }
      case 'opportunities': {
        if (!run.fits.length) return halt(say.autoNoFit(run));
        if (run.fits[0].verdict.tier === 'skip') return halt(say.autoWeak(run));
        push({ from: 'scout', text: say.autoPick(run) });
        later(() => { if (S.current.auto) choose(run.fits[0].product.id, true); }, 1700);
        return;
      }
      case 'suppliers': {
        const sup = evaluateSuppliers(s.productId!, s.profile);
        if (!sup.shortlist.length) return halt(say.autoNoSupplier());
        push({ from: 'scout', text: say.autoDraft(sup.shortlist.length) });
        later(() => { if (S.current.auto) draftInquiry(); }, 1100);
        return;
      }
      case 'waiting':
        push({ from: 'scout', text: say.autoWait() });
        later(() => { if (S.current.auto) skipAhead(); }, 1300);
        return;
      case 'quotes':
        later(() => { if (S.current.auto) { review(); autoTick(1800); } }, 900);
        return;
      case 'decision':
        push({ from: 'scout', text: say.autoFinal(currentPicks()) });
        set({ auto: false });
        later(() => act({ t: 'draftSamples' }), 1000);
        return;
      case 'done':
        // The wait for samples is skipped; then the check is the seller's, so Scout stops.
        set({ auto: false });
        arrive();
        return;
      case 'order':
        set({ auto: false });
        later(() => act({ t: 'draftOrder' }), 600);
        return;
      default:
        set({ auto: false });
    }
  };

  /* ───────────── Typed questions ───────────── */

  const history = (): Turn[] =>
    S.current.thread
      .filter((m) => m.text && !m.pending)
      .slice(-10)
      .map((m) => ({ role: m.from === 'user' ? 'user' as const : 'assistant' as const, content: m.text!.replace(/\*\*/g, '') }));

  /** Remembers what an answer was about, so the next message can say "it". */
  const remember = (r: Reply) => {
    for (const a of [...(r.acts ?? []), ...(r.chips ?? []).map((c) => c.act)]) {
      if (a.t === 'open' || (a.t === 'choose' && !S.current.productId)) { recall.current.productId = a.id; break; }
      if (a.t === 'openSupplier') { recall.current.supplierId = a.id; break; }
    }
  };

  const askLive = async (text: string, turns: Turn[]): Promise<boolean> => {
    const e = epoch.current;
    const mid = push({ from: 'scout', pending: true, steps: [], text: '' });
    const drop = () => set((s) => ({ thread: s.thread.filter((m) => m.id !== mid) }));
    let got = '';
    let acted = false;
    const handle = (ev: ScoutEvent) => {
      if (e !== epoch.current) return;
      if (ev.type === 'step') patchMsg(mid, (m) => ({ steps: [...(m.steps ?? []).map((st) => ({ ...st, done: true })), { label: ev.label, done: false }] }));
      if (ev.type === 'text' || ev.type === 'set') {
        got = ev.type === 'set' ? ev.text : got + ev.delta;
        patchMsg(mid, (m) => ({ text: got, steps: m.steps?.map((st) => ({ ...st, done: true })) }));
      }
      if (ev.type === 'chips') patchMsg(mid, { chips: ev.chips.map((label) => ({ label, act: { t: 'ask', text: label } })) });
      if (ev.type === 'act') {
        acted = true;
        if (ev.act.t === 'profile') {
          const prev = changeProfile(ev.act.patch, true);
          if (prev) patchMsg(mid, { widget: { kind: 'applied', label: 'Brief updated', undo: prev } });
        } else {
          remember({ text: '', acts: [ev.act] });
          act(ev.act);
        }
      }
    };
    let ok = false;
    try { ok = await transport.ask({ question: text, history: turns, ctx: ctx() }, handle); } catch { ok = false; }
    if (e !== epoch.current) return true;
    if (ok && !got.trim() && acted) { drop(); return true; }
    if (!ok || !got.trim()) { drop(); return false; }
    patchMsg(mid, (m) => ({ pending: false, steps: m.steps?.map((st) => ({ ...st, done: true })) }));
    return true;
  };

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const turns = history();
    const lastScout = [...S.current.thread].reverse().find((m) => m.from === 'scout' && !m.pending);
    user(text);
    const s = S.current;
    const lower = text.toLowerCase();
    const wasAuto = s.auto;

    const named = entities(text);
    if (named.products[0]) recall.current.productId = named.products[0];
    if (named.suppliers[0]) recall.current.supplierId = named.suppliers[0];

    /* A sentence about themselves, before the brief is set: read it instead of asking again. */
    if ((s.stage === 'start' || s.stage === 'setup') && !LIMIT_Q.test(lower) && !command(text, ctx())) {
      const { patch, noData } = extractBrief(text);
      // "How do you pick products?" is a question to answer, not someone saying what they want. Only a stated goal or experience counts as an opening.
      const asked = /\?\s*$|^(how|why|what|which|when|where|who|can|could|does|do you|is|are|will|should)\b/.test(lower);
      const found = opening(text);
      const open = found && !(asked && !found.experience) ? found : null;
      if (open?.experience) patch.experience = open.experience;
      // "I want to sell kitchen products": a statement, so the search starts in that category.
      const cat = asked ? null : categoryIn(text);
      if (cat) patch.category = cat;
      if (Object.keys(patch).length || noData || open) {
        const answered = { market: s.answered.market || Boolean(patch.market), budget: s.answered.budget || Boolean(patch.budget), channel: s.answered.channel || Boolean(patch.channel) };
        const entry = s.entry ?? (open?.goal === 'suppliers' ? 'suppliers' : 'idea');
        set({ profile: { ...s.profile, ...patch }, answered, stage: 'setup', entry, guessed: s.guessed && !patch.priorities, expGuessed: s.expGuessed && !patch.experience });
        const got: string[] = [];
        if (patch.market) got.push(MARKETS[patch.market].name);
        if (patch.budget) got.push(`a ${money0(patch.budget)} budget`);
        if (patch.category) got.push(CATEGORY_META[patch.category].lower);
        if (patch.channel) got.push(patch.channel === 'marketplace' ? 'you sell on a marketplace' : patch.channel === 'own' ? 'you sell through your own store' : CHANNELS[patch.channel].name.toLowerCase());
        if (patch.priorities) got.push(list(patch.priorities.map((x) => PRIORITIES[x].name.toLowerCase())));
        if (noData) push({ from: 'scout', text: `I don't have data for ${noData} yet, so I won't guess.${got.length ? ` I've noted ${list(got)}.` : ''}` });
        else if (open && s.stage === 'start') push({ from: 'scout', text: say.greeting(open, got, recall.current.productId ? productById(recall.current.productId)?.short : undefined) });
        else if (got.length) push({ from: 'scout', text: `Noted: ${list(got)}.` });
        else if (patch.experience) push({ from: 'scout', text: patch.experience === 'new' ? "Noted. I'll explain trade terms as we go." : "Noted. I'll keep it short and use trade terms." });
        nextQuestion(s.stage === 'start' && !got.length);
        return;
      }
    }

    /* "Undo that" */
    if (/^(undo|revert|change (it|that) back|put it back)\b/.test(lower)) {
      const last = [...s.thread].reverse().find((m) => m.widget && (m.widget.kind === 'changed' || m.widget.kind === 'applied'));
      if (last?.widget && 'undo' in last.widget) { act({ t: 'undo', profile: last.widget.undo }); return; }
      scout({ text: 'There is nothing to undo yet. Your brief is as you set it.' });
      return;
    }

    /* "Yes" and "no" answer whatever Scout last proposed. */
    if (/^(yes|yep|yeah|yup|sure|ok(ay)?|go ahead|do it|do that|sounds good|let'?s do (it|that)|please do|go for it|alright|agreed)[.! ]*$/.test(lower) && lastScout?.chips?.length) {
      const chip = lastScout.chips.find((c) => c.rec) ?? (lastScout.chips.length === 1 ? lastScout.chips[0] : null);
      if (chip && chip.act.t !== 'ask') { act(chip.act); return; }
    }
    if (/^(no|nope|nah|not now|not yet|no thanks?)[.! ]*$/.test(lower)) {
      if (wasAuto) { stopAuto(); return; }
      scout({ text: 'No problem. What would you like to do instead?', chips: stageChips(ctx(), evaluate(s.profile)) });
      return;
    }

    /* Things the seller tells Scout to do happen at once. */
    const cmd = command(text, ctx());
    if (cmd) {
      const drives = cmd.acts?.some((a) => a.t === 'auto' || a.t === 'stopAuto');
      if (wasAuto && !drives) set({ auto: false });
      if (cmd.text) scout({ text: cmd.text, chips: cmd.chips });
      remember(cmd);
      cmd.acts?.forEach((a) => act(a.t === 'auto' && !a.text ? { t: 'auto', text } : a));
      return;
    }

    /* Everything else is a question. A question pauses the run; one tap picks it up again. */
    if (wasAuto) { autoSeq.current++; set({ auto: false }); }
    const resume: Chip[] = wasAuto ? [{ label: 'Carry on from here', act: { t: 'auto' } }] : [];
    const builtIn = () => {
      const id = push({ from: 'scout', pending: true });
      later(() => {
        const r = answer(text, ctx());
        patchMsg(id, { pending: false, text: r.text, chips: [...(r.chips ?? []), ...resume].slice(0, 4) });
        remember(r);
        r.acts?.forEach((a) => act(a));
      }, 620);
    };
    if (s.live) {
      askLive(text, turns).then((ok) => {
        if (ok) { liveFails.current = 0; return; }
        // Two failures in a row: stop trying the live model for this session.
        if (++liveFails.current >= 2) set({ live: false });
        builtIn();
      });
    } else builtIn();
  };

  /* ───────────── One place every action goes through ───────────── */

  const act = (a: Act) => {
    const s = S.current;
    switch (a.t) {
      case 'start': set({ entry: a.entry, stage: 'setup' }); nextQuestion(true); break;
      case 'market': {
        const none = NO_DATA_MARKETS.find((m) => m.id === a.id);
        if (none) { scout(say.noData(none.name), s.stage === 'setup' && !s.answered.market ? { widget: { kind: 'market' } } : {}); break; }
        if (briefOpen('market')) answerBrief('market', { market: a.id as MarketId });
        else changeProfile({ market: a.id as MarketId });
        break;
      }
      case 'budget':
        if (briefOpen('budget')) answerBrief('budget', { budget: a.value });
        else changeProfile({ budget: a.value });
        break;
      case 'channel':
        if (briefOpen('channel')) answerBrief('channel', { channel: a.id });
        else changeProfile({ channel: a.id });
        break;
      case 'category': a.id ? switchCategory(a.id, Boolean((a as { confirm?: boolean }).confirm)) : showProducts(); break;
      case 'profile': {
        if (a.patch.market && !MARKETS[a.patch.market]) break;
        const before = S.current.stage;
        changeProfile(a.patch, a.quiet);
        if (before === 'opportunities' && !S.current.busy && !a.quiet && a.patch.budget && evaluate(S.current.profile).fits.length && !evaluate(s.profile).fits.length) {
          scout(say.opportunities(evaluate(S.current.profile)));
        }
        break;
      }
      case 'undo': {
        const cur = S.current.profile;
        set({ profile: a.profile, moved: {} });
        const what = cur.market !== a.profile.market ? `Back to ${MARKETS[a.profile.market].name}.` : cur.budget !== a.profile.budget ? `Back to a ${money0(a.profile.budget)} budget.` : 'Undone. Your brief is as it was.';
        push({ from: 'scout', text: what });
        break;
      }
      case 'open': if (ensureCategory(a.id)) set({ drawer: { kind: 'product', id: a.id, maths: Boolean(a.maths) }, compareOpen: false, panelOpen: false }); break;
      case 'openSupplier': set({ drawer: { kind: 'supplier', id: a.id }, supCompareOpen: false, panelOpen: false }); break;
      case 'compare': {
        const run = evaluate(s.profile);
        const ids = (a.ids?.length ? a.ids : s.compare.length >= 2 ? s.compare : run.fits.filter((r) => r.verdict.tier !== 'skip').slice(0, 3).map((r) => r.product.id)).slice(0, 3);
        if (ids.length < 2) break;
        set({ compare: ids, compareOpen: true, drawer: null, stage: STAGE_INDEX[s.stage] < 2 ? 'opportunities' : s.stage, panelOpen: false });
        scout(say.comparison(run, ids));
        break;
      }
      case 'compareSup': if (s.productId) set({ supCompareOpen: true, drawer: null, panelOpen: false }); break;
      case 'compareMarkets':
        set({ marketsOpen: true, drawer: null, compareOpen: false, supCompareOpen: false, panelOpen: false });
        scout(say.marketCompare(compareMarkets(s.profile, MARKET_ORDER), s.profile, s.answered.market));
        break;
      case 'choose': choose(a.id, a.force); break;
      case 'draftInquiry': draftInquiry(); break;
      case 'skip': skipAhead(); break;
      case 'review': review(); break;
      case 'draftSamples': if (s.quotesReady && s.sampleIds.length && !s.samplesRequested) set({ sheet: 'samples', stage: s.stage === 'quotes' ? 'decision' : s.stage }); break;
      case 'arrive': arrive(); break;
      case 'rate': rate(a.id, a.point, a.value); break;
      case 'rateRest': rateRest(a.id); break;
      case 'orderFrom': if (!s.ordered) orderFrom(a.id); break;
      case 'draftOrder': if (s.stage === 'order' && s.orderId && !s.ordered) set({ sheet: 'order' }); break;
      case 'resample': if (!s.ordered) resample(a.id); break;
      case 'plan': set({ planOpen: true }); break;
      case 'goto': {
        if (a.stage === 'opportunities') set({ stage: 'opportunities', drawer: null, supCompareOpen: false });
        else if (a.stage === 'suppliers' && s.productId) set({ stage: s.contacted.length ? (s.quotesReady ? 'quotes' : 'waiting') : 'suppliers', drawer: null });
        else if (a.stage === 'quotes' && s.quotesReady) set({ stage: 'quotes', drawer: null });
        // The samples step opens where the seller actually is: the plan, the delivery, or the check.
        else if (a.stage === 'decision' && s.quotesReady) set({ stage: !s.samplesRequested ? 'decision' : s.sampleDay !== null && s.day >= s.sampleDay + SAMPLE_DAYS.arrive ? 'check' : 'done', drawer: null });
        else if ((a.stage === 'order' || a.stage === 'ordered') && s.orderId) set({ stage: s.ordered ? 'ordered' : 'order', drawer: null });
        else if (a.stage === 'check' && s.samplesRequested && s.sampleDay !== null && s.day >= s.sampleDay + SAMPLE_DAYS.arrive) set({ stage: 'check', drawer: null });
        else if (a.stage === 'setup') set({ stage: 'category', drawer: null, compareOpen: false });
        break;
      }
      case 'ask': ask(a.text); break;
      case 'auto': startAuto(a.text); break;
      case 'stopAuto': stopAuto(); break;
      case 'reset': reset(); break;
    }
  };

  /** True while a setup answer is still being given, as opposed to changed later. */
  const briefOpen = (field: 'market' | 'budget' | 'channel') => {
    const s = S.current;
    return s.stage === 'start' || s.stage === 'setup' || (STAGE_INDEX[s.stage] < 2 && !s.answered[field]);
  };

  /** Records one of the three setup answers and moves the questions on. */
  const answerBrief = (field: 'market' | 'budget' | 'channel', patch: Partial<Profile>) => {
    const s = S.current;
    const was = s.answered[field];
    // The question Scout is waiting on. An answer to a different one (from the brief cards) doesn't make Scout ask again.
    const asking = !s.answered.market ? 'market' : !s.answered.budget ? 'budget' : !s.answered.channel ? 'channel' : null;
    set({ profile: { ...s.profile, ...patch }, answered: { ...s.answered, [field]: true } });
    if (s.stage === 'setup' && !was && field === asking) nextQuestion();
  };

  const tap = (chip: Chip) => {
    if (S.current.busy && chip.act.t !== 'ask') return;
    // A tap during a run means the seller is taking over.
    if (S.current.auto && chip.act.t !== 'auto' && chip.act.t !== 'ask') { autoSeq.current++; set({ auto: false }); }
    // Chips that only open something on screen leave the conversation as it is.
    if (!['ask', 'open', 'openSupplier', 'plan', 'compareSup', 'compareMarkets'].includes(chip.act.t)) user(chip.label);
    act(chip.act);
  };

  const reset = () => {
    epoch.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const keep = { live: S.current.live, model: S.current.model };
    nextId.current = 2;
    autoSeq.current++;
    autoTarget.current = null;
    recall.current = { productId: null, supplierId: null };
    S.current = { ...initial(), ...keep };
    bump();
  };

  /** Prototype control: land on a stage with the default brief already answered. */
  const jump = (stage: Stage) => {
    reset();
    if (stage === 'start') return;
    const profile = { ...DEFAULT_PROFILE };
    const run = evaluate(profile);
    const productId = run.fits[0].product.id;
    const sup = evaluateSuppliers(productId, profile);
    const contacted = sup.shortlist.map((r) => r.supplier.id);
    const quotes = quotesFor(productId, profile, contacted);
    const picks = pickSamples(quotes);
    const base = { profile, entry: 'idea' as Entry, answered: { market: true, budget: true, channel: true } };
    const first = (r: Reply) => [{ id: 1, from: 'scout' as const, text: r.text, chips: r.chips }];
    if (stage === 'opportunities') set({ ...base, stage, thread: first(say.opportunities(run)) });
    if (stage === 'suppliers') set({ ...base, stage, productId, thread: first(say.suppliers(sup)) });
    if (stage === 'quotes') set({ ...base, stage, productId, contacted, quotesReady: true, sampleIds: picks.map((q) => q.supplier.id), thread: first(say.quotes(quotes, picks, profile)) });
    if (stage === 'decision') set({ ...base, stage, productId, contacted, quotesReady: true, sampleIds: picks.map((q) => q.supplier.id), thread: first(say.decision(picks)) });
  };

  const toggleCompare = (id: string) =>
    set((s) => ({ compare: s.compare.includes(id) ? s.compare.filter((x) => x !== id) : s.compare.length >= 3 ? s.compare : [...s.compare, id] }));

  const toggleSample = (id: string) =>
    set((s) => ({ sampleIds: s.sampleIds.includes(id) ? s.sampleIds.filter((x) => x !== id) : [...s.sampleIds, id] }));

  const simulateError = () => {
    set({ error: true });
    push({ from: 'scout', text: "I couldn't load fresh data just now. Your last results are still on screen. You can retry." });
  };
  const retry = () => {
    set({ error: false });
    work(['Reconnecting to Orvane data', 'Refreshing your results'], () => ({ text: 'Back up to date. Nothing changed while I was away.' }));
  };

  useEffect(() => {
    let alive = true;
    transport.status().then((d) => { if (alive) set({ live: d.live, model: d.model }); }).catch(() => { if (alive) set({ live: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = S.current;
  const run = useMemo(() => evaluate(s.profile), [s.profile]);
  const supRun = useMemo(() => (s.productId ? evaluateSuppliers(s.productId, s.profile) : null), [s.productId, s.profile]);
  const quotes = useMemo(() => (s.productId && s.quotesReady ? quotesFor(s.productId, s.profile, s.contacted) : []), [s.productId, s.quotesReady, s.profile, s.contacted]);
  const picks = useMemo(() => quotes.filter((q) => s.sampleIds.includes(q.supplier.id)), [quotes, s.sampleIds]);

  const plan = useMemo(() => {
    const items: PlanItem[] = [];
    const p = s.profile;
    if (s.answered.market && s.answered.budget && s.answered.channel) {
      items.push({ key: 'brief', title: 'Brief set', detail: `${MARKETS[p.market].name}, ${money0(p.budget)} budget, ${CHANNELS[p.channel].name.toLowerCase()}. First order limit ${money0(capOf(p))}.` });
    }
    const chosen = s.productId ? run.results.find((r) => r.product.id === s.productId) : null;
    if (chosen) items.push({ key: 'product', title: `Product chosen: ${chosen.product.short}`, detail: `About ${money(chosen.stack.profit)} profit per sale. ${chosen.verdict.label}${chosen.verdict.reason ? `: ${chosen.verdict.reason}` : ''}.` });
    if (chosen && supRun && STAGE_INDEX[s.stage] >= 3 && !(s.stage === 'suppliers' && s.busy) && supRun.shortlist.length) {
      items.push({ key: 'shortlist', title: `${supRun.shortlist.length} suppliers shortlisted`, detail: `${list(supRun.shortlist.map((r) => r.supplier.short))}. ${supRun.results.length - supRun.shortlist.length} set aside.` });
    }
    if (s.contacted.length) items.push({ key: 'sent', title: `Inquiry sent to ${s.contacted.length} suppliers`, detail: s.followUp ? 'Scout follows up once after 24 hours of silence.' : 'No automatic follow-up.' });
    if (s.quotesReady && quotes.length) {
      const best = [...quotes].sort((a, b) => b.stack.profit - a.stack.profit)[0];
      items.push({ key: 'quotes', title: `${quotes.length} quotes received`, detail: `Best profit: ${best.supplier.short} at ${money(best.unit)} a unit, ${money(best.stack.profit)} per sale.` });
    }
    if (s.samplesRequested) items.push({ key: 'samples', title: `Samples requested for ${money0(s.spent)}`, detail: `From ${list(picks.map((q) => q.supplier.short))}.${s.sampleDay !== null ? ` Arriving ${dateOf(s.sampleDay + SAMPLE_DAYS.from)} to ${dateOf(s.sampleDay + SAMPLE_DAYS.to)}.` : ''}` });
    const oq = s.orderId ? quotes.find((q) => q.supplier.id === s.orderId) : null;
    if (oq) items.push({ key: 'checked', title: `Samples checked: ${oq.supplier.short} chosen`, detail: `${oq.moq} units at ${money(oq.unit)}, ${money0(oq.stack.firstOrder)} in all.` });
    if (oq && s.ordered) items.push({ key: 'ordered', title: `First order placed with ${oq.supplier.short}`, detail: `Arrives around ${dateOf(orderTimeline(s.day, oq.supplier.lead).at(-1)!.day)}. ${money0(leftForLaunch(p, s.spent, oq.stack.firstOrder))} left for launch.` });
    return items;
  }, [s.profile, s.answered, s.productId, s.stage, s.busy, s.contacted, s.quotesReady, s.samplesRequested, s.followUp, s.spent, s.sampleDay, s.orderId, s.ordered, s.day, run, supRun, quotes, picks]);

  const sampleTotal = picks.reduce((a, q) => a + q.sampleCost, 0);
  const next = useMemo(
    () => {
      const good = run.fits.filter((r) => r.verdict.tier !== 'skip');
      // Nothing worth testing here: point to the category Scout would pick, if it is a different one with something to test.
      const pick = !good.length && s.stage === 'opportunities' ? compareCategories(s.profile) : null;
      const altView = pick ? pick.views.find((v) => v.id === pick.best) : null;
      const alt = pick && pick.best !== (s.profile.category ?? 'pet') && altView?.lead ? pick.best : null;
      // After samples: deliver, then the order. The check itself has no next step: it's the seller's to do.
      if (s.stage === 'done') return { label: 'Skip ahead to delivery', act: { t: 'arrive' } } as Chip;
      if (s.stage === 'order' && s.orderId && !s.ordered) {
        const oq = quotes.find((x) => x.supplier.id === s.orderId);
        return oq ? ({ label: `Place the order for ${money0(oq.stack.firstOrder)}`, act: { t: 'draftOrder' } } as Chip) : null;
      }
      if (s.stage === 'check' || s.stage === 'ordered') return null;
      return say.nextStep(s.stage, { fits: good.length, top: good[0]?.product.id ?? null, topName: good[0]?.product.short, alt, shortlist: supRun?.shortlist.length ?? 0, picks: picks.length, total: sampleTotal });
    },
    [s.stage, run, supRun, picks.length, sampleTotal, s.orderId, s.ordered, quotes],
  );

  const autopilot = (text?: string) => {
    if (text?.trim()) user(text.trim());
    startAuto(text?.trim() || undefined);
  };

  const store: Store = {
    s, run, supRun, quotes, picks, plan, stageIndex: STAGE_INDEX[s.stage],
    tap, act, ask, set, toggleCompare, sendInquiry, paySamples, placeOrder, toggleSample, jump, simulateError, retry,
    autopilot, closeSheet, next,
  };
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export const productName = (id: string | null) => (id ? productById(id)?.short ?? '' : '');
