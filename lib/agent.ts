import { hasToolCall, isStepCount, jsonSchema, streamText, tool, type LanguageModel, type ToolSet } from 'ai';
import type { Ctx, ScoutEvent, Turn } from './acts';
import { scoutInstructions, scoutTools, stepLabel } from './tools';

export type { ScoutEvent, Turn } from './acts';

/**
 * Scout's live reasoning on the server. A language model answers open
 * questions and can move the journey forward, through the tools in tools.ts.
 */

export interface RunScoutArgs {
  model: LanguageModel;
  question: string;
  history: Turn[];
  ctx: Ctx;
  signal?: AbortSignal;
}

/** Runs one turn and returns newline-delimited JSON events the interface can render as they arrive. */
export function runScout({ model, question, history, ctx, signal }: RunScoutArgs): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let open = true;
      const emit = (e: ScoutEvent) => { if (open) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`)); };
      try {
        const tools: ToolSet = {};
        for (const t of scoutTools(ctx, emit, { chipsTool: true })) {
          tools[t.name] = tool({
            description: t.description,
            inputSchema: jsonSchema<Record<string, unknown>>(t.schema),
            execute: async (input) => t.run((input ?? {}) as Record<string, unknown>),
          });
        }
        const result = streamText({
          model,
          instructions: scoutInstructions(ctx, { chipsTool: true }),
          messages: [...history, { role: 'user', content: question }],
          tools,
          stopWhen: [isStepCount(6), hasToolCall('suggestNextSteps')],
          maxOutputTokens: 700,
          abortSignal: signal,
        });
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') emit({ type: 'text', delta: part.text });
          else if (part.type === 'tool-call') {
            const label = stepLabel(part.toolName, (part.input ?? {}) as Record<string, unknown>);
            if (label) emit({ type: 'step', label });
          } else if (part.type === 'error') throw part.error;
          else if (part.type === 'tool-error') console.error('Scout tool failed:', part.toolName, part.error);
        }
        emit({ type: 'done' });
      } catch (err) {
        // Shows in Vercel > Logs, so a failed model call can be diagnosed.
        console.error('Scout live reasoning failed:', err);
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Scout could not reach its model.' });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
}
