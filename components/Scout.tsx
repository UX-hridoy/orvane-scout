'use client';

import { ArrowDown, ArrowRight, ArrowUp, Check, CornerDownLeft, Globe, Minus, Play, Plus, Square, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Chip, Msg } from '@/lib/acts';
import { CHANNELS, CHANNEL_ORDER, MARKETS, MARKET_ORDER, NO_DATA_MARKETS } from '@/lib/data';
import { capFor, shareOf } from '@/lib/engine';
import { money0, ordinal } from '@/lib/format';
import type { Diff, Move } from '@/lib/types';
import { useStore } from './store';
import { Rich, SparkMark } from './ui';

function Steps({ steps, pending }: { steps: NonNullable<Msg['steps']>; pending: boolean }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  // Once the work is done, the working folds away. The result is what matters.
  if (!pending && !open) {
    return (
      <button className="steps-fold" onClick={() => setOpen(true)} aria-expanded="false">
        <span className="tick"><Check size={10} strokeWidth={3} /></span>Show my working<em>{steps.length} {steps.length === 1 ? 'step' : 'steps'}</em>
      </button>
    );
  }
  return (
    <ul className={`steps${pending ? '' : ' settled'}`} onClick={() => !pending && setOpen(false)}>
      {steps.map((st, i) => (
        <li key={i} className={st.done ? 'done' : 'doing'}>
          <span className="tick">{st.done ? <Check size={11} strokeWidth={3} /> : null}</span>
          {st.label}
        </li>
      ))}
    </ul>
  );
}

function MarketWidget() {
  const { tap } = useStore();
  return (
    <div className="widget">
      <div className="pick-row">
        {MARKET_ORDER.map((id) => (
          <button key={id} className="pick" onClick={() => tap({ label: MARKETS[id].name, act: { t: 'market', id } })}>
            <span className="code">{id}</span>{MARKETS[id].name}
          </button>
        ))}
        {NO_DATA_MARKETS.map((m) => (
          <button key={m.id} className="pick" onClick={() => tap({ label: m.name, act: { t: 'market', id: m.id } })}>
            <span className="code">{m.id}</span>{m.name}
          </button>
        ))}
        <button className="pick" onClick={() => tap({ label: 'Compare all regions', act: { t: 'compareMarkets' } })}>
          <span className="code"><Globe size={12} /></span>All regions
        </button>
      </div>
    </div>
  );
}

export function BudgetControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { s } = useStore();
  return (
    <>
      <div className="budget-read">
        <strong>{money0(value)}</strong>
        <span>First order limit {money0(capFor(value, shareOf(s.profile)))}</span>
      </div>
      <input
        className="range" type="range" min={500} max={8000} step={100} value={value}
        style={{ '--fill': `${((value - 500) / 7500) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} aria-label="Budget in US dollars"
      />
      <div className="presets" role="group" aria-label="Common budgets">
        {[1500, 2500, 4000, 6000].map((n) => (
          <button key={n} className={n === value ? 'on' : ''} onClick={() => onChange(n)}>{money0(n)}</button>
        ))}
      </div>
    </>
  );
}

function BudgetWidget() {
  const { s, tap } = useStore();
  const [value, setValue] = useState(s.profile.budget);
  return (
    <div className="widget">
      <BudgetControl value={value} onChange={setValue} />
      <button className="btn btn-dark btn-block" onClick={() => tap({ label: money0(value), act: { t: 'budget', value } })}>Set budget to {money0(value)}</button>
    </div>
  );
}

function ChannelWidget() {
  const { tap } = useStore();
  return (
    <div className="widget">
      <div className="option-list">
        {CHANNEL_ORDER.map((id) => (
          <button key={id} className="option" onClick={() => tap({ label: CHANNELS[id].name, act: { t: 'channel', id } })}>
            <b>{CHANNELS[id].name}</b><span>{CHANNELS[id].hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MoveRow({ m }: { m: Move }) {
  const icon = m.dir === 'up' ? <ArrowUp size={13} strokeWidth={2.5} /> : m.dir === 'down' ? <ArrowDown size={13} strokeWidth={2.5} /> : m.dir === 'in' ? <Plus size={13} strokeWidth={2.5} /> : <Minus size={13} strokeWidth={2.5} />;
  const where = m.dir === 'in' ? `now ${ordinal(m.to!)}` : m.dir === 'out' ? 'over budget' : m.dir === 'verdict' ? 'new verdict' : `${ordinal(m.from!)} to ${ordinal(m.to!)}`;
  return (
    <li className={`move move-${m.dir}`}>
      <span className="move-icon">{icon}</span>
      <div><b>{m.name}</b><em>{where}</em><p>{m.why[0].toUpperCase() + m.why.slice(1)}.</p></div>
    </li>
  );
}

function ChangedCard({ diff, extra, onUndo }: { diff: Diff; extra?: string[]; onUndo?: () => void }) {
  return (
    <div className="changed">
      <h4>{diff.headline}</h4>
      {diff.moves.length > 0 && <ul className="moves">{diff.moves.map((m) => <MoveRow key={m.id} m={m} />)}</ul>}
      {(extra?.length || diff.notes.length) ? (
        <ul className="notes">{[...(extra ?? []), ...diff.notes].map((n, i) => <li key={i}>{n}</li>)}</ul>
      ) : null}
      {onUndo && <button className="btn btn-ghost btn-sm" onClick={onUndo}><Undo2 size={14} />Undo</button>}
    </div>
  );
}

function Message({ m, last, first }: { m: Msg; last: boolean; first: boolean }) {
  const { s, tap } = useStore();
  if (m.from === 'user') return <div className="msg msg-user"><span>{m.text}</span></div>;
  const waiting = m.pending && !m.text && !(m.steps?.length);
  const w = m.widget;
  const undo = (label: string, profile: typeof s.profile) => () => tap({ label, act: { t: 'undo', profile } });
  return (
    <div className={`msg msg-scout${first ? ' first' : ''}`}>
      {first && <span className="avatar"><SparkMark size={13} /></span>}
      <div className="body">
        {m.steps && <Steps steps={m.steps} pending={Boolean(m.pending)} />}
        {waiting && <span className="typing" aria-label="Scout is thinking"><i /><i /><i /></span>}
        {m.text ? <div className="rich"><Rich text={m.text} /></div> : null}
        {w?.kind === 'changed' && <ChangedCard diff={w.diff} extra={w.extra} onUndo={last ? undo('Undo', w.undo) : undefined} />}
        {w?.kind === 'applied' && (
          <div className="applied"><Check size={13} strokeWidth={2.5} />{w.label}{last && !m.pending ? <button onClick={undo('Undo', w.undo)}>Undo</button> : null}</div>
        )}
        {last && s.stage === 'setup' && w?.kind === 'market' && <MarketWidget />}
        {last && s.stage === 'setup' && w?.kind === 'budget' && <BudgetWidget />}
        {last && s.stage === 'setup' && w?.kind === 'channel' && <ChannelWidget />}
        {last && !m.pending && m.chips?.length ? (
          <div className="chips">
            {m.chips.map((c: Chip) => (
              <button key={c.label} className={`chip${c.rec ? ' rec' : ''}`} onClick={() => tap(c)}>
                {c.rec && <SparkMark size={11} />}{c.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ScoutPanel() {
  const { s, ask, set, act, tap, next } = useStore();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const lastMsg = s.thread[s.thread.length - 1];

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [s.thread.length, lastMsg?.text, lastMsg?.pending, lastMsg?.steps?.length, s.auto]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    ask(draft);
    setDraft('');
  };

  // When the talk has wandered off the path, keep the way back one tap away.
  const offered = lastMsg?.from === 'scout' && lastMsg.chips?.some((c) => c.act.t === next?.act.t);
  const showNext = Boolean(next) && !s.auto && !s.busy && !lastMsg?.pending && !offered && !s.sheet && s.thread.length > 1;
  // Scout can run every step except the sample check, which needs the seller's hands, and there is nothing left once the order is placed.
  const canRun = !s.auto && s.stage !== 'check' && !s.ordered;

  return (
    <aside className={`scout${s.panelOpen ? ' open' : ''}`} aria-label="Scout, your sourcing agent">
      <header className="scout-head">
        <span className="scout-mark"><SparkMark size={15} /></span>
        <div><b>Scout</b><span>{s.auto ? 'Running your search' : 'Sourcing agent'}</span></div>
        {canRun && (
          <button className="run-btn" onClick={() => tap({ label: s.stage === 'start' ? 'Run the search for me' : 'Run the rest for me', act: { t: 'auto' } })} disabled={s.busy} title="Scout carries the search forward and stops before anything is sent or paid">
            <Play size={12} strokeWidth={2.6} />{s.stage === 'start' ? 'Run it for me' : 'Run the rest'}
          </button>
        )}
        <button className="icon-btn only-narrow" onClick={() => set({ panelOpen: false })} aria-label="Close Scout"><X size={18} /></button>
      </header>
      {s.auto && (
        <div className="auto-bar" role="status">
          <span className="auto-pulse"><i /></span>
          <p><b>{s.sheet ? 'Waiting for your approval' : 'Scout is working through your search'}</b><span>It stops before anything is sent or paid.</span></p>
          <button onClick={() => act({ t: 'stopAuto' })}><Square size={10} strokeWidth={3} fill="currentColor" />Stop</button>
        </div>
      )}
      <div className="thread" ref={scroller} aria-live="polite">
        {s.thread.map((m, i) => (
          <Message key={m.id} m={m} last={i === s.thread.length - 1} first={m.from === 'scout' && s.thread[i - 1]?.from !== 'scout'} />
        ))}
      </div>
      {showNext && next && (
        <button className="next-strip" onClick={() => tap(next)}>
          <span>Next step</span><b>{next.label}</b><ArrowRight size={15} />
        </button>
      )}
      <form className="composer" onSubmit={submit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={s.auto ? 'Ask anything, or say stop' : 'Ask Scout, or tell it what to do'} aria-label="Ask Scout anything" maxLength={600} />
        <button type="submit" aria-label="Send" disabled={!draft.trim()}><CornerDownLeft size={16} strokeWidth={2.2} /></button>
      </form>
    </aside>
  );
}
