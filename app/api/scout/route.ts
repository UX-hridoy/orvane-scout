import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { runScout, type Turn } from '@/lib/agent';
import type { Ctx, Stage } from '@/lib/acts';
import { DEFAULT_PROFILE, PRODUCTS, SUPPLIERS } from '@/lib/data';
import type { Profile } from '@/lib/types';

export const maxDuration = 45;

/**
 * Scout always works without a model: its built-in layer answers from the
 * engine. A live model is switched on only by a key, so nothing here can run
 * up a bill by accident.
 *
 * - GOOGLE_GENERATIVE_AI_API_KEY: a free Google AI Studio key. Uses Gemini Flash-Lite.
 * - AI_GATEWAY_API_KEY: a Vercel AI Gateway key. Uses any gateway model (paid credits).
 * - SCOUT_LIVE=off forces the built-in layer even when a key is set.
 */
function brain(): { model: LanguageModel; label: string } | null {
  if (process.env.SCOUT_LIVE === 'off') return null;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const id = process.env.SCOUT_GEMINI_MODEL || 'gemini-3.5-flash-lite';
    return { model: google(id), label: `Google ${id}` };
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    const id = process.env.SCOUT_MODEL || 'anthropic/claude-sonnet-5.5';
    return { model: id, label: id };
  }
  return null;
}

export async function GET() {
  const b = brain();
  return Response.json({ live: Boolean(b), model: b?.label ?? null });
}

/* A small per-visitor limit so a shared link cannot use up the daily allowance. */
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 40;
const hits = new Map<string, number[]>();
function allow(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

const STAGES: Stage[] = ['start', 'setup', 'category', 'pick', 'opportunities', 'suppliers', 'waiting', 'quotes', 'decision', 'done'];
const productIds = new Set(PRODUCTS.map((p) => p.id));
const supplierIds = new Set(SUPPLIERS.map((s) => s.id));

/** Never trust the browser: rebuild the session context from known values only. */
function readCtx(raw: unknown): Ctx {
  const c = (raw ?? {}) as Record<string, unknown>;
  const p = (c.profile ?? {}) as Record<string, unknown>;
  const profile: Profile = {
    market: ['US', 'DE', 'UK', 'BD'].includes(p.market as string) ? (p.market as Profile['market']) : DEFAULT_PROFILE.market,
    budget: Math.min(20000, Math.max(300, Number(p.budget) || DEFAULT_PROFILE.budget)),
    channel: ['own', 'marketplace', 'retail', 'unsure'].includes(p.channel as string) ? (p.channel as Profile['channel']) : 'own',
    priorities: Array.isArray(p.priorities) ? (p.priorities.filter((x) => ['risk', 'steady', 'profit', 'growth', 'simple'].includes(x)) as Profile['priorities']).slice(0, 3) : [],
    experience: p.experience === 'existing' ? 'existing' : 'new',
  };
  const pid = (v: unknown) => (typeof v === 'string' && productIds.has(v) ? v : null);
  const sids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && supplierIds.has(x)) : []);
  return {
    stage: STAGES.includes(c.stage as Stage) ? (c.stage as Stage) : 'opportunities',
    profile,
    productId: pid(c.productId),
    focusProductId: pid(c.focusProductId),
    focusSupplierId: typeof c.focusSupplierId === 'string' && supplierIds.has(c.focusSupplierId) ? c.focusSupplierId : null,
    contacted: sids(c.contacted),
    quotesReady: Boolean(c.quotesReady),
    sampleIds: sids(c.sampleIds),
    samplesRequested: Boolean(c.samplesRequested),
    recall: { productId: pid((c.recall as Record<string, unknown> | undefined)?.productId), supplierId: null },
    auto: false,
  };
}

export async function POST(req: Request) {
  const b = brain();
  if (!b) return Response.json({ error: 'Live reasoning is not connected.' }, { status: 503 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!allow(ip)) return Response.json({ error: 'Too many questions in a short time. Try again in a few minutes.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad request.' }, { status: 400 }); }

  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 600) : '';
  if (!question) return Response.json({ error: 'Ask a question.' }, { status: 400 });

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is Turn => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.length > 0)
    .slice(-8)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 1200) }))
    // Models expect turns to alternate and to open with the seller.
    .reduce<Turn[]>((acc, t) => {
      const last = acc[acc.length - 1];
      if (!last && t.role === 'assistant') return acc;
      if (last && last.role === t.role) { last.content += `\n\n${t.content}`; return acc; }
      acc.push(t);
      return acc;
    }, []);
  if (history.length && history[history.length - 1].role === 'user') history.pop();

  const stream = runScout({ model: b.model, question, history, ctx: readCtx(body.ctx), signal: req.signal });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
