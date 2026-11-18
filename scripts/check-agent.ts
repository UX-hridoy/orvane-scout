/** Runs Scout's live path against a scripted mock model, to check tools and streaming end to end. */
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { runScout } from '../lib/agent';
import { DEFAULT_PROFILE } from '../lib/data';

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } };
const finish = (unified: 'stop' | 'tool-calls') => ({ type: 'finish' as const, finishReason: { unified, raw: undefined }, logprobs: undefined, usage });
const call = (id: string, toolName: string, input: unknown) => ({ type: 'tool-call' as const, toolCallId: id, toolName, input: JSON.stringify(input) });
const say = (id: string, words: string[]) => [{ type: 'text-start' as const, id }, ...words.map((delta) => ({ type: 'text-delta' as const, id, delta })), { type: 'text-end' as const, id }];

const model = new MockLanguageModelV4({
  doStream: [
    { stream: simulateReadableStream({ chunks: [call('c1', 'recalculate', { market: 'DE' }), finish('tool-calls')] }) },
    { stream: simulateReadableStream({ chunks: [call('c2', 'updateBrief', { budget: 4000 }), call('c3', 'showOnScreen', { view: 'productMaths', ids: ['slow-feeder'] }), call('c5', 'takeStep', { step: 'chooseProduct', productId: 'slow-feeder' }), finish('tool-calls')] }) },
    { stream: simulateReadableStream({ chunks: [...say('t1', ['In Germany the slow-feeder ', 'bowl leads at about **$7.83**.']), call('c4', 'suggestNextSteps', { options: ['Switch to Germany', 'Why did the travel set drop?'] }), finish('tool-calls')] }) },
    { stream: simulateReadableStream({ chunks: [finish('stop')] }) },
  ],
});

async function main() {
const stream = runScout({
  model, question: 'What if I sold in Germany?', history: [],
  ctx: { stage: 'opportunities', profile: DEFAULT_PROFILE, productId: null, focusProductId: null, focusSupplierId: null, contacted: [], quotesReady: false, sampleIds: [], samplesRequested: false },
});
const text = await new Response(stream).text();
console.log(text);
const events = text.trim().split('\n').map((l) => JSON.parse(l));
const expect = (name: string, ok: boolean) => { if (!ok) { console.error(`✗ ${name}`); process.exitCode = 1; } else console.log(`✓ ${name}`); };
expect('the brief change reaches the screen', events.some((e) => e.type === 'act' && e.act.t === 'profile' && e.act.patch.budget === 4000));
expect('the model can choose a product', events.some((e) => e.type === 'act' && e.act.t === 'choose' && e.act.id === 'slow-feeder'));
expect('follow-ups arrive as chips', events.some((e) => e.type === 'chips' && e.chips.length === 2));
expect('the turn ends cleanly', events[events.length - 1].type === 'done');
const second = model.doStreamCalls[1];
const toolMsg = JSON.stringify(second.prompt).slice(0, 2600);
console.log('--- prompt sent on step 2 (start) ---\n', toolMsg.slice(0, 500), '\n...\n', toolMsg.slice(-700));
}
main();
