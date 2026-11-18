'use client';

import { useEffect, useRef, useState } from 'react';
import { money, money0 } from '@/lib/format';
import type { Channel, Evidence, Stack, SupTier, Supplier, Tier } from '@/lib/types';

/* ───────────── Marks ───────────── */

export function SparkMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 1.5C12.9 7.4 16.6 11.1 22.5 12 16.6 12.9 12.9 16.6 12 22.5 11.1 16.6 7.4 12.9 1.5 12 7.4 11.1 11.1 7.4 12 1.5Z" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="5.6" fill="none" stroke="#fff" strokeWidth="2.4" /><circle cx="14.2" cy="3.8" r="2" fill="#fff" /></svg>
      </span>
      Orvane
    </span>
  );
}

export function Monogram({ s, size = 40 }: { s: Supplier; size?: number }) {
  const caps = s.short.split(' ').filter((w) => /^[A-Z]/.test(w));
  // One-word names get two letters, so every badge has the same weight.
  const letters = caps.length > 1 ? caps.slice(0, 2).map((w) => w[0]).join('') : s.short.slice(0, 2);
  return <span className="mono" style={{ width: `${size / 16}rem`, height: `${size / 16}rem`, background: s.tint, fontSize: `${(size * 0.36) / 16}rem` }} aria-hidden="true">{letters}</span>;
}

/* ───────────── Rich text: **bold**, paragraphs and short lists ───────────── */

const inline = (t: string) => t.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

export function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const out: React.ReactNode[] = [];
        let items: { ordered: boolean; rows: string[] } | null = null;
        const flush = () => {
          if (!items) return;
          const L = items.ordered ? 'ol' : 'ul';
          out.push(<L key={`l${out.length}`}>{items.rows.map((r, i) => <li key={i}>{inline(r)}</li>)}</L>);
          items = null;
        };
        let para: string[] = [];
        const flushPara = () => {
          if (!para.length) return;
          out.push(<p key={`p${out.length}`}>{para.map((l, i) => <span key={i}>{inline(l)}{i < para.length - 1 ? <br /> : null}</span>)}</p>);
          para = [];
        };
        for (const line of lines) {
          const m = line.match(/^\s*(?:[-•]|(\d+)[.)])\s+(.*)$/);
          if (m) {
            flushPara();
            const ordered = Boolean(m[1]);
            if (items && items.ordered !== ordered) flush();
            if (!items) items = { ordered, rows: [] };
            items.rows.push(m[2]);
          } else { flush(); para.push(line); }
        }
        flushPara();
        flush();
        return <div className="rich-block" key={bi}>{out}</div>;
      })}
    </>
  );
}

/* ───────────── Verdicts and evidence ───────────── */

export function VerdictTag({ tier, label }: { tier: Tier | SupTier; label: string }) {
  const tone = tier === 'worth' || tier === 'shortlist' ? 'good' : tier === 'skip' || tier === 'avoid' ? 'bad' : tier === 'out' ? 'out' : 'care';
  return <span className={`tag tag-${tone}`}><i />{label}</span>;
}

const EV_LABEL: Record<Evidence, string> = { verified: 'Verified', estimate: 'Estimate', unknown: 'Unknown' };
const EV_HELP: Record<Evidence, string> = {
  verified: 'Verified: Orvane has checked it',
  estimate: 'Estimate: Scout calculated it from market data',
  unknown: 'Unknown: nobody can know this yet',
};

export function Ev({ ev, label = false }: { ev: Evidence; label?: boolean }) {
  return <span className={`ev ev-${ev}`} title={EV_HELP[ev]}><i />{label ? EV_LABEL[ev] : <span className="sr">{EV_LABEL[ev]}</span>}</span>;
}

export function EvLegend() {
  return (
    <div className="ev-legend" aria-label="What the dots mean">
      <Ev ev="verified" label /><Ev ev="estimate" label /><Ev ev="unknown" label />
    </div>
  );
}

/* ───────────── Numbers that move when they change ───────────── */

export function Num({ value, kind = 'money' }: { value: number; kind?: 'money' | 'money0' | 'int' }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 520);
      const eased = 1 - (1 - k) ** 3;
      setShown(start + (value - start) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  const text = kind === 'money' ? money(shown) : kind === 'money0' ? money0(shown) : String(Math.round(shown));
  return <span className={shown < 0 ? 'neg' : undefined}>{text}</span>;
}

/* ───────────── Demand sparkline ───────────── */

export function Spark({ values, trend, w = 72, h = 26 }: { values: number[]; trend: number; w?: number; h?: number }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 6), h - 3 - ((v - min) / span) * (h - 7)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [ex, ey] = pts[pts.length - 1];
  const tone = trend > 2 ? 'up' : trend < 0 ? 'down' : 'flat';
  return (
    <svg className={`spark spark-${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="2.5" />
    </svg>
  );
}

export function DemandChart({ values, labels, trend }: { values: number[]; labels: string[]; trend: number }) {
  const w = 440, h = 132, padL = 6, padB = 22, padT = 8;
  const max = Math.max(...values) * 1.12;
  const x = (i: number) => padL + (i / (values.length - 1)) * (w - padL * 2);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  return (
    <svg className={`demand-chart tone-${trend > 2 ? 'up' : trend < 0 ? 'down' : 'flat'}`} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Demand over the last 12 months">
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={padL} x2={w - padL} y1={padT + g * (h - padT - padB)} y2={padT + g * (h - padT - padB)} className="grid" />)}
      <path d={`${line}L${x(values.length - 1)} ${h - padB}L${x(0)} ${h - padB}Z`} className="area" />
      <path d={line} className="line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3.5" className="dot" />
      {labels.map((l, i) => (i % 2 === 1 ? <text key={l} x={x(i)} y={h - 6} textAnchor={i === labels.length - 1 ? 'end' : 'middle'}>{l}</text> : null))}
    </svg>
  );
}

/* ───────────── The cost stack: where one sale goes ───────────── */

export interface StackLine { key: string; label: string; value: number; ev: Evidence; note?: string }

export function stackLines(s: Stack, channel: Channel): StackLine[] {
  return [
    ...(s.tax ? [{ key: 'tax', label: 'Sales tax in the price', value: s.tax, ev: 'verified' as Evidence }] : []),
    { key: 'cost', label: 'Unit cost', value: s.cost, ev: 'verified', note: 'Supplier listing' },
    { key: 'ship', label: 'Shipping per unit', value: s.ship, ev: 'estimate' },
    { key: 'duty', label: 'Import duty', value: s.duty, ev: 'estimate' },
    { key: 'fees', label: channel === 'marketplace' ? 'Marketplace fee' : 'Card fees', value: s.fees, ev: 'verified', note: 'Published rate' },
    { key: 'ad', label: 'Ads per sale', value: s.ad, ev: 'estimate', note: 'Biggest guess' },
    { key: 'returns', label: 'Returns', value: s.returns, ev: 'estimate' },
  ];
}

export function CostBar({ stack, channel, tall = false }: { stack: Stack; channel: Channel; tall?: boolean }) {
  const lines = stackLines(stack, channel);
  const costs = lines.reduce((a, l) => a + l.value, 0);
  const total = Math.max(stack.price, costs);
  const loss = stack.profit < 0;
  return (
    <div className={`costbar${tall ? ' tall' : ''}${loss ? ' loss' : ''}`} role="img" aria-label={`Of a ${money(stack.price)} sale, ${money(Math.max(0, stack.profit))} is profit`}>
      {lines.map((l) => <span key={l.key} className={`seg seg-${l.key}`} style={{ width: `${(l.value / total) * 100}%` }} title={`${l.label}: ${money(l.value)}`} />)}
      {!loss && <span className="seg seg-profit" style={{ width: `${(stack.profit / total) * 100}%` }} title={`Profit: ${money(stack.profit)}`} />}
      {loss && <span className="price-mark" style={{ left: `${(stack.price / total) * 100}%` }}><b>Price {money(stack.price)}</b></span>}
    </div>
  );
}
