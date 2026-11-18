'use client';

import { BadgeCheck, Check, ChevronDown, CircleAlert, MessagesSquare, ClipboardList, FileCheck2, FileText, Landmark, Lock, Megaphone, Minus, PackageX, Receipt, Send, ThumbsDown, ThumbsUp, TriangleAlert, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CHANNELS, MARKETS, MARKET_ORDER, ORIGIN_NAME, PRIORITIES, SELLER } from '@/lib/data';
import { MONTH_LABELS, compareMarkets, demandNote, demandSeries, explain, supplierFacts } from '@/lib/engine';
import { list, money, money0, monthLabel, pct, trendText } from '@/lib/format';
import { auditNote, promotedNote } from '@/lib/promotion';
import { supplierReply } from '@/lib/narrate';
import { rulesLine } from '@/lib/knowledge';
import { checkPoints, dateOf, leftForLaunch, orderTimeline } from '@/lib/samples';
import type { MarketId, ProductResult, SupplierResult } from '@/lib/types';
import { ProductArt } from './ProductArt';
import { useStore } from './store';
import { CostBar, DemandChart, Ev, Monogram, SparkMark, VerdictTag, stackLines } from './ui';

const cap1 = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const slide = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 40, opacity: 0 }, transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const } };
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.16 } };

function useEscape(close: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [close]);
}

/* ───────────── Compare tray ───────────── */

export function CompareTray() {
  const { s, set, act } = useStore();
  if (s.stage !== 'opportunities' || !s.compare.length || s.compareOpen || s.drawer || s.busy) return null;
  return (
    <motion.div className="tray" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
      <div className="tray-arts">{s.compare.map((id) => <ProductArt key={id} id={id} />)}</div>
      <span>{s.compare.length < 2 ? 'Tick one more to compare' : `${s.compare.length} selected`}</span>
      <button className="btn btn-dark btn-sm" disabled={s.compare.length < 2} onClick={() => act({ t: 'compare', ids: s.compare })}>Compare</button>
      <button className="icon-btn ghost" onClick={() => set({ compare: [] })} aria-label="Clear selection"><X size={16} /></button>
    </motion.div>
  );
}

/* ───────────── Product detail: verdict, reasons, evidence, source data ───────────── */

export function ProductDrawer() {
  const { s, run, set, act, toggleCompare } = useStore();
  const drawer = s.drawer?.kind === 'product' ? s.drawer : null;
  const [maths, setMaths] = useState(Boolean(drawer?.maths));
  const [raw, setRaw] = useState(false);
  useEffect(() => { if (drawer?.maths) setMaths(true); }, [drawer?.maths, drawer?.id]);
  const close = () => set({ drawer: null });
  useEscape(close);
  const r = run.results.find((x) => x.product.id === drawer?.id);
  if (!r) return null;
  const p = r.product;
  const e = explain(r, run);
  const lines = stackLines(r.stack, s.profile.channel);
  const m = MARKETS[s.profile.market];
  const chosen = s.productId === p.id;
  const canChoose = s.stage === 'opportunities';

  return (
    <>
      <motion.div className="scrim" {...fade} onClick={close} />
      <motion.aside className="drawer" {...slide} role="dialog" aria-label={p.name}>
        <header className="drawer-head">
          <div className="drawer-art"><ProductArt id={p.id} /></div>
          <div>
            <VerdictTag tier={r.verdict.tier} label={r.verdict.label} />
            <h2>{p.name}</h2>
            <p>{p.blurb}</p>
          </div>
          <button className="icon-btn ghost" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="drawer-body">
          <div className="drawer-hero">
            <div><strong className={r.stack.profit < 0 ? 'neg' : ''}>{money(r.stack.profit)}</strong><span>profit per sale<Ev ev="estimate" /></span></div>
            <div><strong>{money0(r.stack.firstOrder)}</strong><span>first order, {r.stack.moq} units<Ev ev="estimate" /></span></div>
            <div><strong>{trendText(r.demand.trend)}</strong><span>demand, {demandNote(r)}<Ev ev="estimate" /></span></div>
          </div>

          <section>
            <h3>Why Scout says “{r.verdict.label.toLowerCase()}”</h3>
            <ul className="points">
              {e.points.map((pt, i) => (
                <li key={i} className={pt.good ? 'good' : 'bad'}>
                  <span className="pt-icon">{pt.good ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}</span>
                  <p>{pt.text}</p>
                  <Ev ev={pt.ev} label />
                </li>
              ))}
            </ul>
            <div className="risk"><TriangleAlert size={16} /><div><b>Main risk</b><p>{e.risk.text}</p></div><Ev ev={e.risk.ev} label /></div>
            <div className="rules"><FileCheck2 size={16} /><div><b>To sell it in {MARKETS[s.profile.market].the}</b><p>{rulesLine(p, s.profile.market)}</p></div></div>
          </section>

          <button className="disclose" onClick={() => setMaths(!maths)} aria-expanded={maths}>
            <span>See the maths</span><ChevronDown size={16} className={maths ? 'flip' : ''} />
          </button>
          {maths && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <section>
                <h3>Where your {money(r.stack.price)} goes</h3>
                <CostBar stack={r.stack} channel={s.profile.channel} tall />
                <table className="lines">
                  <tbody>
                    <tr className="total"><td>Shelf price in {m.the}</td><td className="num">{money(r.stack.price)}</td><td><Ev ev="estimate" label /></td></tr>
                    {lines.map((l) => (
                      <tr key={l.key}>
                        <td><i className={`sw seg-${l.key}`} />{l.label}{l.note ? <em>{l.note}</em> : null}</td>
                        <td className="num">−{money(l.value)}</td>
                        <td><Ev ev={l.ev} label /></td>
                      </tr>
                    ))}
                    <tr className={`total keep${r.stack.profit < 0 ? ' neg' : ''}`}><td><i className="sw seg-profit" />{r.stack.profit < 0 ? 'Lost on each sale' : 'Left for you'}</td><td className="num">{money(r.stack.profit)}</td><td><Ev ev="estimate" label /></td></tr>
                  </tbody>
                </table>
              </section>
              <section>
                <h3>Demand in {m.the}, last 12 months</h3>
                <DemandChart values={demandSeries(p, s.profile.market)} labels={MONTH_LABELS} trend={r.demand.trend} />
                <p className="small">{trendText(r.demand.trend)} over the year, {demandNote(r)}. Competition is {r.crowd >= 80 ? 'very heavy' : r.crowd >= 60 ? 'heavy' : r.crowd >= 45 ? 'moderate' : 'light'}: {p.listings} suppliers list it on Orvane.</p>
              </section>
              <section>
                <h3>Scout's read</h3>
                <ul className="insights">{e.insights.map((t, i) => <li key={i}><SparkMark size={11} />{t}</li>)}</ul>
              </section>
              <button className="disclose quiet" onClick={() => setRaw(!raw)} aria-expanded={raw}><span>Open data</span><ChevronDown size={16} className={raw ? 'flip' : ''} /></button>
              {raw && (
                <table className="raw">
                  <tbody>
                    <tr><td>Typical unit cost</td><td>{money(p.cost)}</td></tr>
                    <tr><td>Typical minimum order</td><td>{p.moq} units</td></tr>
                    <tr><td>Shipping per unit, before market uplift</td><td>{money(p.ship)}</td></tr>
                    <tr><td>Return rate</td><td>{pct(p.returns)}</td></tr>
                    <tr><td>Shelf price: US, Germany, UK</td><td>{money(p.price.US)}, {money(p.price.DE)}, {money(p.price.UK)}</td></tr>
                    <tr><td>Demand index, 0 to 100</td><td>{r.demand.level}</td></tr>
                    <tr><td>Crowdedness, 0 to 100</td><td>{r.crowd}</td></tr>
                    <tr><td>Supplier listings</td><td>{p.listings}</td></tr>
                    <tr><td>Scout score for your brief</td><td>{r.score.toFixed(1)} of 100</td></tr>
                  </tbody>
                </table>
              )}
            </motion.div>
          )}
        </div>

        <footer className="drawer-foot">
          {canChoose ? (
            <>
              <button className="btn btn-ghost" onClick={() => toggleCompare(p.id)} disabled={!s.compare.includes(p.id) && s.compare.length >= 3}>
                {s.compare.includes(p.id) ? <><Check size={15} />In compare</> : 'Add to compare'}
              </button>
              <button className={`btn ${r.verdict.tier === 'worth' || r.verdict.tier === 'care' ? 'btn-primary' : 'btn-dark'}`} onClick={() => act({ t: 'choose', id: p.id })}>
                Choose and find suppliers
              </button>
            </>
          ) : (
            <span className="foot-hint">{chosen ? 'This is the product in your plan.' : 'Go back to Products to choose a different one.'}</span>
          )}
        </footer>
      </motion.aside>
    </>
  );
}

/* ───────────── Supplier detail ───────────── */

export function SupplierDrawer() {
  const { s, supRun, set, act, quotes } = useStore();
  const close = () => set({ drawer: null });
  useEscape(close);
  const id = s.drawer?.kind === 'supplier' ? s.drawer.id : null;
  const r = supRun?.results.find((x) => x.supplier.id === id);
  if (!r || !supRun) return null;
  const sup = r.supplier;
  const facts = supplierFacts(r, supRun);
  const climb = auditNote(r, supRun);
  const q = quotes.find((x) => x.supplier.id === sup.id);

  return (
    <>
      <motion.div className="scrim" {...fade} onClick={close} />
      <motion.aside className="drawer" {...slide} role="dialog" aria-label={sup.name}>
        <header className="drawer-head">
          <Monogram s={sup} size={56} />
          <div>
            <VerdictTag tier={r.tier} label={r.label} />
            <h2>{sup.name}{sup.promoted && <span className="promo">Promoted</span>}</h2>
            <p>{sup.type === 'Unclear' ? 'Business type not stated' : sup.type}, {sup.city}, {ORIGIN_NAME[sup.origin]}. Ranked {r.rank} of {supRun.results.length}{r.reason ? `: ${r.reason}` : ''}.</p>
          </div>
          <button className="icon-btn ghost" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="drawer-body">
          <div className="drawer-hero">
            <div><strong>{money(q ? q.unit : r.unit)}</strong><span>{q ? 'quoted unit price' : 'listed unit price'}<Ev ev="verified" /></span></div>
            <div><strong>{money0((q ?? r).stack.firstOrder)}</strong><span>first order, {r.moq} units<Ev ev="estimate" /></span></div>
            <div><strong>{money((q ?? r).stack.profit)}</strong><span>profit per sale<Ev ev="estimate" /></span></div>
          </div>

          {r.flags.length > 0 && (
            <section>
              <h3>{r.tier === 'avoid' ? 'Why Scout says avoid' : 'Worth knowing'}</h3>
              <ul className={`flags${r.tier === 'avoid' ? ' red' : ''}`}>
                {r.flags.map((f) => <li key={f}><CircleAlert size={15} />{f}.</li>)}
              </ul>
            </section>
          )}
          {climb && (
            <section>
              <h3>How it could move up</h3>
              <p className="climb-note"><BadgeCheck size={16} /><span>{climb}</span></p>
            </section>
          )}

          <section>
            <h3>What is known</h3>
            <table className="facts">
              <tbody>
                {facts.map((f) => <tr key={f.label}><td>{f.label}</td><td>{f.value}</td><td><Ev ev={f.ev} label /></td></tr>)}
              </tbody>
            </table>
          </section>

          {sup.promoted && sup.showcase && (
            <section className="showcase">
              <h3>From the supplier<span className="promo">Promoted</span></h3>
              <p className="promo-note">{promotedNote(r, supRun)}</p>
              <ul>{sup.showcase.map((x) => <li key={x}>{x}</li>)}</ul>
              <p className="showcase-foot"><Ev ev="unknown" />Its own content. Scout hasn't checked it, so it isn't part of the ranking.</p>
            </section>
          )}

          {q && (
            <section>
              <h3>Its reply to your inquiry</h3>
              <div className="reply">
                <p>{supplierReply(q)}</p>
                <span>{q.note}</span>
              </div>
            </section>
          )}
        </div>
        <footer className="drawer-foot">
          {s.stage === 'suppliers' && r.tier === 'shortlist'
            ? <button className="btn btn-primary" onClick={() => act({ t: 'draftInquiry' })}>Ask the shortlist for a quote</button>
            : <span className="foot-hint">{r.tier === 'avoid' ? 'Scout will not contact this supplier.' : r.tier === 'out' ? 'Raise your budget to bring this supplier into range.' : r.tier === 'ask' ? 'Not on the shortlist. Ask Scout if you want it included.' : 'Scout is tracking this supplier in your plan.'}</span>}
        </footer>
      </motion.aside>
    </>
  );
}

/* ───────────── Side-by-side comparisons ───────────── */

interface CmpRow<T> { label: string; get: (x: T) => number | string; show: (x: T) => React.ReactNode; best?: 'max' | 'min' }

function CompareTable<T>({ items, rows, head, foot }: { items: T[]; rows: CmpRow<T>[]; head: (x: T) => React.ReactNode; foot?: (x: T) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  const same = rows.filter((row) => new Set(items.map((x) => String(row.get(x)))).size === 1);
  return (
    <>
      <table className="cmp-table" style={{ '--cols': items.length } as React.CSSProperties}>
        <thead><tr><th />{items.map((x, i) => <th key={i}>{head(x)}</th>)}</tr></thead>
        <tbody>
          {rows.filter((row) => all || !same.includes(row)).map((row) => {
            const vals = items.map((x) => row.get(x));
            const nums = vals.filter((v): v is number => typeof v === 'number');
            const target = row.best && nums.length === vals.length ? (row.best === 'max' ? Math.max(...nums) : Math.min(...nums)) : null;
            const unique = target !== null && nums.filter((v) => v === target).length === 1;
            return (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {items.map((x, i) => <td key={i} className={unique && vals[i] === target ? 'best' : ''}>{row.show(x)}</td>)}
              </tr>
            );
          })}
        </tbody>
        {foot && <tfoot><tr><td />{items.map((x, i) => <td key={i}>{foot(x)}</td>)}</tr></tfoot>}
      </table>
      {same.length > 0 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Hide matching rows' : `Show ${same.length} matching ${same.length === 1 ? 'row' : 'rows'}`}</button>}
    </>
  );
}

export function ComparePanel() {
  const { s, run, set, act } = useStore();
  const close = () => set({ compareOpen: false, compare: [] });
  useEscape(close);
  const items = s.compare.map((id) => run.results.find((r) => r.product.id === id)).filter((r): r is ProductResult => Boolean(r));
  const rows: CmpRow<ProductResult>[] = [
    { label: "Scout's verdict", get: (r) => r.verdict.label, show: (r) => <><VerdictTag tier={r.verdict.tier} label={r.verdict.label} /><em>{cap1(r.verdict.reason)}</em></> },
    { label: 'Profit per sale', get: (r) => r.stack.profit, show: (r) => <b className="num">{money(r.stack.profit)}</b>, best: 'max' },
    { label: 'Share of price you keep', get: (r) => Math.round(r.stack.margin * 100), show: (r) => <span className="num">{pct(r.stack.margin)}</span>, best: 'max' },
    { label: 'First order', get: (r) => r.stack.firstOrder, show: (r) => <span className="num">{money0(r.stack.firstOrder)}</span>, best: 'min' },
    { label: 'Minimum order', get: (r) => r.stack.moq, show: (r) => <span className="num">{r.stack.moq} units</span>, best: 'min' },
    { label: 'Money back after', get: (r) => r.stack.breakEvenUnits, show: (r) => <span className="num">{Number.isFinite(r.stack.breakEvenUnits) ? `${r.stack.breakEvenUnits} units` : 'Never'}</span>, best: 'min' },
    { label: 'Demand, 12 months', get: (r) => r.demand.trend, show: (r) => <span>{trendText(r.demand.trend)}<em>{cap1(demandNote(r))}</em></span>, best: 'max' },
    { label: 'Returns', get: (r) => Math.round(r.product.returns * 100), show: (r) => <span className="num">{pct(r.product.returns)}</span>, best: 'min' },
    { label: 'Crowdedness', get: (r) => r.crowd, show: (r) => <span className="num">{r.crowd} of 100</span>, best: 'min' },
    { label: 'Ads you can absorb', get: (r) => r.stack.breakEvenAd, show: (r) => <span className="num">up to {money(Math.max(0, r.stack.breakEvenAd))} per sale</span>, best: 'max' },
  ];
  return (
    <>
      <motion.div className="scrim" {...fade} onClick={close} />
      <motion.div className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.2 }} role="dialog" aria-label="Compare products">
        <header className="panel-head">
          <div><h2>Side by side</h2><p>The best value in each row is highlighted. Ranked for {list(s.profile.priorities.map((x) => PRIORITIES[x].name.toLowerCase())) || 'overall fit'}.</p></div>
          <button className="icon-btn ghost" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="panel-body">
          <CompareTable
            items={items} rows={rows}
            head={(r) => <div className="cmp-head"><ProductArt id={r.product.id} /><b>{r.product.short}</b><span>Ranked {r.rank ?? 'over budget'}</span></div>}
            foot={(r) => <button className={`btn btn-sm ${r === [...items].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0] ? 'btn-primary' : 'btn-ghost'}`} onClick={() => act({ t: 'choose', id: r.product.id })}>Choose</button>}
          />
        </div>
      </motion.div>
    </>
  );
}

export function SupComparePanel() {
  const { s, supRun, set } = useStore();
  const close = () => set({ supCompareOpen: false });
  useEscape(close);
  if (!supRun) return null;
  const items = supRun.results.filter((r) => r.tier === 'shortlist' || r.tier === 'ask').slice(0, 4);
  const m = MARKETS[s.profile.market];
  const rows: CmpRow<SupplierResult>[] = [
    { label: "Scout's verdict", get: (r) => r.label + r.reason, show: (r) => <><VerdictTag tier={r.tier} label={r.label} /><em>{cap1(r.reason)}</em></> },
    { label: 'Unit price', get: (r) => r.unit, show: (r) => <b className="num">{money(r.unit)}</b>, best: 'min' },
    { label: 'Minimum order', get: (r) => r.moq, show: (r) => <span className="num">{r.moq} units</span>, best: 'min' },
    { label: 'First order, landed', get: (r) => r.stack.firstOrder, show: (r) => <span className="num">{money0(r.stack.firstOrder)}</span>, best: 'min' },
    { label: 'Profit per sale', get: (r) => r.stack.profit, show: (r) => <span className="num">{money(r.stack.profit)}</span>, best: 'max' },
    { label: `${m.short} duty per unit`, get: (r) => r.stack.duty, show: (r) => <span className="num">{money(r.stack.duty)}</span>, best: 'min' },
    { label: 'Factory audit', get: (r) => r.supplier.audit ?? 'none', show: (r) => <span>{r.supplier.audit ? monthLabel(r.supplier.audit) : 'None on record'}</span> },
    { label: 'Orders on Orvane', get: (r) => r.supplier.orders, show: (r) => <span className="num">{r.supplier.orders}</span>, best: 'max' },
    { label: 'Delivered on time', get: (r) => Math.round((r.supplier.onTime ?? 0) * 100), show: (r) => <span className="num">{r.supplier.onTime ? pct(r.supplier.onTime) : 'Unknown'}</span>, best: 'max' },
    { label: 'Production time', get: (r) => r.supplier.lead, show: (r) => <span className="num">{r.supplier.lead} days</span>, best: 'min' },
    { label: 'Business licence', get: () => 'checked', show: () => <span>Checked by Orvane</span> },
  ];
  return (
    <>
      <motion.div className="scrim" {...fade} onClick={close} />
      <motion.div className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.2 }} role="dialog" aria-label="Compare suppliers">
        <header className="panel-head">
          <div><h2>Suppliers side by side</h2><p>For the {supRun.product.short}. The best value in each row is highlighted.</p></div>
          <button className="icon-btn ghost" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="panel-body">
          <CompareTable items={items} rows={rows} head={(r) => <div className="cmp-head"><Monogram s={r.supplier} size={44} /><b>{r.supplier.short}</b><span>{r.supplier.city}{r.supplier.promoted ? ', promoted' : ''}</span></div>} />
        </div>
      </motion.div>
    </>
  );
}

/* ───────────── Approval sheets: nothing leaves without a yes ───────────── */

function Sheet({ title, sub, onClose, children, foot }: { title: string; sub: string; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  useEscape(onClose);
  return (
    <div className="sheet-wrap">
      <motion.div className="scrim strong" {...fade} onClick={onClose} />
      <motion.div className="sheet" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} role="dialog" aria-modal="true" aria-label={title}>
        <header><span className="sheet-mark"><Lock size={15} /></span><div><h2>{title}</h2><p>{sub}</p></div></header>
        <div className="sheet-body">{children}</div>
        <footer>{foot}</footer>
      </motion.div>
    </div>
  );
}

export function InquirySheet() {
  const { s, supRun, set, sendInquiry, closeSheet: close } = useStore();
  const [editing, setEditing] = useState(false);
  if (!supRun) return null;
  const to = supRun.shortlist;
  return (
    <Sheet
      title={`Send this to ${to.length} ${to.length === 1 ? 'supplier' : 'suppliers'}?`}
      sub="Scout wrote the message. Nothing is sent until you say so."
      onClose={close}
      foot={<>
        <button className="btn btn-ghost" onClick={close}>Not now</button>
        <button className="btn btn-ghost" onClick={() => setEditing(!editing)}><FileText size={15} />{editing ? 'Done editing' : 'Edit message'}</button>
        <button className="btn btn-primary" onClick={sendInquiry}><Send size={15} />Send to {to.length} {to.length === 1 ? 'supplier' : 'suppliers'}</button>
      </>}
    >
      <div className="to">
        <span>To</span>
        {to.map((r) => <span key={r.supplier.id} className="to-chip"><Monogram s={r.supplier} size={22} />{r.supplier.short}</span>)}
      </div>
      {editing
        ? <textarea className="draft" value={s.inquiryDraft} onChange={(e) => set({ inquiryDraft: e.target.value })} rows={12} aria-label="Message to suppliers" />
        : <pre className="draft">{s.inquiryDraft}</pre>}
      <label className="toggle">
        <input type="checkbox" checked={s.followUp} onChange={(e) => set({ followUp: e.target.checked })} />
        <span><b>Follow up once after 24 hours of silence</b><em>Scout sends one polite reminder, then stops.</em></span>
      </label>
      <ul className="shared">
        <li><Check size={14} strokeWidth={2.5} /><span><b>Shared with suppliers:</b> your name ({SELLER.business}) and your Orvane inbox.</span></li>
        <li><Minus size={14} strokeWidth={2.5} /><span><b>Not shared:</b> your email, phone, budget or payment details.</span></li>
        <li><Minus size={14} strokeWidth={2.5} /><span>You can withdraw the message later, though suppliers may already have read it.</span></li>
      </ul>
    </Sheet>
  );
}

export function SamplesSheet() {
  const { picks, paySamples, s, closeSheet: close } = useStore();
  const total = picks.reduce((a, q) => a + q.sampleCost, 0);
  return (
    <Sheet
      title={`Pay ${money0(total)} for ${picks.length} ${picks.length === 1 ? 'sample' : 'samples'}?`}
      sub="This is the only payment in your plan. It goes through Orvane, with buyer protection."
      onClose={close}
      foot={<>
        <button className="btn btn-ghost" onClick={close}>Not now</button>
        <button className="btn btn-primary" onClick={paySamples}>Pay {money0(total)} and request samples</button>
      </>}
    >
      <table className="pay">
        <tbody>
          {picks.map((q) => (
            <tr key={q.supplier.id}>
              <td><div className="q-who"><Monogram s={q.supplier} size={32} /><div><b>{q.supplier.name}</b><span>{q.supplier.sample.price ? `Sample ${money0(q.supplier.sample.price)}, shipping ${money0(q.supplier.sample.ship)}` : `Free sample, shipping ${money0(q.supplier.sample.ship)}`}</span></div></div></td>
              <td className="num">{money0(q.sampleCost)}</td>
            </tr>
          ))}
          <tr className="total"><td>Total today</td><td className="num">{money0(total)}</td></tr>
        </tbody>
      </table>
      <ul className="shared">
        <li><Check size={14} strokeWidth={2.5} /><span>Samples ship to your saved address in {MARKETS[s.profile.market].name}. They usually arrive in 7 to 10 days.</span></li>
        <li><Check size={14} strokeWidth={2.5} /><span>You can cancel for a full refund until a supplier confirms.</span></li>
        <li><Minus size={14} strokeWidth={2.5} /><span>This does not place an order. You decide that after you have held the product.</span></li>
      </ul>
    </Sheet>
  );
}

/** The first order: the biggest payment in the journey, so it gets the same approval as the others. */
export function OrderSheet() {
  const { s, quotes, placeOrder, closeSheet: close } = useStore();
  const q = quotes.find((x) => x.supplier.id === s.orderId);
  if (!q) return null;
  const goods = Math.round(q.unit * q.moq);
  const left = leftForLaunch(s.profile, s.spent, q.stack.firstOrder);
  const steps = orderTimeline(s.day, q.supplier.lead);
  return (
    <Sheet
      title={`Place your first order for ${money0(q.stack.firstOrder)}?`}
      sub={`${q.moq} units from ${q.supplier.name}, through Orvane with buyer protection.`}
      onClose={close}
      foot={<>
        <button className="btn btn-ghost" onClick={close}>Not now</button>
        <button className="btn btn-primary" onClick={placeOrder}>Place the order for {money0(q.stack.firstOrder)}</button>
      </>}
    >
      <table className="pay">
        <tbody>
          <tr><td><div className="q-who"><Monogram s={q.supplier} size={32} /><div><b>{q.moq} units at {money(q.unit)}</b><span>{q.supplier.short}, made in {q.supplier.lead} days</span></div></div></td><td className="num">{money0(goods)}</td></tr>
          <tr><td>Shipping and {MARKETS[s.profile.market].short} duty</td><td className="num">{money0(q.stack.firstOrder - goods)}</td></tr>
          <tr className="total"><td>Total</td><td className="num">{money0(q.stack.firstOrder)}</td></tr>
        </tbody>
      </table>
      <ul className="shared">
        <li><Check size={14} strokeWidth={2.5} /><span>Orvane holds your money. The supplier is paid only when the goods arrive and match the sample.</span></li>
        <li><Check size={14} strokeWidth={2.5} /><span>Cancel for a full refund until the supplier confirms, around {dateOf(steps[1].day)}.</span></li>
        <li><Check size={14} strokeWidth={2.5} /><span>Arrives around {dateOf(steps[steps.length - 1].day)}. You keep {money0(left)} for launch.</span></li>
      </ul>
    </Sheet>
  );
}

/* ───────────── The plan: every decision and its reason ───────────── */

export function PlanDrawer() {
  const { plan, set, s } = useStore();
  const close = () => set({ planOpen: false });
  useEscape(close);
  return (
    <div className="sheet-wrap side">
      <motion.div className="scrim strong" {...fade} onClick={close} />
      <motion.aside className="plan-drawer" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }} role="dialog" aria-label="Your plan">
        <header><span className="sheet-mark plain"><ClipboardList size={16} /></span><div><h2>Your plan</h2><p>Every decision so far, with the reason behind it.</p></div><button className="icon-btn ghost" onClick={close} aria-label="Close"><X size={18} /></button></header>
        {plan.length === 0 ? (
          <p className="plan-empty">Nothing decided yet. Your brief, product and suppliers will collect here as you go.</p>
        ) : (
          <ol className="plan-list">
            {plan.map((item) => <li key={item.key}><span><Check size={12} strokeWidth={3} /></span><div><b>{item.title}</b><p>{item.detail}</p></div></li>)}
            {!s.ordered && <li className="todo"><span /><div><b>{s.orderId ? 'Next: approve the first order' : s.stage === 'check' ? 'Next: check your samples' : s.samplesRequested ? 'Next: samples arrive, then you check them' : s.quotesReady ? 'Next: request samples' : s.contacted.length ? 'Next: wait for quotes' : s.productId ? 'Next: ask the shortlist for quotes' : 'Next: choose a product'}</b></div></li>}
          </ol>
        )}
      </motion.aside>
    </div>
  );
}

/* ───────────── Every region side by side ───────────── */

export function MarketsPanel() {
  const { s, set, act } = useStore();
  const close = () => set({ marketsOpen: false });
  useEscape(close);
  const p = s.profile;
  const cmp = compareMarkets(p, MARKET_ORDER);
  const current = s.answered.market ? p.market : null;
  const pick = (id: MarketId) => { set({ marketsOpen: false }); act({ t: 'market', id }); };
  const tone = (t: string) => (t === 'worth' ? 'good' : t === 'care' ? 'care' : t === 'skip' ? 'bad' : 'out');

  return (
    <>
      <motion.div className="scrim" {...fade} onClick={close} />
      <motion.div className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.2 }} role="dialog" aria-label="Compare all regions">
        <header className="panel-head">
          <div>
            <h2>Every region for your brief</h2>
            <p>A {money0(p.budget)} budget, {CHANNELS[p.channel].name.toLowerCase()}, ranked for {list(p.priorities.map((x) => PRIORITIES[x].name.toLowerCase())) || 'overall fit'}. All figures in US dollars.</p>
          </div>
          <button className="icon-btn ghost" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="panel-body">
          <div className="mk-cards">
            {cmp.views.map((v) => {
              const m = v.market;
              const best = cmp.best === v;
              const lead = v.lead;
              const ad = p.channel === 'marketplace' ? m.adMarketplace : m.adOwn;
              return (
                <section key={m.id} className={`mk-card${best ? ' best' : ''}${current === m.id ? ' current' : ''}`}>
                  {best && <span className="mk-flag"><SparkMark size={11} />Scout's pick</span>}
                  <header><span className="code">{m.id}</span><b>{m.name}</b>{current === m.id && <em>Your market</em>}</header>
                  {lead ? (
                    <div className="mk-lead">
                      <strong className="num">{money(lead.stack.profit)}</strong>
                      <span>per sale from the {lead.product.short.toLowerCase()}</span>
                    </div>
                  ) : (
                    <div className="mk-lead none"><strong>Nothing</strong><span>{v.run.fits.length ? 'every product that fits is a skip' : `fits a ${money0(p.budget)} budget`}</span></div>
                  )}
                  <p className="mk-count"><span className="mk-worth"><b>{v.worth}</b>worth testing</span><span>{v.run.fits.length} of {v.run.results.length} fit your budget</span></p>
                  <ul className="facts-mini">
                    <li><Landmark size={14} />{m.dutyNote ? `${pct(m.duty.CN)} import duty, simplified` : `${pct(m.duty.CN, (m.duty.CN * 1000) % 10 ? 1 : 0)} import duty from China`}</li>
                    <li><Receipt size={14} />{m.vat ? `${pct(m.vat)} sales tax inside the price` : 'Sales tax added at checkout'}</li>
                    <li><Megaphone size={14} />About {money(ad)} in ads per sale</li>
                    {m.refusals > 0 && <li><PackageX size={14} />{pct(m.refusals)} of cash-on-delivery parcels refused</li>}
                  </ul>
                  {current === m.id
                    ? <button className="btn btn-ghost btn-sm btn-block" onClick={close}>Keep {m.the}</button>
                    : <button className={`btn btn-sm btn-block ${best ? 'btn-primary' : 'btn-ghost'}`} onClick={() => pick(m.id)}>Sell in {m.the}</button>}
                </section>
              );
            })}
          </div>

          <h3 className="mk-sub">Profit per sale, product by product<span>Shaded: the strongest region for each product, judged against local prices</span></h3>
          <div className="table-card card mk-scroll">
            <table className="mk-table">
              <thead><tr><th>Product</th>{cmp.views.map((v) => <th key={v.market.id} className="r">{v.market.short}</th>)}</tr></thead>
              <tbody>
                {/* Products that work somewhere come first, strongest first. Ones over the limit everywhere go last. */}
                {cmp.views[0].run.results.map((r0) => r0.product).map((prod) => {
                  const best = Math.max(...cmp.views.map((v) => { const r = v.run.results.find((x) => x.product.id === prod.id)!; return r.verdict.tier === 'out' ? -99 : r.verdict.tier === 'skip' ? -50 + r.stack.profit / v.market.scale / 100 : r.stack.profit / v.market.scale; }));
                  return { prod, best };
                }).sort((a, b) => b.best - a.best).map(({ prod }) => {
                  const cells = cmp.views.map((v) => v.run.results.find((r) => r.product.id === prod.id)!);
                  // The strongest region for this product, judged against local prices.
                  const rel = (i: number) => (['worth', 'care'].includes(cells[i].verdict.tier) ? cells[i].stack.profit / cmp.views[i].market.scale : -Infinity);
                  const topAt = cells.reduce((b, _, i) => (rel(i) > rel(b) ? i : b), 0);
                  const top = rel(topAt) > -Infinity ? cells[topAt] : null;
                  return (
                    <tr key={prod.id}>
                      <th><span className="mk-prod"><ProductArt id={prod.id} />{prod.short}</span></th>
                      {cells.map((r, i) => (
                        <td key={i} className={`r${r === top ? ' best' : ''}`} title={`${r.verdict.label}${r.verdict.reason ? `: ${r.verdict.reason}` : ''}`}>
                          {r.verdict.tier === 'out'
                            ? <span className="mk-out">Over limit</span>
                            : <><b className={`num${r.stack.profit < 0 ? ' neg' : ''}`}>{money(r.stack.profit)}</b><i className={`tdot tdot-${tone(r.verdict.tier)}`} aria-label={r.verdict.label} /></>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="foot-note"><span className="mk-legend"><i className="tdot tdot-good" />Worth testing<i className="tdot tdot-care" />With care<i className="tdot tdot-bad" />Skip</span>Shelf prices differ by region, so Scout judges profit against local prices. In Bangladesh, about $2.50 a sale is a solid result.</p>
        </div>
      </motion.div>
    </>
  );
}

/* ───────────── Messages ───────────── */

const replyWhen = (day: number) => (day === 0 ? 'Same day' : day === 1 ? 'Next day' : `Day ${day + 1}`);

/**
 * Every conversation Scout has had with suppliers on the seller's behalf, so
 * they can read exactly what was said. Built from the journey itself: the
 * inquiry they approved, Scout's follow-up, each reply and the sample request.
 */
export function MessagesPanel() {
  const { s, set, supRun, quotes, picks } = useStore();
  const close = () => set({ messagesOpen: false });
  useEscape(close);
  const threads = (supRun?.results ?? []).filter((r) => s.contacted.includes(r.supplier.id));
  const [openId, setOpenId] = useState<string | null>(threads[0]?.supplier.id ?? null);
  const cur = threads.find((r) => r.supplier.id === openId) ?? null;
  const q = cur ? quotes.find((x) => x.supplier.id === cur.supplier.id) : undefined;
  const sampled = cur ? s.samplesRequested && (picks.some((x) => x.supplier.id === cur.supplier.id) || Boolean(s.ratings[cur.supplier.id])) : false;
  const minorsFor = (id: string) => {
    const pr = supRun?.product;
    if (!pr) return [] as string[];
    const r = s.ratings[id] ?? {};
    return checkPoints(pr.category, s.profile, supRun!.results[0]?.stack.price ?? 0).filter((pt) => r[pt.id] === 'minor').map((pt) => pt.noun);
  };
  const status = (id: string) => {
    const qq = quotes.find((x) => x.supplier.id === id);
    return qq ? (qq.followUp ? 'Replied after a follow-up' : 'Replied') : 'Waiting for a reply';
  };

  return (
    <>
      <motion.div className="scrim" {...fade} onClick={close} />
      <motion.div className="panel msg-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.2 }} role="dialog" aria-label="Messages">
        <header className="panel-head">
          <div>
            <h2>Messages</h2>
            <p>{threads.length ? `Everything Scout said to suppliers for you, and what they said back.` : 'Conversations with suppliers show up here.'}</p>
          </div>
          <button className="icon-btn ghost" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>
        {!threads.length ? (
          <div className="msg-empty">
            <span className="msg-empty-icon"><MessagesSquare size={22} /></span>
            <b>No messages yet</b>
            <p>When you approve a quote request, Scout writes to suppliers for you. Every message and reply appears here.</p>
            <button className="btn btn-ghost btn-sm" onClick={close}>Back to sourcing</button>
          </div>
        ) : (
          <div className={`msg-layout${cur ? ' has-open' : ''}`}>
            <ul className="msg-list">
              {threads.map((r) => {
                const qq = quotes.find((x) => x.supplier.id === r.supplier.id);
                return (
                  <li key={r.supplier.id}>
                    <button className={r.supplier.id === openId ? 'on' : ''} onClick={() => setOpenId(r.supplier.id)}>
                      <Monogram s={r.supplier} size={36} />
                      <span className="msg-who"><b>{r.supplier.short}</b><em>{qq ? supplierReply(qq) : 'Inquiry sent. No reply yet.'}</em></span>
                      <i className={`msg-dot${qq ? ' in' : ''}`} aria-label={status(r.supplier.id)} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {cur && (
              <section className="msg-thread" aria-label={`Conversation with ${cur.supplier.name}`}>
                <header>
                  <button className="icon-btn ghost msg-back" onClick={() => setOpenId(null)} aria-label="Back to all messages"><ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} /></button>
                  <div><b>{cur.supplier.name}</b><span>{status(cur.supplier.id)}</span></div>
                </header>
                <div className="msg-scroll">
                  <div className="bubble out">
                    <span className="bubble-by">You, sent by Scout<em>Day 1</em></span>
                    <p>{s.inquiryDraft}</p>
                  </div>
                  {s.followUp && cur.supplier.quote.followUp && s.quotesReady && (
                    <div className="bubble out small">
                      <span className="bubble-by">Scout's follow-up<em>Day 2</em></span>
                      <p>Just checking you saw our request for the {supRun!.product.short.toLowerCase()}. A quote this week would be great.</p>
                    </div>
                  )}
                  {q ? (
                    <div className="bubble in">
                      <span className="bubble-by">{cur.supplier.short}<em>{replyWhen(q.day)}</em></span>
                      <p>{supplierReply(q)}</p>
                      {q.note && <p className="bubble-note">{q.note}</p>}
                    </div>
                  ) : (
                    <p className="msg-wait"><i />{s.followUp ? 'No reply yet. Scout follows up once after 24 hours of silence.' : 'No reply yet.'}</p>
                  )}
                  {sampled && (
                    <div className="bubble out">
                      <span className="bubble-by">You, sent by Scout<em>{s.sampleDay !== null ? dateOf(s.sampleDay) : 'After the quotes'}</em></span>
                      <p>Please send one sample of the {supRun!.product.short.toLowerCase()} as quoted. Payment is through Orvane.</p>
                    </div>
                  )}
                  {s.ordered && s.orderId === cur.supplier.id && q && (
                    <>
                      <div className="bubble out">
                        <span className="bubble-by">You, sent by Scout<em>{dateOf(s.day)}</em></span>
                        <p>{`We'd like to order ${q.moq} units at ${money(q.unit)} as quoted.${minorsFor(cur.supplier.id).length ? ` Before production, please fix ${minorsFor(cur.supplier.id).join(' and ')}.` : ''} Payment is through Orvane.`}</p>
                      </div>
                      <p className="msg-wait"><i />Waiting for {cur.supplier.short} to confirm, usually within 2 days.</p>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}
