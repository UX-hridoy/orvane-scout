'use client';

import { Check, ClipboardList, Factory, MessagesSquare, Package, PackageCheck, Truck } from 'lucide-react';
import type { Stage } from '@/lib/acts';
import { MARKETS } from '@/lib/data';
import { money0 } from '@/lib/format';
import { SAMPLE_DAYS, dateOf, orderTimeline } from '@/lib/samples';
import { useStore } from './store';

/**
 * Where the search stands, in the seller's own terms. Each step shows what
 * has been decided so far, not just its name, and what Scout is doing now.
 */
export function Journey() {
  const { s, run, supRun, quotes, picks, stageIndex, act } = useStore();
  const p = s.profile;
  const a = s.answered;
  const answered = [a.market, a.budget, a.channel].filter(Boolean).length;
  const working = s.busy && Boolean(s.thread[s.thread.length - 1]?.pending);
  const chosen = s.productId ? run.results.find((r) => r.product.id === s.productId) : null;
  const total = picks.reduce((n, q) => n + q.sampleCost, 0);
  const cur = stageIndex;
  const arrived = s.sampleDay !== null && s.day >= s.sampleDay + SAMPLE_DAYS.arrive;
  const orderQ = s.orderId ? quotes.find((q) => q.supplier.id === s.orderId) : null;
  const arrives = orderQ ? orderTimeline(s.day, orderQ.supplier.lead).at(-1)!.day : null;

  const steps: { n: number; icon: typeof Check; label: string; sub: string; to: Stage; can: boolean }[] = [
    {
      n: 1, icon: ClipboardList, label: 'Brief', to: 'setup', can: answered === 3,
      sub: answered === 3 ? `${MARKETS[p.market].short} · ${money0(p.budget)}` : answered ? `${answered} of 3 answered` : '3 quick answers',
    },
    {
      n: 2, icon: Package, label: 'Product', to: 'opportunities', can: answered === 3 && (s.entry !== 'suppliers' || stageIndex >= 2),
      sub: chosen ? chosen.product.short
        : cur === 2 ? (working ? `Scanning ${run.results.length} products` : run.fits.length ? `${run.fits.length} fit your budget` : 'Nothing fits yet')
        : 'Ranked by profit',
    },
    {
      n: 3, icon: Factory, label: 'Suppliers', to: 'suppliers', can: Boolean(s.productId),
      sub: !supRun || cur < 3 ? 'Vetted by Scout'
        : cur === 3 && working ? `Reading ${supRun.product.listings} listings`
        : supRun.shortlist.length ? `${supRun.shortlist.length} shortlisted` : 'None passed',
    },
    {
      n: 4, icon: MessagesSquare, label: 'Quotes', to: 'suppliers', can: s.contacted.length > 0,
      sub: s.quotesReady ? `${quotes.length} ${quotes.length === 1 ? 'quote' : 'quotes'} in`
        : s.contacted.length ? (working ? 'Replies coming in' : `Sent to ${s.contacted.length}, waiting`)
        : 'You approve first',
    },
    {
      n: 5, icon: PackageCheck, label: 'Samples', to: 'decision', can: s.quotesReady,
      sub: s.orderId ? 'Checked'
        : s.stage === 'check' || arrived ? 'Ready to check'
        : s.samplesRequested && s.sampleDay !== null ? `Arriving ${dateOf(s.sampleDay + SAMPLE_DAYS.from)}`
        : cur >= 5 && picks.length ? `${money0(total)} to approve` : 'You check them',
    },
    {
      n: 6, icon: Truck, label: 'Order', to: 'order', can: Boolean(s.orderId),
      sub: s.ordered && arrives !== null ? `Arrives ${dateOf(arrives)}` : s.orderId ? 'Ready to approve' : 'After samples',
    },
  ];

  return (
    <nav className={`journey${s.auto ? ' is-auto' : ''}`} aria-label="Your search, step by step">
      <ol>
        {steps.map((st, i) => {
          const state = st.n < cur ? 'done' : st.n === cur ? 'now' : 'next';
          const clickable = st.n !== cur && st.can && !s.busy;
          const Icon = st.icon;
          return (
            <li key={st.label} className={`jn jn-${state}${state === 'now' && working ? ' jn-busy' : ''}`}>
              <button disabled={!clickable} onClick={() => act({ t: 'goto', stage: st.to })} aria-current={state === 'now' ? 'step' : undefined} title={clickable ? `Go to ${st.label.toLowerCase()}` : undefined}>
                <span className="jn-dot">{state === 'done' ? <Check size={15} strokeWidth={3} /> : <Icon size={16} />}</span>
                <span className="jn-text"><b>{st.label}</b><em>{st.sub}</em></span>
              </button>
              {i < steps.length - 1 && <span className="jn-line" aria-hidden="true"><i /></span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
