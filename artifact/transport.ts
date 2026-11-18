import type { ScoutEvent, Transport } from '@/lib/acts';
import { scoutInstructions, scoutTools, splitNext, stepLabel } from '@/lib/tools';

/**
 * Scout's live reasoning inside a Claude artifact. The page asks Claude
 * directly, on the viewer's own Claude plan, and hands it the same tools the
 * server route uses. Nothing here needs a key.
 */

interface SampleError { code?: string; text?: string }
type Sample = ((input: unknown, options?: Record<string, unknown>) => Promise<{ text: string }>) & {
  limits?: () => Promise<{ tools?: { maxCount: number } }>;
};

/** Codes that mean Claude is not available to this page for the rest of the visit. */
const GONE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable', 'session_expired'];

export function claudeTransport(): Transport {
  let sample: Sample | null = null;
  let gone = false;

  const ready = (async () => {
    const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
    if (!claude?.use) return;
    try {
      const fn = (await claude.use('sample')) as Sample | null;
      // Scout's figures all come from tools, so without them the built-in layer is the honest choice.
      const limits = fn?.limits ? await fn.limits().catch(() => null) : null;
      if (fn && limits?.tools) sample = fn;
    } catch {
      sample = null;
    }
  })();

  return {
    async status() {
      await ready;
      return { live: Boolean(sample), model: sample ? 'Claude' : null };
    },

    async ask({ question, history, ctx }, onEvent) {
      await ready;
      if (!sample || gone) return false;
      let delivered = false;
      const emit = (e: ScoutEvent) => { if (e.type === 'act') delivered = true; onEvent(e); };
      const tools = scoutTools(ctx, emit, { chipsTool: false }).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.schema,
        execute: (input: Record<string, unknown>) => {
          const label = stepLabel(t.name, input ?? {});
          if (label) onEvent({ type: 'step', label });
          return t.run(input ?? {});
        },
      }));
      const turns = [{ role: 'user', content: scoutInstructions(ctx, { chipsTool: false }) }, ...history, { role: 'user', content: question }];
      try {
        const res = await sample(turns, {
          tools,
          modelTier: 'quick',
          cache: false,
          onText: ({ text }: { text: string }) => {
            const shown = splitNext(text).text;
            if (shown) { delivered = true; onEvent({ type: 'set', text: shown }); }
          },
        });
        const { text, chips } = splitNext(res.text);
        if (text) { delivered = true; onEvent({ type: 'set', text }); }
        if (chips.length) onEvent({ type: 'chips', chips });
        return delivered;
      } catch (err) {
        const code = (err as SampleError)?.code ?? '';
        if (GONE.includes(code)) gone = true;
        // The built-in layer answers instead. The page never retries on its own.
        return false;
      }
    },
  };
}
