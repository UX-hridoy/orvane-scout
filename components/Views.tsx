'use client';

import { ArrowDown, ArrowRight, ArrowUp, Check, Minus, X, ChevronDown, CircleAlert, Clock, CreditCard, Dumbbell, Globe, Landmark, Lightbulb, Megaphone, PawPrint, Receipt, RefreshCw, Search, ShieldCheck, Shapes, Smartphone, Store, User, Utensils, Wallet } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CHANNELS, CHANNEL_ORDER, DEFAULT_PROFILE, EXPERIENCE, MARKETS, MARKET_ORDER, NO_DATA_MARKETS, ORIGIN_NAME, PRIORITIES, PRIORITY_ORDER, SPLITS, SPLIT_ORDER, CATEGORY_META, CATEGORY_ORDER, productById, productsIn } from '@/lib/data';
import { entities, extractBrief, opening } from '@/lib/brain';
import { capFor, compareCategories, demandSeries, evaluate, shareOf, splitOf, stackFor } from '@/lib/engine';
import { list, money, money0, monthLabel, pct, trendText } from '@/lib/format';
import type { Rating } from '@/lib/acts';
import { SAMPLE_DAYS, checkPoints, checkVerdict, dateOf, leftForLaunch, nouns, orderTimeline, sampleResults, type CheckVerdict } from '@/lib/samples';
import type { CategoryId, Experience, MarketId, Priority, ProductResult, Quote, SupplierResult } from '@/lib/types';
import { PROMOTED_TAG } from '@/lib/promotion';
import { ProductArt } from './ProductArt';
import { useStore } from './store';
import { CostBar, Ev, EvLegend, Monogram, Num, Spark, SparkMark, VerdictTag, stackLines } from './ui';

const cap1 = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

function ErrorBanner() {
  const { s, retry } = useStore();
  if (!s.error) return null;
  return (
    <div className="banner banner-error" role="alert">
      <CircleAlert size={18} />
      <div><b>I couldn't load fresh data.</b><span>Your last results are still below. Nothing has been sent or changed.</span></div>
      <button className="btn btn-ghost btn-sm" onClick={retry}><RefreshCw size={14} />Retry</button>
    </div>
  );
}

/* ───────────── Start ───────────── */

/**
 * Short starting points. Tapping one fills the box so the seller sees what
 * Scout reads from it. The last one is a question, to show the box takes those too.
 */
const EXAMPLES = [
  { label: '$2,500, US, own store', text: 'I have $2,500 and sell in the US on my own store' },
  { label: '3 lakh taka, Bangladesh', text: 'I have 3 lakh taka and sell in Bangladesh on my own store' },
  { label: 'Suppliers for a slow-feeder bowl', text: 'Find suppliers for a slow-feeder bowl in the UK' },
  { label: 'How does Scout pick products?', text: 'How do you pick which products to show me?' },
];

/**
 * A plan Scout can run: it names where they sell, a budget, a channel or a
 * product. Anything else (a question, "I'm new to this") goes to the
 * conversation instead, where Scout answers and guides them in.
 */
export function isPlan(text: string): boolean {
  const { patch, noData } = extractBrief(text);
  return Boolean(patch.market || patch.budget || patch.channel || noData || entities(text).products[0]);
}

/** What Scout has read from the box so far, shown as the seller types. */
function understood(text: string): { tokens: { icon: typeof Globe; label: string; warn?: boolean }[] } {
  if (!text.trim()) return { tokens: [] };
  const { patch, noData } = extractBrief(text);
  const open = opening(text);
  const named = entities(text).products[0];
  const tokens: { icon: typeof Globe; label: string; warn?: boolean }[] = [];
  if (noData) tokens.push({ icon: Globe, label: `No data for ${noData}`, warn: true });
  if (patch.market) tokens.push({ icon: Globe, label: MARKETS[patch.market].name });
  if (patch.budget) tokens.push({ icon: Wallet, label: money0(patch.budget) });
  if (patch.channel) tokens.push({ icon: Store, label: CHANNELS[patch.channel].name });
  if (named) tokens.push({ icon: Search, label: `Suppliers for the ${productById(named)!.short.toLowerCase()}` });
  else if (open?.goal === 'suppliers') tokens.push({ icon: Search, label: 'Find a better supplier' });
  const exp = patch.experience ?? open?.experience;
  if (exp) tokens.push({ icon: User, label: EXPERIENCE[exp].name });
  return { tokens };
}

/**
 * What one sale really leaves, for the market the seller picks. It starts on
 * the seller's own market when they have set one, and tapping a market shows
 * how the same product changes there. Every cost is one tap or hover away
 * instead of a legend to read.
 */
function OneSale() {
  const { s, run } = useStore();
  const [market, setMarket] = useState<MarketId>(s.answered.market ? s.profile.market : DEFAULT_PROFILE.market);
  useEffect(() => { if (s.answered.market) setMarket(s.profile.market); }, [s.answered.market, s.profile.market]);
  const [active, setActive] = useState<string | null>(null);
  const profile = { ...s.profile, market };
  // The example is the product Scout would lead with for this brief, so it is never a random demo.
  const lead = evaluate(profile).fits.find((r) => r.verdict.tier !== 'skip') ?? evaluate(profile).results[0];
  const st = lead.stack;
  const m = MARKETS[market];
  const lines = stackLines(st, profile.channel);
  const total = Math.max(st.price, lines.reduce((a, l) => a + l.value, 0));
  const biggest = [...lines].sort((a, b) => b.value - a.value)[0];
  const NOTE: Record<string, string> = {
    tax: `${pct(m.vat)} sales tax, already inside the shelf price`,
    cost: 'what the supplier charges for one unit',
    ship: 'sea freight, per unit',
    duty: m.dutyNote ? `about ${pct(m.duty.CN)} on goods from China, simplified` : `${pct(m.duty.CN, (m.duty.CN * 1000) % 10 ? 1 : 0)} on goods from China`,
    fees: profile.channel === 'marketplace' ? '15% marketplace fee' : m.pay.label.toLowerCase(),
    ad: 'what it costs in ads to win one sale. My biggest guess',
    returns: m.refusals ? 'returns, and parcels refused at the door' : 'the share of orders that come back',
    profit: 'yours, after every cost',
  };
  const shown = active === 'profit' ? { label: 'Left for you', value: st.profit } : lines.find((l) => l.key === active) ?? null;
  void run;

  return (
    <section className="one-sale" aria-label="What one sale leaves">
      <header>
        <div>
          <h2>Where one sale goes</h2>
          <p>A {lead.product.short.toLowerCase()} sold for <b className="num">{money(st.price)}</b> in {m.the}. Marketplaces show the supplier's price. Scout shows what is left.</p>
        </div>
        <div className="seg-tabs" role="tablist" aria-label="Market for this example">
          {MARKET_ORDER.map((id) => (
            <button key={id} role="tab" aria-selected={id === market} className={id === market ? 'on' : ''} onClick={() => { setMarket(id); setActive(null); }}>{MARKETS[id].short}</button>
          ))}
        </div>
      </header>

      <div className="one-sale-keep">
        <strong className="num"><Num value={st.profit} /></strong>
        <span>left for you, <b>{pct(Math.max(0, st.margin))}</b> of the price</span>
      </div>

      <div className="sale-bar" onMouseLeave={() => setActive(null)}>
        {lines.map((l) => (
          <button key={l.key} className={`seg seg-${l.key}${active && active !== l.key ? ' dim' : ''}`} style={{ flexGrow: l.value / total }} onMouseEnter={() => setActive(l.key)} onFocus={() => setActive(l.key)} onClick={() => setActive(active === l.key ? null : l.key)} aria-label={`${l.label}: ${money(l.value)}`} />
        ))}
        {st.profit > 0 && <button className={`seg seg-profit${active && active !== 'profit' ? ' dim' : ''}`} style={{ flexGrow: st.profit / total }} onMouseEnter={() => setActive('profit')} onFocus={() => setActive('profit')} onClick={() => setActive(active === 'profit' ? null : 'profit')} aria-label={`Left for you: ${money(st.profit)}`} />}
      </div>

      <p className="sale-caption" aria-live="polite">
        {shown
          ? <><b>{shown.label}, <span className="num">{money(shown.value)}</span>.</b>{cap1(NOTE[active!])}.</>
          : <><b>Biggest cost: {biggest.label.toLowerCase()}, <span className="num">{money(biggest.value)}</span>.</b>{cap1(NOTE[biggest.key])}. Point at any part of the bar for the rest.</>}
      </p>

      <p className="rules"><ShieldCheck size={15} />Every figure is marked verified, estimate or unknown. Paid listings never rank higher. Scout tells you when not to buy.</p>
    </section>
  );
}

export function StartView() {
  const { s, tap, autopilot, ask, set } = useStore();
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  // Once the seller has said something, the conversation is where they type. The box steps aside so there is only ever one.
  const talking = s.thread.some((m) => m.from === 'user');
  const entries = [
    { icon: Lightbulb, title: 'Find a product idea', text: 'Not sure what to sell yet', entry: 'idea' as const },
    { icon: Shapes, title: 'Explore a category', text: 'You know the kind of product', entry: 'category' as const },
    { icon: Search, title: 'Find suppliers for a product', text: 'You know what you want to sell', entry: 'suppliers' as const },
  ];
  const text = draft.trim();
  const plan = text ? isPlan(text) : true;
  const { tokens } = understood(draft);
  // Scout fills gaps with its usual starting point, so say which ones before the run, not after.
  const missing = [
    !tokens.some((t) => t.icon === Globe && !t.warn) && MARKETS[DEFAULT_PROFILE.market].the,
    !tokens.some((t) => t.icon === Wallet) && money0(DEFAULT_PROFILE.budget),
    !tokens.some((t) => t.icon === Store) && 'your own store',
  ].filter(Boolean) as string[];
  const go = () => {
    if (!text) { box.current?.focus(); return; }
    if (plan) autopilot(text);
    else { ask(text); set({ panelOpen: true }); }
    setDraft('');
  };
  const fill = (t: string) => {
    setDraft(t);
    requestAnimationFrame(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(t.length, t.length); } });
  };
  // The box grows with what is typed, up to four lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  return (
    <div className={`view start${talking ? ' is-talking' : ''}`}>
      <div className="start-hero">
        <h1 className="display">{talking ? 'Pick a way to start' : 'What do you want to source?'}</h1>
        <p className="lede">
          {talking
            ? 'Scout is with you in the conversation. Tell it your plan there, or take it one step at a time below.'
            : 'Describe your plan in a sentence, or ask anything first. Scout runs the search and checks with you before anything is sent or paid.'}
        </p>

        <AnimatePresence initial={false}>
          {!talking && (
            <motion.div
              key="composer" className="start-composer"
              exit={{ opacity: 0, height: 0, y: -8 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className={`composer-card${text ? ' has-text' : ''}`}>
                <textarea
                  ref={box} rows={1} value={draft} maxLength={300}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } }}
                  placeholder="I have $3,000 and want to sell pet products in Germany"
                  aria-label="Describe your plan, or ask Scout anything"
                />
                <div className="composer-foot">
                  <div className="understood" aria-live="polite">
                    {text && plan && tokens.length ? (
                      <>
                        <span className="understood-label">Scout reads</span>
                        {tokens.map((t) => { const Icon = t.icon; return <span key={t.label} className={`token${t.warn ? ' warn' : ''}`}><Icon size={13} />{t.label}</span>; })}
                        {missing.length > 0 && <span className="understood-hint">and assumes {list(missing)}</span>}
                      </>
                    ) : (
                      <span className="scout-says">
                        <span className="avatar"><SparkMark size={12} /></span>
                        {text ? 'Scout will answer this, then help you get started.' : 'Scout runs the search from here. Mention where you sell and your budget.'}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-primary run-it" onClick={go} disabled={!text}>
                    {plan ? <>Run it for me<ArrowRight size={16} /></> : <>Ask Scout<ArrowUp size={16} /></>}
                  </button>
                </div>
              </div>

              <div className="ask-examples">
                <span>Try</span>
                {EXAMPLES.map((x) => <button key={x.label} onClick={() => fill(x.text)}>{x.label}</button>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!talking && <div className="or-row"><span>or take it one step at a time</span></div>}

      <div className="entries">
        {entries.map(({ icon: Icon, title, text: t, entry }) => (
          <button key={entry} className="entry" onClick={() => tap({ label: title, act: { t: 'start', entry } })}>
            <span className="entry-icon"><Icon size={20} /></span>
            <span className="entry-text"><b>{title}</b><span>{t}</span></span>
            <ArrowRight size={16} className="entry-go" />
          </button>
        ))}
      </div>

      <OneSale />
    </div>
  );
}

/* ───────────── Brief, category and product pick ───────────── */

type Field = 'market' | 'budget' | 'channel';

function BriefCard({ icon: Icon, title, why, state, onEdit, children }: {
  icon: typeof Globe; title: string; why: string; state: 'asking' | 'open' | 'done'; onEdit?: () => void; children: React.ReactNode;
}) {
  return (
    <section className={`bcard is-${state}`} aria-label={`${title}${state === 'done' ? ', answered' : state === 'asking' ? ', Scout is asking' : ''}`}>
      <header>
        {/* The card keeps its own icon. Answered is a small tick on it, not a new symbol in its place. */}
        <span className="bcard-icon">
          <Icon size={17} />
          {state === 'done' && <i className="bcard-tick" aria-hidden="true"><Check size={9} strokeWidth={3.5} /></i>}
        </span>
        <div><h3>{title}</h3><p>{state === 'asking' ? <span className="bcard-asking"><i />Scout is asking this now</span> : why}</p></div>
        {state === 'done' && onEdit && <button className="bcard-edit" onClick={onEdit}>Change</button>}
      </header>
      {children}
    </section>
  );
}

/** How a budget is split: the first order, and what Scout keeps back. The bar is the picture; two numbers label it. */
function BudgetSplit({ value, share }: { value: number; share: number }) {
  const cap = capFor(value, share);
  return (
    <div className="split" role="img" aria-label={`${money0(cap)} for the first order, ${money0(value - cap)} kept back`}>
      <div className="split-bar" style={{ gridTemplateColumns: `${share}fr ${1 - share}fr` }}><i className="split-order" /><i className="split-hold" /></div>
      <div className="split-legend">
        <span><b className="num">{money0(cap)}</b>first order, at most</span>
        <span><b className="num">{money0(value - cap)}</b>kept for samples, ads, a buffer</span>
      </div>
    </div>
  );
}

/**
 * The split, one tap away and closed by default. Three options, each shown as
 * a small bar with how many products it lets you order, so the choice is made
 * by seeing the result rather than by reading.
 */
function SplitPicker({ value }: { value: number }) {
  const { s, act } = useStore();
  const p = s.profile;
  const [open, setOpen] = useState(false);
  const cur = splitOf(p);
  const pick = splitOf({ ...p, split: undefined });
  const tight = cur === 'stock' && p.experience === 'new';
  return (
    <div className={`splitpick${open ? ' open' : ''}`}>
      <button className="splitpick-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{SPLITS[cur].name} split</span>
        <ChevronDown size={14} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="opts" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="splitpick-body">
            <div className="splitpick-opts" role="radiogroup" aria-label="How your budget is split">
              {SPLIT_ORDER.map((id) => {
                const sh = SPLITS[id].share;
                const fits = evaluate({ ...p, budget: value, split: id }).fits.length;
                return (
                  <button key={id} role="radio" aria-checked={cur === id} className={`splitopt${cur === id ? ' on' : ''}`} onClick={() => act({ t: 'profile', patch: { split: id }, quiet: s.stage === 'setup' })} title={SPLITS[id].hint}>
                    <span className="splitopt-name">{SPLITS[id].name}{id === pick && <span title="Scout's pick for you" aria-label="Scout's pick"><SparkMark size={10} /></span>}</span>
                    <span className="splitopt-bar" style={{ gridTemplateColumns: `${sh}fr ${1 - sh}fr` }}><i /><i /></span>
                    <span className="splitopt-meta"><b className="num">{Math.round(sh * 100)}%</b><em>{fits} fit</em></span>
                  </button>
                );
              })}
            </div>
            {tight && <p className="splitpick-warn"><CircleAlert size={13} />Only {money0(value - capFor(value, SPLITS.stock.share))} left for samples and ads. Tight for a first launch.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function BriefView() {
  const { s, tap, act, run } = useStore();
  const p = s.profile;
  const a = s.answered;
  const m = MARKETS[p.market];
  const count = [a.market, a.budget, a.channel].filter(Boolean).length;
  const asking: Field | null = s.stage !== 'setup' ? null : !a.market ? 'market' : !a.budget ? 'budget' : !a.channel ? 'channel' : null;
  const [editing, setEditing] = useState<Field | null>(null);
  const [budget, setBudget] = useState(p.budget);
  useEffect(() => setBudget(p.budget), [p.budget]);
  const fitsNow = evaluate({ ...p, budget }).fits.length;
  const stateOf = (f: Field) => (editing === f || !a[f] ? (asking === f ? 'asking' : 'open') : 'done');
  const answer = (label: string, a2: Parameters<typeof act>[0]) => { setEditing(null); tap({ label, act: a2 }); };
  const sampleStack = stackFor(productsIn(p.category ?? 'pet')[0], p);
  const duty = `${(m.duty.CN * 100).toFixed((m.duty.CN * 1000) % 10 ? 1 : 0)}%`;
  const togglePriority = (id: Priority) => {
    const cur = p.priorities;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id];
    if (next.length !== cur.length) act({ t: 'profile', patch: { priorities: next }, quiet: true });
  };

  return (
    <div className="view">
      <div className="brief-top">
        <div>
          <h1>Your brief</h1>
          <p className="sub">{count < 3 ? 'Three answers from you, in any order. Scout works out the rest and shows its working.' : 'Scout has what it needs. Change anything here and every result follows.'}</p>
        </div>
        <div className="meter" role="img" aria-label={`${count} of 3 answered`}>
          <div className="meter-segs">{[0, 1, 2].map((i) => <i key={i} className={i < count ? 'on' : i === count ? 'now' : ''} />)}</div>
          <p><b>{count} of 3 answered</b><span>{a.budget ? `${run.fits.length} of ${run.results.length} ${CATEGORY_META[p.category ?? 'pet'].lower} products fit so far` : count ? 'Budget decides what fits' : 'Start with any card'}</span></p>
        </div>
      </div>

      <div className="bcards">
        <BriefCard icon={Globe} title="Where you sell" why="Sets demand, duty and tax" state={stateOf('market')} onEdit={() => setEditing('market')}>
          {stateOf('market') === 'done' ? (
            <>
              <strong className="bcard-value">{m.name}</strong>
              <ul className="facts-mini">
                <li><Landmark size={14} />{duty} import duty on goods from China</li>
                <li><Receipt size={14} />{m.vat ? `${Math.round(m.vat * 100)}% sales tax sits inside the shelf price` : 'No sales tax inside the shelf price'}</li>
              </ul>
            </>
          ) : (
            <div className="opt-grid">
              {MARKET_ORDER.map((id) => (
                <button key={id} className={`opt${a.market && p.market === id ? ' on' : ''}`} onClick={() => answer(MARKETS[id].name, { t: 'market', id })}><span className="code">{id}</span>{MARKETS[id].name}</button>
              ))}
              {NO_DATA_MARKETS.map((x) => (
                <button key={x.id} className="opt off" onClick={() => answer(x.name, { t: 'market', id: x.id })}><span className="code">{x.id}</span>{x.name}<em>No data</em></button>
              ))}
              <button className="opt all" onClick={() => act({ t: 'compareMarkets' })}><span className="code"><Globe size={13} /></span>All regions<em>Compare</em></button>
            </div>
          )}
        </BriefCard>

        <BriefCard icon={Wallet} title="Your budget" why="First order and launch" state={stateOf('budget')} onEdit={() => setEditing('budget')}>
          {stateOf('budget') === 'done' ? (
            <>
              <strong className="bcard-value">{money0(p.budget)}</strong>
              <BudgetSplit value={p.budget} share={shareOf(p)} />
              <SplitPicker value={p.budget} />
            </>
          ) : (
            <>
              <div className="budget-live">
                <div className="budget-top">
                  <strong className="num">{money0(budget)}</strong>
                  {/* Why the budget matters, live: what it lets you order. */}
                  <span className={`fits-live${fitsNow ? '' : ' none'}`}><b className="num">{fitsNow}</b> of {run.results.length} products fit</span>
                </div>
                <input
                  className="range" type="range" min={500} max={8000} step={100} value={budget}
                  style={{ '--fill': `${((budget - 500) / 7500) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setBudget(Number(e.target.value))} aria-label="Budget in US dollars"
                />
                <div className="presets" role="group" aria-label="Common budgets">
                  {[1500, 2500, 4000, 6000].map((v) => <button key={v} className={budget === v ? 'on' : ''} onClick={() => setBudget(v)}>{money0(v)}</button>)}
                </div>
              </div>
              <BudgetSplit value={budget} share={shareOf(p)} />
              <SplitPicker value={budget} />
              <button className="btn btn-primary btn-block" onClick={() => answer(money0(budget), { t: 'budget', value: budget })}>Set budget to {money0(budget)}</button>
            </>
          )}
        </BriefCard>

        <BriefCard icon={Store} title="How you sell" why="Sets fees and ad costs" state={stateOf('channel')} onEdit={() => setEditing('channel')}>
          {stateOf('channel') === 'done' ? (
            <>
              <strong className="bcard-value">{CHANNELS[p.channel].name}</strong>
              <ul className="facts-mini">
                <li><CreditCard size={14} />{p.channel === 'marketplace' ? '15% marketplace fee on each sale' : m.pay.label}</li>
                <li><Megaphone size={14} />About {money(sampleStack.ad)} in ads per sale, an estimate</li>
              </ul>
            </>
          ) : (
            <div className="opt-list">
              {CHANNEL_ORDER.map((id) => (
                <button key={id} className={`opt tall${a.channel && p.channel === id ? ' on' : ''}`} onClick={() => answer(CHANNELS[id].name, { t: 'channel', id })}><b>{CHANNELS[id].name}</b><span>{CHANNELS[id].hint}</span></button>
              ))}
            </div>
          )}
        </BriefCard>
      </div>

      <section className="guesses">
        <header>
          <h3>{s.guessed || s.expGuessed ? "Scout's guesses" : 'What you told Scout'}</h3>
          <p>{s.guessed && s.expGuessed ? 'Two things Scout assumed to save you questions. Tap to correct them.' : s.guessed || s.expGuessed ? 'One thing here is still Scout\'s guess. Tap to correct it.' : 'These decide which products rank first and how much Scout explains.'}</p>
        </header>
        <div className="guess-row">
          <span className="guess-label">What matters most<em>Up to three</em></span>
          <div className="toggles">
            {PRIORITY_ORDER.map((id) => (
              <button key={id} className={`toggle-chip${p.priorities.includes(id) ? ' on' : ''}`} aria-pressed={p.priorities.includes(id)} onClick={() => togglePriority(id)} title={PRIORITIES[id].hint}>
                {p.priorities.includes(id) && <Check size={13} strokeWidth={3} />}{PRIORITIES[id].name}
              </button>
            ))}
          </div>
        </div>
        <div className="guess-row">
          <span className="guess-label">Your experience<em>{EXPERIENCE[p.experience].hint}</em></span>
          <div className="segmented" role="group" aria-label="Your experience">
            {(Object.keys(EXPERIENCE) as Experience[]).map((id) => (
              <button key={id} className={p.experience === id ? 'on' : ''} aria-pressed={p.experience === id} onClick={() => p.experience !== id && act({ t: 'profile', patch: { experience: id }, quiet: true })}>{EXPERIENCE[id].name}</button>
            ))}
          </div>
        </div>
      </section>

      {s.stage === 'category' && <CategoryCards />}

      {s.stage === 'pick' && (
        <>
          <div className="section-head">
            <h2 className="section-title">Which product do you want suppliers for?</h2>
            <CategoryTabs />
          </div>
          <div className="picker">
            {run.results.map(({ product: pr }) => (
              <button key={pr.id} className="pick-card" onClick={() => act({ t: 'choose', id: pr.id, force: true })}>
                <ProductArt id={pr.id} />
                <b>{pr.short}</b>
                <span>{pr.listings} supplier listings</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CATEGORY_ICON: Record<CategoryId, typeof Globe> = { pet: PawPrint, kitchen: Utensils, fitness: Dumbbell, electronics: Smartphone };

/**
 * Where to look first. Every category is judged for the same brief, so each
 * card can show what it would give you: how many products fit and the best
 * one's profit. Scout's pick is the category whose best product ranks highest.
 */
function CategoryCards() {
  const { s, tap } = useStore();
  const { views, best } = compareCategories(s.profile);
  return (
    <>
      <h2 className="section-title">Where to look first</h2>
      <div className="cats">
        {views.map(({ id, run, lead }) => {
          const Icon = CATEGORY_ICON[id];
          return (
            <button key={id} className={`cat${id === best ? ' rec' : ''}`} onClick={() => tap({ label: `Look at ${CATEGORY_META[id].lower}`, act: { t: 'category', id } })}>
              <span className="entry-icon"><Icon size={20} /></span>
              <b>{CATEGORY_META[id].name}</b>
              <span>{CATEGORY_META[id].line}</span>
              <span className="cat-stats">
                <span><b className="num">{run.fits.length}</b>of {run.results.length} fit</span>
                {lead && <span><b className="num">{money(lead.stack.profit)}</b>best per sale</span>}
              </span>
              <i>{id === best ? <><SparkMark size={12} />Scout's pick</> : 'Look here'}<ArrowRight size={14} /></i>
            </button>
          );
        })}
      </div>
      <p className="cats-more">Fashion, beauty, toys and baby products have no product data yet. Ask Scout how they compare.</p>
    </>
  );
}

/** Switch category without leaving the screen. Only shown where the list can change. */
function CategoryTabs() {
  const { s, act } = useStore();
  const cur = s.profile.category ?? 'pet';
  return (
    <div className="seg-tabs cat-tabs" role="tablist" aria-label="Category">
      {CATEGORY_ORDER.map((id) => (
        <button key={id} role="tab" aria-selected={id === cur} className={id === cur ? 'on' : ''} disabled={s.busy} onClick={() => id !== cur && act({ t: 'category', id })}>{CATEGORY_META[id].name}</button>
      ))}
    </div>
  );
}

/* ───────────── Product opportunities ───────────── */

function MovedBadge({ delta }: { delta?: number }) {
  if (!delta) return null;
  if (delta === 99) return <span className="moved in">New</span>;
  return <span className={`moved ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? <ArrowUp size={11} strokeWidth={3} /> : <ArrowDown size={11} strokeWidth={3} />}{Math.abs(delta)}</span>;
}

function ProductCard({ r }: { r: ProductResult }) {
  const { s, act, toggleCompare } = useStore();
  const p = r.product;
  const ticked = s.compare.includes(p.id);
  const lead = r.rank === 1 && r.verdict.tier === 'worth';
  return (
    <article className={`pcard tier-${r.verdict.tier}${ticked ? ' ticked' : ''}${lead ? ' lead' : ''}`}>
      <header>
        <span className="rank">{r.rank}</span>
        <VerdictTag tier={r.verdict.tier} label={r.verdict.label} />
        <MovedBadge delta={s.moved[p.id]} />
        <label className="cmp" title="Compare">
          <input type="checkbox" checked={ticked} onChange={() => toggleCompare(p.id)} disabled={!ticked && s.compare.length >= 3} />
          <span>Compare</span>
        </label>
      </header>
      <div className="art">{lead && <span className="pick-flag"><SparkMark size={11} />Scout's pick</span>}<ProductArt id={p.id} /></div>
      <h3><button className="stretch" onClick={() => act({ t: 'open', id: p.id })}>{p.name}</button></h3>
      <div className="hero">
        <strong><Num value={r.stack.profit} /></strong>
        <span>profit per sale<Ev ev="estimate" /></span>
      </div>
      <p className="why">{cap1(r.verdict.reason)}.</p>
      <footer>
        <div><span>First order</span><b><Num value={r.stack.firstOrder} kind="money0" /></b></div>
        <div><span>Demand, 12 months</span><b className="trend"><Spark values={demandSeries(p, s.profile.market)} trend={r.demand.trend} />{trendText(r.demand.trend)}</b></div>
      </footer>
    </article>
  );
}

function Skeletons({ n = 6 }: { n?: number }) {
  return <div className="grid">{Array.from({ length: n }, (_, i) => <div key={i} className="pcard skeleton" style={{ animationDelay: `${i * 70}ms` }}><div /><div /><div /><div /></div>)}</div>;
}

export function OpportunitiesView() {
  const { s, run, act } = useStore();
  const [showOver, setShowOver] = useState(false);
  const p = s.profile;
  const market = MARKETS[p.market].the;
  const nearest = run.over[0];
  const empty = run.fits.length === 0;
  // What Scout would say about an over-budget product if the budget were raised to fit it.
  const wouldSkip = (r: ProductResult) => evaluate({ ...s.profile, budget: r.needsBudget }).results.find((x) => x.product.id === r.product.id)?.verdict.tier === 'skip';
  const loading = s.busy && s.thread[s.thread.length - 1]?.pending;

  return (
    <div className="view">
      <ErrorBanner />
      <div className="title-row">
        <div>
          <h1>{loading ? 'Finding products that fit your brief' : empty ? `Nothing fits ${money0(p.budget)} yet` : `${run.fits.length} ${run.fits.length === 1 ? 'product fits' : 'products fit'} your ${money0(p.budget)} budget`}</h1>
          <p className="sub">
            {empty && !loading
              ? `Your first order limit is ${money0(run.cap)}. The smallest first order in ${CATEGORY_META[p.category ?? 'pet'].lower} is ${money0(nearest.stack.firstOrder)}.`
              : `${CATEGORY_META[p.category ?? 'pet'].name} in ${market}, ranked for ${list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase())) || 'overall fit'}. Profit is what one sale leaves after every cost.`}
          </p>
        </div>
        {!loading && <div className="title-tools">{!empty && <EvLegend />}<button className="btn btn-ghost btn-sm" onClick={() => act({ t: 'compareMarkets' })}><Globe size={14} />Compare regions</button></div>}
      </div>
      <CategoryTabs />

      {loading ? <Skeletons /> : empty ? (
        <div className="empty card">
          <h2>Two ways forward</h2>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => act({ t: 'profile', patch: { budget: nearest.needsBudget } })}>Raise budget to {money0(nearest.needsBudget)}</button>
            <button className="btn btn-ghost" onClick={() => setShowOver(true)}>Show the closest products</button>
          </div>
          <p>With {money0(nearest.needsBudget)}, the {nearest.product.short} fits. It makes about {money(nearest.stack.profit)} per sale.</p>
        </div>
      ) : (
        <LayoutGroup>
          <div className="grid">
            {run.fits.map((r) => (
              <motion.div key={r.product.id} layout="position" transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
                <ProductCard r={r} />
              </motion.div>
            ))}
          </div>
        </LayoutGroup>
      )}

      {!loading && run.over.length > 0 && (
        <section className="over">
          {/* When nothing fits, this list is the whole answer, so it stays open and has no control that would pretend otherwise. */}
          {empty ? (
            <div className="over-head is-static">
              <span><b>The closest products, and the budget each needs</b><em>Every one is over your {money0(run.cap)} first order limit. Scout keeps 30% of your budget back for samples, ads and a buffer.</em></span>
            </div>
          ) : (
            <button className="over-head" onClick={() => setShowOver(!showOver)} aria-expanded={showOver}>
              <span><b>{run.over.length} {run.over.length === 1 ? 'product is' : 'products are'} over your {money0(run.cap)} first order limit</b><em>Scout keeps 30% of your budget back for samples, ads and a buffer.</em></span>
              <ChevronDown size={18} className={showOver ? 'flip' : ''} />
            </button>
          )}
          {(showOver || empty) && (
            <div className="over-list">
              {run.over.map((r) => (
                <div key={r.product.id} className="over-row">
                  <ProductArt id={r.product.id} />
                  <button className="over-name" onClick={() => act({ t: 'open', id: r.product.id })}>{r.product.name}</button>
                  <span><em>First order</em>{money0(r.stack.firstOrder)}</span>
                  <span><em>Profit per sale</em>{money(r.stack.profit)}</span>
                  {/* A bigger budget can't fix a product that loses money, so Scout doesn't offer one. */}
                  {wouldSkip(r)
                    ? <span className="over-skip">{r.stack.profit <= 0 ? 'Loses money at any budget' : 'Not worth it at any budget'}</span>
                    : <button className="btn btn-ghost btn-sm" onClick={() => act({ t: 'profile', patch: { budget: r.needsBudget } })}>Fits from {money0(r.needsBudget)}</button>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ───────────── Suppliers, waiting and quotes ───────────── */

function ProductStrip() {
  const { s, run, act } = useStore();
  const r = run.results.find((x) => x.product.id === s.productId);
  if (!r) return null;
  return (
    <div className="strip">
      <ProductArt id={r.product.id} />
      <div><b>{r.product.name}</b><span>About {money(r.stack.profit)} profit per sale in {MARKETS[s.profile.market].the}</span></div>
      <VerdictTag tier={r.verdict.tier} label={r.verdict.label} />
      {!s.contacted.length && <button className="link" onClick={() => act({ t: 'goto', stage: 'opportunities' })}>Change product</button>}
    </div>
  );
}

function SupplierRow({ r, status }: { r: SupplierResult; status?: React.ReactNode }) {
  const { act, s } = useStore();
  const sup = r.supplier;
  return (
    <article className={`srow tier-${r.tier}`}>
      <Monogram s={sup} />
      <div className="who">
        <h3><button className="stretch" onClick={() => act({ t: 'openSupplier', id: sup.id })}>{sup.name}</button>{sup.promoted && <span className="promo" title={PROMOTED_TAG}>Promoted</span>}</h3>
        <p>{sup.type === 'Unclear' ? 'Type not stated' : sup.type}, {sup.city}, {ORIGIN_NAME[sup.origin]}</p>
        <div className="checks">
          <span><Ev ev="verified" />Licence</span>
          <span><Ev ev={sup.audit ? 'verified' : 'unknown'} />{sup.audit ? `Audited ${monthLabel(sup.audit)}` : 'No audit'}</span>
          <span><Ev ev="verified" />{sup.orders} orders</span>
        </div>
      </div>
      <dl className="stats">
        <div><dt>Unit price</dt><dd>{money(r.unit)}</dd></div>
        <div><dt>{s.profile.experience === 'new' ? 'Min. order' : 'MOQ'}</dt><dd>{r.moq}</dd></div>
        <div><dt>First order</dt><dd>{money0(r.stack.firstOrder)}</dd></div>
        <div><dt>Profit per sale</dt><dd>{money(r.stack.profit)}</dd></div>
      </dl>
      <div className="verdict">
        {status ?? <><VerdictTag tier={r.tier} label={r.label} /><p>{cap1(r.reason)}</p></>}
      </div>
    </article>
  );
}

function QuoteTable({ quotes }: { quotes: Quote[] }) {
  const { s, toggleSample, act, picks } = useStore();
  const locked = s.samplesRequested;
  return (
    <div className="card table-card">
      <table className="qtable">
        <thead>
          <tr><th>Supplier</th><th className="r">Quoted price</th><th className="r">First order</th><th className="r">Profit per sale</th><th className="r">Sample</th><th className="c">Order sample</th></tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const on = s.sampleIds.includes(q.supplier.id);
            return (
              <tr key={q.supplier.id} className={on ? 'on' : ''}>
                <td>
                  <div className="q-who">
                    <Monogram s={q.supplier} size={36} />
                    <div>
                      <button className="link strong" onClick={() => act({ t: 'openSupplier', id: q.supplier.id })}>{q.supplier.name}</button>
                      <span>{q.followUp ? 'Replied on day 3, after one follow-up' : q.day === 0 ? 'Replied the same day' : 'Replied the next day'}</span>
                    </div>
                  </div>
                </td>
                <td className="r num"><b>{money(q.unit)}</b>{q.delta < 0 ? <em className="down">was {money(q.listed)}</em> : <em>as listed</em>}</td>
                <td className="r num"><b>{money0(q.stack.firstOrder)}</b><em>{q.moq} units</em></td>
                <td className="r num"><b>{money(q.stack.profit)}</b><em>estimate</em></td>
                <td className="r num"><b>{money0(q.sampleCost)}</b><em>{q.supplier.sample.price ? 'with shipping' : 'shipping only'}</em></td>
                <td className="c">
                  <label className="check"><input type="checkbox" checked={on} disabled={locked} onChange={() => toggleSample(q.supplier.id)} /><span className="sr">Order a sample from {q.supplier.short}</span></label>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={4}>{quotes.filter((q) => q.note).slice(0, 1).map((q) => <span key={q.supplier.id}>{q.supplier.short}: {q.note}</span>)}</td><td className="r num"><b>{money0(picks.reduce((a, q) => a + q.sampleCost, 0))}</b></td><td className="c"><em>{picks.length} selected</em></td></tr>
        </tfoot>
      </table>
    </div>
  );
}

export function SuppliersView() {
  const { s, supRun, quotes, act } = useStore();
  if (!supRun) return null;
  const loading = s.stage === 'suppliers' && s.busy && s.thread[s.thread.length - 1]?.pending;
  const main = supRun.results.filter((r) => r.tier === 'shortlist' || r.tier === 'ask');
  const aside = supRun.results.filter((r) => r.tier === 'out' || r.tier === 'avoid');
  const n = supRun.shortlist.length;
  const contacted = supRun.results.filter((r) => s.contacted.includes(r.supplier.id));
  const skipping = s.stage === 'waiting' && s.busy;

  return (
    <div className="view">
      <ErrorBanner />
      <ProductStrip />

      {s.stage === 'suppliers' && (
        <>
          <div className="title-row">
            <div>
              <h1>{loading ? 'Checking suppliers' : n ? `${n} ${n === 1 ? 'supplier' : 'suppliers'} worth contacting` : 'No supplier passes every check'}</h1>
              <p className="sub">{loading ? `Reading ${supRun.product.listings} listings for the ${supRun.product.short}.` : `Scout checked ${supRun.product.listings} listings. Six passed the basic checks and are ranked here by their record. Promoted suppliers are labelled, and promotion doesn't change their place.`}</p>
            </div>
            {!loading && n > 0 && <button className="btn btn-primary" onClick={() => act({ t: 'draftInquiry' })}>Ask {n === 1 ? 'for a quote' : `all ${n} for a quote`}</button>}
          </div>
          {loading ? (
            <div className="rows">{[0, 1, 2, 3].map((i) => <div key={i} className="srow skeleton" style={{ animationDelay: `${i * 70}ms` }}><div /><div /><div /></div>)}</div>
          ) : (
            <>
              <div className="rows">{main.map((r) => <SupplierRow key={r.supplier.id} r={r} />)}</div>
              {aside.length > 0 && (
                <>
                  <h2 className="section-title">Set aside by Scout</h2>
                  <div className="rows muted-rows">{aside.map((r) => <SupplierRow key={r.supplier.id} r={r} />)}</div>
                </>
              )}
            </>
          )}
        </>
      )}

      {s.stage === 'waiting' && (
        <>
          <div className="title-row">
            <div>
              <h1>Inquiry sent to {contacted.length} suppliers</h1>
              <p className="sub">{s.followUp ? 'Scout follows up once if a supplier is quiet for 24 hours. You can withdraw the message, though suppliers may have read it.' : 'No automatic follow-up. You can withdraw the message, though suppliers may have read it.'}</p>
            </div>
            <button className="btn btn-ghost" onClick={() => act({ t: 'skip' })} disabled={skipping}><Clock size={16} />{skipping ? 'Two days pass…' : 'Skip ahead 2 days'}</button>
          </div>
          <div className="rows">
            {contacted.map((r) => <SupplierRow key={r.supplier.id} r={r} status={<span className="waiting"><i />Sent. Waiting for a reply</span>} />)}
          </div>
        </>
      )}

      {s.stage === 'quotes' && (
        <>
          <div className="title-row">
            <div>
              <h1>{quotes.length === 1 ? 'The quote is in' : `All ${quotes.length} quotes are in`}</h1>
              <p className="sub">Profit is recalculated from each quoted price. Tick the suppliers you want a sample from.</p>
            </div>
            <button className="btn btn-primary" onClick={() => act({ t: 'review' })} disabled={!s.sampleIds.length}>Review my plan</button>
          </div>
          <QuoteTable quotes={quotes} />
          <p className="foot-note"><Ev ev="unknown" />Product quality is still unknown. A sample is the only way to check it before you order.</p>
        </>
      )}
    </div>
  );
}

/* ───────────── The sample check ───────────── */

const RATE: { v: Rating; label: string; icon: typeof Check }[] = [
  { v: 'good', label: 'Good', icon: Check },
  { v: 'minor', label: 'Minor issue', icon: Minus },
  { v: 'problem', label: 'Problem', icon: X },
];

/**
 * The seller holds the samples; Scout can't. So the check is theirs: eight
 * points, each rated good, minor issue or problem, side by side for every
 * sample. Scout's recommendation appears only once every point is rated.
 */
export function CheckView() {
  const { s, run, picks, quotes, act } = useStore();
  const r = run.results.find((x) => x.product.id === s.productId);
  if (!r) return null;
  const points = checkPoints(r.product.category, s.profile, r.stack.price);
  const results = sampleResults(picks, points, s.ratings);
  const v = checkVerdict(results, quotes);
  const rated = results.reduce((n, x) => n + x.rated, 0);
  const total = results.length * points.length;

  return (
    <div className="view">
      <ErrorBanner />
      <ProductStrip />
      <div className="title-row">
        <div>
          <h1>Check your {picks.length === 1 ? 'sample' : 'samples'}</h1>
          <p className="sub">Rate what you see and feel. Scout compares them once every point is rated.</p>
        </div>
        <div className="check-progress" role="img" aria-label={`${rated} of ${total} rated`}>
          <span><b className="num">{rated}</b> of {total} rated</span>
          <i><em style={{ width: `${(rated / total) * 100}%` }} /></i>
        </div>
      </div>

      <section className="card check-card">
        <table className="check-table" style={{ '--cols': results.length } as React.CSSProperties}>
          <thead>
            <tr>
              <th>
                <div className="check-legend">
                  {RATE.map(({ v: rv, label, icon: Icon }) => <span key={rv} className={`lg lg-${rv}`}><Icon size={11} strokeWidth={3} />{label}</span>)}
                </div>
              </th>
              {results.map((x) => {
                // One status per sample, always in the same place and the same style.
                const [tone, label] = !x.complete ? ['wait', `${x.rated} of ${points.length} rated`]
                  : x.problems.length ? ['bad', `${x.problems.length} ${x.problems.length === 1 ? 'problem' : 'problems'}`]
                  : x.minors.length ? ['care', `${x.minors.length} to fix`] : ['good', 'All good'];
                return (
                  <th key={x.q.supplier.id}>
                    <div className="check-who"><Monogram s={x.q.supplier} size={30} /><b>{x.q.supplier.short}</b></div>
                    <span className={`check-state ${tone}`}>{label}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {points.map((pt) => (
              <tr key={pt.id}>
                <th scope="row"><b>{pt.title}</b><span>{pt.hint}</span></th>
                {results.map((x) => {
                  const cur = s.ratings[x.q.supplier.id]?.[pt.id];
                  return (
                    <td key={x.q.supplier.id}>
                      <div className="rate" role="radiogroup" aria-label={`${pt.title}, ${x.q.supplier.short}`}>
                        {RATE.map(({ v: rv, label, icon: Icon }) => (
                          <button key={rv} role="radio" aria-checked={cur === rv} aria-label={label} title={label} className={`r-${rv}${cur === rv ? ' on' : ''}`} onClick={() => act({ t: 'rate', id: x.q.supplier.id, point: pt.id, value: rv })}>
                            <Icon size={13} strokeWidth={2.75} />
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {results.some((x) => !x.complete) && (
            <tfoot>
              <tr>
                <th />
                {results.map((x) => (
                  <td key={x.q.supplier.id}>
                    {!x.complete && <button className="btn btn-ghost btn-sm" onClick={() => act({ t: 'rateRest', id: x.q.supplier.id })}>Mark the rest good</button>}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <CheckVerdictCard v={v} />
    </div>
  );
}

/** Scout's view, in its own voice, only once there is something to say. */
function CheckVerdictCard({ v }: { v: CheckVerdict }) {
  const { act } = useStore();
  if (v.kind === 'pending') return <p className="verdict-wait"><SparkMark size={12} />Rate {v.left} more {v.left === 1 ? 'point' : 'points'} and Scout will recommend a supplier.</p>;
  if (v.kind === 'pick') {
    const b = v.best.q;
    return (
      <section className="card scout-verdict">
        <span className="scout-verdict-mark"><SparkMark size={14} /></span>
        <div>
          <h3>Order from {b.supplier.short}</h3>
          <p>{cap1(v.why)}.</p>
        </div>
        <div className="scout-verdict-acts">
          {v.other && !v.other.problems.length && <button className="btn btn-ghost" onClick={() => act({ t: 'orderFrom', id: v.other!.q.supplier.id })}>Use {v.other.q.supplier.short} instead</button>}
          <button className="btn btn-primary" onClick={() => act({ t: 'orderFrom', id: b.supplier.id })}>Prepare the order</button>
        </div>
      </section>
    );
  }
  const c = v.closest;
  return (
    <section className="card scout-verdict warn">
      <span className="scout-verdict-mark"><SparkMark size={14} /></span>
      <div>
        <h3>Neither sample is ready to order</h3>
        <p>{c.q.supplier.short} came closest, but failed on {nouns(c.problems)}. One more sample costs far less than {c.q.moq} faulty units.</p>
      </div>
      <div className="scout-verdict-acts">
        <button className={`btn ${v.next ? 'btn-ghost' : 'btn-primary'}`} onClick={() => act({ t: 'resample', id: c.q.supplier.id })}>New sample from {c.q.supplier.short}, {money0(c.q.sampleCost)}</button>
        {v.next && <button className="btn btn-primary" onClick={() => act({ t: 'resample', id: v.next!.supplier.id })}>Try {v.next.supplier.short}, {money0(v.next.sampleCost)}</button>}
      </div>
    </section>
  );
}

/* ───────────── The first order ───────────── */

/**
 * Scout's draft of the first order, then the same screen once it's placed.
 * The money bar shows the whole budget at once: samples, the order, and what
 * is left for launch.
 */
export function OrderView() {
  const { s, run, quotes, picks, act } = useStore();
  const r = run.results.find((x) => x.product.id === s.productId);
  const q = quotes.find((x) => x.supplier.id === s.orderId);
  if (!r || !q) return null;
  const p = s.profile;
  const points = checkPoints(r.product.category, p, r.stack.price);
  const res = sampleResults(picks.some((x) => x.supplier.id === q.supplier.id) ? picks : [q], points, s.ratings).find((x) => x.q.supplier.id === q.supplier.id)!;
  const goods = Math.round(q.unit * q.moq);
  const left = leftForLaunch(p, s.spent, q.stack.firstOrder);
  const steps = orderTimeline(s.day, q.supplier.lead);
  const placed = s.ordered;
  const pct = (n: number) => `${Math.max(0, (n / p.budget) * 100)}%`;

  return (
    <div className="view">
      <ErrorBanner />
      {placed && <div className="banner banner-done"><Check size={18} strokeWidth={2.5} /><div><b>Order placed with {q.supplier.short}.</b><span>It should reach you around {dateOf(steps[steps.length - 1].day)}. Your money is held by Orvane until then.</span></div></div>}
      <div className="title-row">
        <div>
          <h1>{placed ? 'Your first order' : 'Your first order, ready to approve'}</h1>
          <p className="sub">{placed ? 'Scout\'s part is done. Here is what happens next, and when.' : 'Scout prepared it from the quote and your sample check. Nothing is paid until you approve.'}</p>
        </div>
        {placed
          ? <button className="btn btn-ghost" onClick={() => act({ t: 'reset' })}>Start a new search</button>
          : <button className="btn btn-primary" onClick={() => act({ t: 'draftOrder' })}>Place the order for {money0(q.stack.firstOrder)}</button>}
      </div>

      <div className="order-grid">
        <section className="card order-card">
          <header>
            <div className="art"><ProductArt id={r.product.id} /></div>
            <div><b>{r.product.name}</b><span>From {q.supplier.name}, {q.supplier.city}</span></div>
          </header>
          <dl className="order-lines">
            <div><dt>{q.moq} units at {money(q.unit)}</dt><dd className="num">{money0(goods)}</dd></div>
            <div><dt>Shipping and {MARKETS[p.market].short} duty</dt><dd className="num">{money0(q.stack.firstOrder - goods)}</dd></div>
            <div className="total"><dt>First order</dt><dd className="num">{money0(q.stack.firstOrder)}</dd></div>
          </dl>
          {res.minors.length > 0 && (
            <div className="order-fixes">
              <b>Fix before production</b>
              <ul>{res.minors.map((x) => <li key={x.id}>{x.title}</li>)}</ul>
            </div>
          )}
          {res.problems.length > 0 && <p className="order-warn"><CircleAlert size={15} />This sample failed on {nouns(res.problems)}. Scout advises against this order.</p>}
          {!placed && <button className="link" onClick={() => act({ t: 'goto', stage: 'check' })}>Back to the sample check</button>}
        </section>

        <section className="card order-when">
          <h3 className="card-title">{placed ? 'Where it is' : 'If you order today'}</h3>
          <ol className="when-list">
            {steps.map((x, i) => <li key={x.key} className={placed && i === 0 ? 'done' : placed && i === 1 ? 'now' : ''}><i /><b>{x.label}</b><span>{dateOf(x.day)}</span></li>)}
          </ol>
        </section>

        <section className="card order-money">
          <h3 className="card-title">Your {money0(p.budget)} budget</h3>
          <div className="money-bar" role="img" aria-label={`${money0(s.spent)} on samples, ${money0(q.stack.firstOrder)} on the first order, ${money0(left)} left for launch`}>
            <i className="mb-samples" style={{ width: pct(s.spent) }} />
            <i className="mb-order" style={{ width: pct(q.stack.firstOrder) }} />
            <i className="mb-left" style={{ width: pct(left) }} />
          </div>
          <dl className="money-legend">
            <div><dt><i className="mb-samples" />Samples</dt><dd className="num">{money0(s.spent)}</dd></div>
            <div><dt><i className="mb-order" />First order</dt><dd className="num">{money0(q.stack.firstOrder)}</dd></div>
            <div><dt><i className="mb-left" />Left for launch</dt><dd className="num">{money0(left)}</dd></div>
          </dl>
          <p className="money-note"><ShieldCheck size={14} />Paid through Orvane and held until the goods arrive and match the sample.</p>
        </section>
      </div>
    </div>
  );
}

/* ───────────── Decision ───────────── */

export function DecisionView() {
  const { s, run, picks, quotes, act } = useStore();
  const r = run.results.find((x) => x.product.id === s.productId);
  if (!r) return null;
  const p = s.profile;
  const total = picks.reduce((a, q) => a + q.sampleCost, 0);
  const firsts = picks.map((q) => q.stack.firstOrder);
  const profits = picks.map((q) => q.stack.profit);
  const range = (xs: number[], f: (n: number) => string) => (xs.length === 0 ? 'n/a' : Math.min(...xs) === Math.max(...xs) ? f(xs[0]) : `${f(Math.min(...xs))} to ${f(Math.max(...xs))}`);
  const fromChina = picks.some((q) => q.supplier.origin === 'CN');
  const m = MARKETS[p.market];
  const risks = [
    { ev: 'unknown' as const, title: 'Product quality', text: 'Nobody can know it until samples arrive. That is why samples come before any order.' },
    { ev: 'estimate' as const, title: 'Ad cost per sale', text: `My biggest guess. You stay in profit until ads cost ${money(r.stack.breakEvenAd)} per sale. I assumed ${money(r.stack.ad)}.` },
    { ev: 'estimate' as const, title: `${m.short} import duty`, text: fromChina ? `Duty on goods from China can change. Today it adds ${money(r.stack.duty)} per unit.` : 'Duty rates can change between quote and delivery.' },
  ];
  const done = s.samplesRequested;
  // One live list of what comes next. Before samples it previews the steps at the bottom; once they're requested it moves to the top, with the delivery dates and the way forward inside the step itself.
  const sd = s.sampleDay;
  const nextCard = (
    <section className={`card plan-next${done ? ' live' : ''}`}>
      <h3 className="card-title">What happens next</h3>
      <ol className="next-list">
        <li className={done ? 'done' : 'now'}><b>{done ? 'Samples requested' : 'Request samples'}</b><span>{done && sd !== null ? `${money0(s.spent)} on ${dateOf(sd)}. Shipped around ${dateOf(sd + SAMPLE_DAYS.ship)}.` : `${money0(total)} today. Nothing else is paid until you approve the first order.`}</span></li>
        <li className={done ? 'now' : ''}>
          <b>{done && sd !== null ? `Samples arrive ${dateOf(sd + SAMPLE_DAYS.from)} to ${dateOf(sd + SAMPLE_DAYS.to)}` : 'Check the samples'}</b>
          <span>An eight-point check with the samples in hand. Scout compares them and recommends one.</span>
          {done && <button className="btn btn-primary btn-sm next-act" onClick={() => act({ t: 'arrive' })} disabled={s.busy}>Skip ahead to delivery</button>}
        </li>
        <li><b>Place your first order</b><span>{range(firsts, money0)}, paid through Orvane and held until the goods arrive. You'd keep about {money0(p.budget - Math.max(0, ...firsts) - (done ? s.spent : total))} for launch.</span></li>
      </ol>
    </section>
  );

  return (
    <div className="view">
      <ErrorBanner />
      {done && nextCard}
      <div className="title-row">
        <div>
          <h1>Your sourcing plan</h1>
          <p className="sub">{done ? 'Your samples are on the way. Nothing else has been spent.' : 'What you chose, why, and what is still open. Nothing here commits you to an order.'}</p>
        </div>
        {!done
          ? <button className="btn btn-primary" onClick={() => act({ t: 'draftSamples' })} disabled={!picks.length}>Request {picks.length} {picks.length === 1 ? 'sample' : 'samples'} for {money0(total)}</button>
          : null}
      </div>

      <div className="plan-grid">
        <section className="card plan-product">
          <div className="art"><ProductArt id={r.product.id} /></div>
          <div className="plan-product-body">
            <VerdictTag tier={r.verdict.tier} label={r.verdict.label} />
            <h2>{r.product.name}</h2>
            <p>{cap1(r.verdict.reason)}. Sold for {money(r.stack.price)} in {m.the} through {p.channel === 'marketplace' ? 'a marketplace' : 'your own store'}.</p>
            <dl className="figures">
              <div><dt>Profit per sale<Ev ev="estimate" /></dt><dd>{range(profits, money)}</dd></div>
              <div><dt>First order<Ev ev="estimate" /></dt><dd>{range(firsts, money0)}</dd></div>
              <div><dt>Money back after</dt><dd>{r.stack.breakEvenUnits} of {r.stack.moq} units</dd></div>
            </dl>
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Samples from</h3>
          <ul className="sample-list">
            {picks.map((q) => (
              <li key={q.supplier.id}>
                <Monogram s={q.supplier} size={36} />
                <div><button className="link strong" onClick={() => act({ t: 'openSupplier', id: q.supplier.id })}>{q.supplier.name}</button><span>{money(q.unit)} a unit, {q.moq} minimum, {money0(q.stack.firstOrder)} first order</span></div>
                <b>{money0(q.sampleCost)}</b>
              </li>
            ))}
            {!picks.length && <li className="muted">No samples selected. Go back to the quotes to pick suppliers.</li>}
          </ul>
          {quotes.length > picks.length && !done && <button className="link" onClick={() => act({ t: 'goto', stage: 'quotes' })}>Change which suppliers send samples</button>}
        </section>

        <section className="card">
          <h3 className="card-title">Still open</h3>
          <ul className="risk-list">
            {risks.map((x) => <li key={x.title}><Ev ev={x.ev} label /><div><b>{x.title}</b><span>{x.text}</span></div></li>)}
          </ul>
        </section>

        {!done && nextCard}
      </div>
    </div>
  );
}
