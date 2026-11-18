'use client';

import { Bell, Check, ChevronDown, ClipboardList, Compass, FlaskConical, Globe, Inbox, MessageSquare, Package, RotateCcw, Store, Target, User, Wallet } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CHANNELS, CHANNEL_ORDER, EXPERIENCE, MARKETS, MARKET_ORDER, NO_DATA_MARKETS, PRIORITIES, PRIORITY_ORDER } from '@/lib/data';
import { money0 } from '@/lib/format';
import type { Transport } from '@/lib/acts';
import type { Experience, Priority } from '@/lib/types';
import { CompareTray, ComparePanel, InquirySheet, MarketsPanel, MessagesPanel, OrderSheet, PlanDrawer, ProductDrawer, SamplesSheet, SupComparePanel, SupplierDrawer } from './Overlays';
import { Journey } from './Journey';
import { BudgetControl, ScoutPanel } from './Scout';
import { StoreProvider, useStore } from './store';
import { Logo, SparkMark } from './ui';
import { BriefView, CheckView, DecisionView, OpportunitiesView, OrderView, StartView, SuppliersView } from './Views';

/* ───────────── A small popover that closes on outside click or Escape ───────────── */

function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return { open, setOpen, ref };
}

function Pop({ open, align = 'left', wide, children }: { open: boolean; align?: 'left' | 'right'; wide?: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`pop pop-${align}${wide ? ' wide' : ''}`} role="dialog"
          initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * One choice in a menu. "radio" rows pick one, "check" rows pick several, and
 * plain rows are actions. The marker says which, before anything is tapped.
 */
function Row({ on, title, hint, tag, kind = 'radio', off, onClick }: { on?: boolean; title: string; hint?: string; tag?: string; kind?: 'radio' | 'check' | 'plain'; off?: boolean; onClick: () => void }) {
  const marker = tag || kind === 'plain' ? null : (
    <i className={`mark mark-${kind}`} aria-hidden="true">{kind === 'check' && on ? <Check size={12} strokeWidth={3.2} /> : null}</i>
  );
  return (
    <button className={`pop-row${on ? ' on' : ''}${off ? ' off' : ''}${marker ? ' has-mark' : ''}`} onClick={onClick} role={marker ? (kind === 'check' ? 'menuitemcheckbox' : 'menuitemradio') : undefined} aria-checked={marker ? Boolean(on) : undefined} aria-disabled={off || undefined}>
      {marker}
      <span><b>{title}</b>{hint ? <em>{hint}</em> : null}</span>
      {tag ? <i className="pop-tag">{tag}</i> : null}
    </button>
  );
}

/* ───────────── Header ───────────── */

function PrototypeMenu() {
  const { s, jump, simulateError, act } = useStore();
  const pop = usePop();
  const go = (fn: () => void) => () => { fn(); pop.setOpen(false); };
  return (
    <div className="pop-anchor" ref={pop.ref}>
      <button className="sim-badge" onClick={() => pop.setOpen(!pop.open)} aria-expanded={pop.open}>
        <FlaskConical size={14} />Simulated data
      </button>
      <Pop open={pop.open} align="right" wide>
        <p className="pop-note">Everything in this prototype is simulated: products, suppliers, prices and demand. Nothing here is real market evidence.</p>
        <p className="pop-note">
          <b>Scout's reasoning:</b>{' '}
          {s.live === null ? 'checking…' : s.live ? `open questions go to ${s.model}. Steps and maths always come from the built-in engine.` : 'built-in engine. No live model is connected.'}
        </p>
        <div className="pop-label">Jump to</div>
        <div className="pop-grid">
          <button onClick={go(() => jump('start'))}>Start</button>
          <button onClick={go(() => jump('opportunities'))}>Products</button>
          <button onClick={go(() => jump('suppliers'))}>Suppliers</button>
          <button onClick={go(() => jump('quotes'))}>Quotes</button>
          <button onClick={go(() => jump('decision'))}>Plan</button>
        </div>
        <button className="pop-row" onClick={go(simulateError)}><span><b>Simulate a data error</b><em>Shows how Scout handles a failed load</em></span></button>
        <button className="pop-row" onClick={go(() => act({ t: 'reset' }))}><span><b>Restart the journey</b></span><RotateCcw size={15} /></button>
      </Pop>
    </div>
  );
}

/** A menu item this prototype doesn't build: one tap says so, instead of a dead click. */
function NavSoon({ label, icon: Icon }: { label: string; icon: typeof Compass }) {
  const pop = usePop();
  return (
    <div className="pop-anchor" ref={pop.ref}>
      <button className="nav-item" onClick={() => pop.setOpen(!pop.open)} aria-expanded={pop.open}><Icon size={17} />{label}</button>
      <Pop open={pop.open}>
        <p className="pop-note"><b>{label}</b> isn't part of this prototype. Sourcing with Scout is the part built to try.</p>
      </Pop>
    </div>
  );
}

function Header() {
  const { s, set, quotes } = useStore();
  // New replies are what deserves a count; before then, the number of open conversations.
  const count = s.quotesReady ? quotes.length : s.contacted.length;
  return (
    <header className="header">
      <Logo />
      <nav className="nav" aria-label="Orvane">
        <NavSoon label="Discover" icon={Compass} />
        <button className={`nav-item${s.messagesOpen ? '' : ' on'}`} aria-current={s.messagesOpen ? undefined : 'page'} onClick={() => set({ messagesOpen: false })}><SparkIcon size={17} />Sourcing</button>
        <NavSoon label="Suppliers" icon={Store} />
        <button className={`nav-item${s.messagesOpen ? ' on' : ''}`} aria-current={s.messagesOpen ? 'page' : undefined} onClick={() => set({ messagesOpen: true, drawer: null, compareOpen: false, supCompareOpen: false, marketsOpen: false })}>
          <MessageSquare size={17} />Messages{count > 0 && <b className="nav-count">{count}</b>}
        </button>
        <NavSoon label="Orders" icon={Package} />
      </nav>
      <div className="header-right">
        <PrototypeMenu />
        <button className={`icon-btn${count ? ' has-count' : ''}`} onClick={() => set({ messagesOpen: true, drawer: null, compareOpen: false, supCompareOpen: false, marketsOpen: false, panelOpen: false })} aria-label={`Messages${count ? `, ${count}` : ''}`} title="Messages">
          <Inbox size={18} />{count > 0 && <b className="icon-count">{count}</b>}
        </button>
        <span className="icon-btn dot" aria-hidden="true"><Bell size={18} /></span>
        <span className="me" title="Sam Rivera">SR</span>
      </div>
    </header>
  );
}
const SparkIcon = ({ size }: { size?: number }) => <SparkMark size={(size ?? 16) - 2} />;

/* ───────────── The brief, always in view ───────────── */

function BriefChip({ icon: Icon, label, value, state, children }: {
  icon: typeof Globe; label: string; value: string; state: 'empty' | 'guess' | 'set';
  children: (close: () => void) => React.ReactNode;
}) {
  const pop = usePop();
  return (
    <div className="pop-anchor" ref={pop.ref}>
      <button className={`brief-chip is-${state}`} onClick={() => pop.setOpen(!pop.open)} aria-expanded={pop.open} title={state === 'guess' ? "Scout's guess. Change it any time." : label}>
        <Icon size={15} />
        <span>{state === 'empty' ? label : value}</span>
        {state === 'guess' && <i className="guess-tag">guess</i>}
        <ChevronDown size={14} className="chev" />
      </button>
      <Pop open={pop.open}>{children(() => pop.setOpen(false))}</Pop>
    </div>
  );
}

function ContextBar() {
  const { s, act, plan, set } = useStore();
  const p = s.profile;
  const [budget, setBudget] = useState(p.budget);
  const [prio, setPrio] = useState<Priority[]>(p.priorities);
  useEffect(() => setBudget(p.budget), [p.budget]);
  useEffect(() => setPrio(p.priorities), [p.priorities]);
  const togglePrio = (id: Priority) => setPrio((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]));
  // On a phone the brief folds into one line, so the work comes first.
  const [open, setOpen] = useState(false);
  const known = [s.answered.market && MARKETS[p.market].short, s.answered.budget && money0(p.budget), s.answered.channel && CHANNELS[p.channel].name].filter(Boolean) as string[];

  return (
    <div className={`bar${open ? ' open' : ''}`}>
      <span className="bar-label">Your brief</span>
      <button className="bar-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{known.length ? known.join(', ') : 'Your brief'}</span>
        <ChevronDown size={14} className={open ? 'flip' : ''} />
      </button>
      <BriefChip icon={Globe} label="Market" value={MARKETS[p.market].name} state={s.answered.market ? 'set' : 'empty'}>
        {(close) => (
          <>
            <div className="pop-label">Where you sell</div>
            <Row title="Compare all regions" hint="Every market side by side for your brief" tag="All" onClick={() => { act({ t: 'compareMarkets' }); close(); }} />
            {MARKET_ORDER.map((id) => <Row key={id} on={s.answered.market && p.market === id} title={MARKETS[id].name} onClick={() => { act({ t: 'market', id }); close(); }} />)}
            {NO_DATA_MARKETS.map((m) => <Row key={m.id} title={m.name} tag="No data yet" onClick={() => { act({ t: 'market', id: m.id }); close(); }} />)}
          </>
        )}
      </BriefChip>
      <BriefChip icon={Wallet} label="Budget" value={money0(p.budget)} state={s.answered.budget ? 'set' : 'empty'}>
        {(close) => (
          <div className="pop-pad">
            <div className="pop-label flush">Budget for your first order and launch</div>
            <BudgetControl value={budget} onChange={setBudget} />
            <button className="btn btn-dark btn-block" onClick={() => { act({ t: 'budget', value: budget }); close(); }}>Set budget to {money0(budget)}</button>
          </div>
        )}
      </BriefChip>
      <BriefChip icon={Store} label="Sales channel" value={CHANNELS[p.channel].name} state={s.answered.channel ? 'set' : 'empty'}>
        {(close) => (
          <>
            <div className="pop-label">How you sell</div>
            {CHANNEL_ORDER.map((id) => <Row key={id} on={s.answered.channel && p.channel === id} title={CHANNELS[id].name} hint={CHANNELS[id].hint} onClick={() => { act({ t: 'channel', id }); close(); }} />)}
          </>
        )}
      </BriefChip>
      <BriefChip icon={Target} label="Priorities" value={p.priorities.map((x) => PRIORITIES[x].name).join(', ') || 'No priorities'} state={s.guessed ? 'guess' : 'set'}>
        {(close) => (
          <>
            <div className="pop-head">
              <span>What matters most</span>
              <em className={prio.length === 3 ? 'full' : ''}>{prio.length} of 3</em>
            </div>
            {PRIORITY_ORDER.map((id) => {
              const on = prio.includes(id);
              return <Row key={id} kind="check" on={on} off={!on && prio.length >= 3} title={PRIORITIES[id].name} hint={PRIORITIES[id].hint} onClick={() => togglePrio(id)} />;
            })}
            {prio.length >= 3 && <p className="pop-note">That's three. Untick one to swap it.</p>}
            <div className="pop-pad">
              <button className="btn btn-primary btn-block" disabled={!prio.length || prio.join() === p.priorities.join()} onClick={() => { act({ t: 'profile', patch: { priorities: prio } }); close(); }}>
                {!prio.length ? 'Pick at least one' : prio.join() === p.priorities.join() ? 'No changes yet' : 'Re-rank for these'}
              </button>
            </div>
          </>
        )}
      </BriefChip>
      <BriefChip icon={User} label="Experience" value={EXPERIENCE[p.experience].name} state={s.expGuessed ? 'guess' : 'set'}>
        {(close) => (
          <>
            <div className="pop-label">How much Scout explains</div>
            {(Object.keys(EXPERIENCE) as Experience[]).map((id) => <Row key={id} on={p.experience === id} title={EXPERIENCE[id].name} hint={EXPERIENCE[id].hint} onClick={() => { act({ t: 'profile', patch: { experience: id } }); close(); }} />)}
          </>
        )}
      </BriefChip>
      <button className={`plan-pill${plan.length ? ' has' : ''}`} onClick={() => set({ planOpen: true })} id="plan-pill">
        <ClipboardList size={15} />
        Plan
        {plan.length > 0 && <motion.b key={s.planBump} initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>{plan.length}</motion.b>}
      </button>
    </div>
  );
}

/* ───────────── Shell ───────────── */

function Canvas() {
  const { s } = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const view =
    s.stage === 'start' ? 'start' :
    s.stage === 'setup' || s.stage === 'category' || s.stage === 'pick' ? 'brief' :
    s.stage === 'opportunities' ? 'products' :
    s.stage === 'decision' || s.stage === 'done' ? 'decision' :
    s.stage === 'check' ? 'check' :
    s.stage === 'order' || s.stage === 'ordered' ? 'order' : 'suppliers';
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [view]);

  return (
    <section className="canvas" aria-label="Workspace">
      {s.stage !== 'start' && <Journey />}
      <div className="canvas-scroll" ref={scroller}>
        {/* The new view fades in on its own. The old one is dropped at once so it never redraws mid-exit. */}
        <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
          {view === 'start' && <StartView />}
          {view === 'brief' && <BriefView />}
          {view === 'products' && <OpportunitiesView />}
          {view === 'suppliers' && <SuppliersView />}
          {view === 'decision' && <DecisionView />}
          {view === 'check' && <CheckView />}
          {view === 'order' && <OrderView />}
        </motion.div>
      </div>
      <CompareTray />
      <AnimatePresence>
        {s.drawer?.kind === 'product' && <ProductDrawer key={`p-${s.drawer.id}`} />}
        {s.drawer?.kind === 'supplier' && <SupplierDrawer key={`s-${s.drawer.id}`} />}
        {s.compareOpen && <ComparePanel key="cmp" />}
        {s.supCompareOpen && <SupComparePanel key="scmp" />}
        {s.marketsOpen && <MarketsPanel key="mkts" />}
        {s.messagesOpen && <MessagesPanel key="msgs" />}
      </AnimatePresence>
    </section>
  );
}

function Shell() {
  const { s, set } = useStore();
  // On narrow screens the conversation is tucked away, so the button says what Scout is doing.
  const lastMsg = s.thread[s.thread.length - 1];
  const working = s.busy && lastMsg?.pending
    ? lastMsg.steps?.find((st) => !st.done)?.label ?? 'Scout is working'
    : s.auto ? (s.sheet ? 'Waiting for your approval' : 'Scout is running your search') : null;
  // On the Start screen the box is the one place to type. The conversation joins once the seller has said something.
  const solo = s.stage === 'start' && !s.thread.some((m) => m.from === 'user');
  return (
    <div className="app">
      <Header />
      <ContextBar />
      <div className={`main${solo ? ' solo' : ''}`}>
        <Canvas />
        <ScoutPanel />
      </div>
      {!s.panelOpen && !solo && (
        <button className={`scout-fab${working ? ' busy' : ''}`} onClick={() => set({ panelOpen: true })} aria-label="Open Scout">
          <SparkMark size={15} /><span>{working ?? 'Scout'}</span>
        </button>
      )}
      <AnimatePresence>
        {s.sheet === 'inquiry' && <InquirySheet key="inq" />}
        {s.sheet === 'samples' && <SamplesSheet key="smp" />}
        {s.sheet === 'order' && <OrderSheet key="ord" />}
        {s.planOpen && <PlanDrawer key="plan" />}
      </AnimatePresence>
    </div>
  );
}

export default function App({ transport }: { transport?: Transport }) {
  return <StoreProvider transport={transport}><Shell /></StoreProvider>;
}
