# Scout, a sourcing agent for Orvane

A concept prototype. Scout lives inside Orvane, a fictional B2B marketplace, and takes a seller from "I don't know what to sell" to an approved first order: it works out what one sale really earns, checks who is safe to buy from, contacts suppliers once the seller approves, walks them through checking the samples, and prepares the order. It also answers the questions sellers ask along the way, from selling rules and customs to reordering, using the seller's own numbers (`lib/knowledge.ts`).

Four product categories have full data: pet supplies, kitchen, home fitness and phone accessories.

Orvane, Scout, and every product, supplier, price and demand figure are simulated. Nothing here is real market evidence. Markets: the United States, Germany, the United Kingdom and Bangladesh. Bangladesh duty is simplified to 45% from its tariff (25% customs duty on household plastics, plus regulatory and supplementary duty), with 15% VAT inside the shelf price and most orders paid in cash on delivery.

## Run it

Requires Node 22 or later.

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm test           # typecheck, engine figures, language checks, live-agent wiring
npm run build      # production build
```

## Put it on Vercel

**From GitHub.** Push this folder to a repository, then in Vercel choose Add New > Project and import it. Vercel detects Next.js; no settings to change.

**From your machine.** In this folder run `npx vercel` for a preview link, then `npx vercel --prod` when you are happy.

Preview links are private to your Vercel team by default (Deployment Protection). Keep that on, or turn it off for the production domain when you want to share outside the team.

## How Scout thinks

Scout has three layers. They share one engine, so no two screens can disagree on a number.

1. **The engine** (`lib/engine.ts`). Pure functions over the data in `lib/data.ts`: the cost of one sale, the first order total, ranking by the seller's priorities, verdicts with reasons, supplier checks, quotes, and "what changed" between two briefs. Change a budget, market, sales channel or priority and it is recalculated, not looked up.
2. **The agent** (`components/store.tsx`, `lib/brain.ts`). This part needs no model and costs nothing.
   - **Runs the search itself.** One sentence on the start screen ("I have $3,000 and want to sell in Germany"), the "Run it for me" button, or "take it from here" at any point. Scout fills the brief, ranks the products, picks one and says why, checks suppliers, and writes the quote request. It stops at both approval sheets, and it stops early when nothing fits the budget or when it would not test the best product itself.
   - **Does what it is told.** "Choose the slow feeder", "go with the second one", "ask them for quotes", "request samples", "back to products", "undo that", "yes".
   - **Speaks up.** When a change to the brief leaves the chosen product behind, Scout says so and offers the switch. When the conversation wanders, the next step stays one tap away above the message box.
   - **Answers from the engine.** What-ifs with several changes at once, "which has the fewest returns?", "how much would I make from 200 sales?", supplier safety, break-even, timelines, trade terms. It remembers what was last discussed, so "is it safe?" means the supplier you just asked about.
3. **A live model for open questions** (`lib/tools.ts`). Optional. The model never does its own arithmetic: it calls tools that run the engine (`recalculate`, `productDetail`, `supplierCheck`, `quotes`), can change the brief, open things on screen, and move the journey forward (`takeStep`). It cannot send a message or spend money; those always open an approval sheet. If a call fails, the built-in layer answers instead.

### Turn on a live model (free)

The app works fully without this. A model only adds answers to questions the built-in layer does not cover.

1. Create a free key at https://aistudio.google.com/apikey.
2. In Vercel: Project > Settings > Environment Variables. Add `GOOGLE_GENERATIVE_AI_API_KEY` with the key as its value.
3. Redeploy. The "Simulated data" badge in the header now names the model.

Scout uses `gemini-3.5-flash-lite` unless you set `SCOUT_GEMINI_MODEL`. Google sets the free daily allowance and shows it in AI Studio; when it runs out, Scout falls back to the built-in layer on its own. On the free tier Google may use prompts to improve its products, which is fine here because all data is simulated. Never paste a key into chat or commit it.

Other options: `AI_GATEWAY_API_KEY` uses Vercel AI Gateway with any model in `SCOUT_MODEL` (this needs paid credits). `SCOUT_LIVE=off` forces the built-in layer. Each visitor is limited to 40 questions per 10 minutes.

The live path is tested here against a scripted mock model (`npm run test:agent`), not against a real one, because this build environment cannot reach Google or Vercel. Ask a few open questions after your first deploy to confirm it.

### The same app as a Claude artifact

`npm run build:artifact` bundles this app into one HTML file (`artifact/dist/orvane-scout.html`) that runs as a Claude artifact. There, open questions go to Claude on the viewer's own Claude plan (`artifact/transport.ts`), with the same tools. No key is involved.

## Large screens

Every size in `app/globals.css` is in rem, and the root size steps up on large displays (about 1.125x at 1920px, 1.375x at 2560px), so the layout keeps its proportions instead of stretching. The steps need height as well as width. The app is capped at 120rem wide and centred beyond that.

## Where things are

```
app/
  page.tsx, layout.tsx, globals.css   the page and all styles
  api/scout/route.ts                  live reasoning endpoint
components/
  App.tsx        header, brief bar, shell
  Journey.tsx    the journey bar: where the search stands
  Scout.tsx      the conversation panel, run control and next-step strip
  Views.tsx      start, brief builder, products, suppliers and quotes, plan
  Overlays.tsx   product and supplier detail, comparisons, approval sheets, plan drawer
  ProductArt.tsx product illustrations (placeholders for photography)
  store.tsx      session state, the guided journey and the autopilot
  transport.ts   how the page reaches a live model on the server
  ui.tsx         verdict tags, evidence dots, cost bar, charts
lib/
  data.ts        the simulated world: markets, products, suppliers
  engine.ts      costs, ranking, verdicts, suppliers, quotes, diffs
  narrate.ts     Scout's guided messages, written from engine output
  brain.ts       built-in language layer: commands and answers
  tools.ts       what a live model can know and do as Scout
  agent.ts       runs a live model on the server
artifact/        entry and Claude transport for the single-file build
scripts/
  check-engine.ts    asserts every figure in the foundation document
  check-brain.ts     asserts how typed requests are read
  question-bank.ts   88 real seller questions Scout must answer without falling back
  check-agent.ts     runs the live path against a mock model
  build-artifact.mjs bundles the app into one HTML file
```

## Prototype controls

Click **Simulated data** in the header to jump to any stage, simulate a data error, restart, or see which reasoning layer is active.

Things worth trying:

- On the start screen, type "I have $3,000 and want to sell in Germany" and press Run it for me.
- Choose a product, then switch the market to Germany. Scout tells you the product has slipped and offers the better one.
- Type "choose the slow feeder", "ask them for quotes", "which has the fewest returns?" or "what if I had $4,000 and sold in Germany on Amazon?"
- Switch the market to Germany on the products screen. The order changes and Scout says why, with an Undo.
- Set the budget to $800 (nothing fits) or $4,000 (three products come back).
- Open the Pet hair remover roller and "See the maths": the fastest-rising product loses money on every sale.
- Try to choose it anyway. Scout pushes back before it looks for suppliers.
- Type "what if ads cost $10 per sale?" or "how many do I need to sell to get my money back?"
- Pick Australia. Scout says it has no data instead of guessing.
- On the start screen, point at the "Where one sale goes" bar, then switch markets: the same product leaves very different money in each.
- Pick Bangladesh. Duty is much higher and shelf prices lower, so fewer products work, and Scout judges profit against local prices. Budgets in taka work too: "I have 3 lakh taka".
- Open **All regions** (in the market menu, on the brief card, or "which market is best for me?"). Every market is run with the same brief, side by side, with Scout's pick.

## Before this goes public

- Run a trademark check on the names Orvane and Scout.
- Replace the illustrations in `components/ProductArt.tsx` with product photography.
