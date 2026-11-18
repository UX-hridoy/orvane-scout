import type { ScoutEvent, Transport } from '@/lib/acts';

/** Reaches the live model through the app's own server route. Used by the Next.js app. */
export const serverTransport: Transport = {
  async status() {
    try {
      const d = await (await fetch('/api/scout')).json();
      return { live: Boolean(d.live), model: d.model ?? null };
    } catch {
      return { live: false, model: null };
    }
  },

  async ask(args, onEvent) {
    const res = await fetch('/api/scout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok || !res.body) return false;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let failed = false;
    let said = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line) as ScoutEvent;
        if (ev.type === 'error') failed = true;
        if (ev.type === 'text' || ev.type === 'act') said = true;
        onEvent(ev);
      }
    }
    return !(failed && !said);
  },
};
