> **Historical.** This document records past work. Its instructions are not active, and its file paths and status may be out of date. For the current state, read [README.md](../../README.md), [AGENTS.md](../../AGENTS.md) and [docs/feature-map.md](../feature-map.md).

The repository is a good fit for this without adding a heavy “AI agent” architecture. You already have TanStack Start/Router, React Query, Zod, shadcn/ui, server functions, a centralized `navItems` list, trade mutations, cash-flow mutations, and a theme context.

I would build this as a hybrid command system: deterministic/rule-based first, Gemini only as a fallback.

### Recommended architecture

Think of the palette as a small intent router rather than a chatbot:

```text
⌘K / Ctrl+K
        ↓
Command Palette
        ↓
raw input
        ↓
┌─────────────────────────────┐
│ Command Matcher             │
│                             │
│ 1. exact aliases            │
│ 2. domain parsers           │
│ 3. fuzzy command matching   │
│ 4. Gemini fallback later    │
└─────────────────────────────┘
        ↓
ranked candidates
        ↓
preview / fill missing params
        ↓
execute
```

Each action can expose something roughly like:

```ts
type Command = {
  id: string
  title: string
  aliases: string[]
  match: (query: string) => CommandCandidate | null
  execute: (params: unknown) => Promise<void> | void
}
```

This is closer to what you want from Raycast. It does not require an LLM to decide everything.

Your existing `navItems` is already an ideal source for navigation commands: Dashboard, Journal, Calendar, Strategies, Settings.

For example:

```text
journal
journ
trades
```

could rank:

```text
Journal                              ↵
Go to /journal
```

And:

```text
dark mode
```

becomes:

```text
Enable dark mode                     ↵
```

Your `ThemeProvider` already exposes `theme` and `setTheme()`, so this is almost free to implement.

The palette should live globally inside `ThemeProvider` in `src/routes/__root.tsx`, because that is already where global theme/navigation UI is composed.

### Natural trading commands

For:

```text
short gold 4550 with target 4500, 0.01 lot
```

I would have the local parser produce:

```ts
{
  intent: "CREATE_TRADE",
  confidence: 0.98,
  params: {
    symbol: "XAUUSDM",
    side: "SHORT",
    entryPrice: 4550,
    targetPrice: 4500,
    quantity: 0.01,
  }
}
```

The important part is that `0.01` can stay as `0.01`. Your existing instrument model already treats Forex and XAUUSD quantities as lots and XAUUSD as a 100-unit contract. It also intentionally recognizes broker suffixes because it falls back to `startsWith(registeredSymbol)`, meaning `XAUUSDM` gets XAUUSD metal semantics.  Your P&L calculation then multiplies `quantity × contractSize`, so this fits your existing accounting model.

I would keep a tiny alias table:

```ts
{
  gold: "XAUUSDM",
  xau: "XAUUSDM",
  xauusd: "XAUUSDM"
}
```

Later this could become account-specific, but I would not build that now.

There is one schema change I recommend: your current trade table has `entryPrice`, `exitPrice`, quantity, fees, etc., but no planned target price.  The current `TradeEntryForm` similarly only accepts entry/exit values and notes.

So add only:

```text
target_price numeric nullable
```

and expose `targetPrice?: string` through `tradeActions.ts`.

I would not add stop loss, risk percentage, R:R, etc. until you actually want those commands.

For a write action, don't immediately save as soon as the parser sees it. Show a compact confirmation:

```text
Create trade

XAUUSDM   SHORT
Entry     4550
Target    4500
Size      0.01 lot
Account   Main account

                            Create ↵
```

This provides most of the speed without allowing a typo to silently create financial records.

Your existing `createTrade` already performs authentication, portfolio ownership checking, validation and insertion, so the palette should ultimately call the same server function instead of introducing another trade API.

Deposits work almost identically:

```text
deposit 1000
deposit $1000
add 2000 usd deposit
withdraw 500
```

becomes:

```ts
{
  intent: "ADD_ACCOUNT_ENTRY",
  params: {
    kind: "DEPOSIT",
    amount: 1000,
    occurredAt: now,
  }
}
```

You already have exactly the three required account-entry concepts: `DEPOSIT`, `WITHDRAWAL`, and `ADJUSTMENT`.  `addCashFlow` already validates and writes these against the active portfolio.

## Phase 1 — Command palette + local intent parsing

This should be the main feature and probably delivers 80–90% of the value.

Add shadcn's Command component using the repository's normal shadcn workflow. The repo currently doesn't have the command primitive/cmdk dependency, and its own contributor instructions say to add shadcn components with `pnpx shadcn@latest add <component>`.

Suggested structure:

```text
src/
  components/
    command-palette/
      CommandPalette.tsx
      CommandPreview.tsx

  lib/
    commands/
      types.ts
      registry.ts
      matcher.ts
      aliases.ts
      parsers/
        trade.ts
        account-entry.ts
```

Implement these commands:

```text
Navigation
  Dashboard
  Journal
  Calendar
  Strategies
  Settings

Actions
  Log trade
  Add deposit
  Add withdrawal

Settings
  Dark mode
  Light mode
  System theme
```

Shortcut:

```text
⌘K   macOS
Ctrl+K Windows/Linux
```

The matcher should be simple weighted rules, not a complex classifier:

```text
Exact alias                         ~1.00
Recognized action + required fields ~0.95
Recognized action, missing fields   ~0.75
Fuzzy command/page match            variable
```

So:

```text
"journal"
```

selects navigation.

But:

```text
"short gold 4550 0.01 lot"
```

wins over fuzzy text search because it contains a trading action, instrument alias, price and quantity.

If parameters are missing:

```text
short gold
```

show:

```text
Log short XAUUSDM trade
Entry price      [ required ]
Quantity         [ required ]
Target           [ optional ]
```

That Raycast-style “command → arguments” transition is much better than trying to make every natural-language query perfect.

Also add `targetPrice` in this phase.

Tests should mostly target parsers:

```text
short gold 4550 target 4500 0.01 lot
buy eurusd at 1.1735 0.1 lot
deposit 1000
withdraw 250
dark mode
journal
```

No database changes besides `target_price`.

## Phase 2 — Gemini fallback for ambiguous language

Do not send every keystroke to Gemini.

Use:

```text
local parser
    ↓
confidence >= threshold → use local result
    ↓
otherwise
    ↓
Gemini intent extraction
```

For example, local parsing handles:

```text
short gold 4550 target 4500 0.01 lot
```

without network latency or API cost.

Gemini becomes useful for things like:

```text
I just put another thousand dollars into my trading account

sold gold around 4550 with 0.01 lots aiming for 4500

switch the app back to whatever theme my computer uses
```

As of September 2026, `gemini-3.1-flash-lite` has a Gemini Developer API free tier; its paid pricing is currently $0.25/1M text-input tokens and $1.50/1M output tokens. ([Google AI for Developers][1]) That is more than sufficient for this tiny intent-extraction workload.

Gemini also supports structured outputs using JSON Schema/Zod, which is exactly what you want here rather than parsing arbitrary model prose. ([Google AI for Developers][2])

Define one union schema:

```ts
z.discriminatedUnion("intent", [
  createTradeIntent,
  accountEntryIntent,
  navigationIntent,
  themeIntent,
  unknownIntent,
])
```

and ask Gemini only to extract into that.

Importantly:

```text
Gemini identifies intent + parameters
                 ↓
your code validates them
                 ↓
your application executes them
```

Gemini should never directly decide to execute a database mutation.

Put the Gemini call in a TanStack server function, for example:

```text
src/server/commandIntentActions.ts
```

and keep `GEMINI_API_KEY` server-side.

There is also a privacy consideration: Google's current pricing documentation says free-tier content can be used to improve its products, while paid-tier content is not. ([Google AI for Developers][3]) Since these commands can contain trading activity, I would use local parsing for the vast majority of requests regardless.

## Phase 3 — Speech input

Keep this separate from the command architecture.

The architecture should simply be:

```text
Microphone
   ↓
speech → text
   ↓
same command input
   ↓
same intent pipeline
```

Do not create a separate “voice command system.”

UI:

```text
┌──────────────────────────────────────────┐
│ Search or tell JotTrade what to do   🎙 │
├──────────────────────────────────────────┤
│ Log a trade                              │
│ Go to Journal                            │
│ Add deposit                              │
└──────────────────────────────────────────┘
```

While listening:

```text
● Listening…
"short gold four five five zero..."
```

Then the transcript simply populates the normal palette input and goes through the exact same parser.

I would not implement Phase 3 until Phases 1–2 feel good. Voice transcription is an input mechanism; the difficult and valuable part is the command/intention architecture underneath it.

Gemini can accept audio as well, and Flash-Lite currently has free-tier input plus paid audio input priced at $0.50/1M tokens. ([Google AI for Developers][1]) But I would evaluate browser-native speech recognition first for a lightweight implementation, then use server-side transcription only if browser consistency is unacceptable.

### The UX I would ship

The important design is this:

```text
⌘K
 ↓
Type anything
 ↓

"short gold 4550 target 4500 0.01 lot"

┌───────────────────────────────────────────────┐
│ short gold 4550 target 4500 0.01 lot         │
├───────────────────────────────────────────────┤
│ ↑ Create XAUUSDM short trade                 │
│                                               │
│   SHORT · 0.01 lot                            │
│   Entry 4,550 · Target 4,500                  │
│   Main account                                │
│                                      Enter ↵  │
├───────────────────────────────────────────────┤
│   Go to Journal                               │
└───────────────────────────────────────────────┘
```

That gives you the Raycast feel without turning JotTrade into an AI application.

My implementation order would therefore be: **Phase 1 first and fully usable, Phase 2 as an intelligent fallback, Phase 3 only after the keyboard UX is proven.** The existing repo already contains the important backend operations, so most of the work is command matching, parameter extraction, preview/confirmation, and a small `targetPrice` extension rather than new backend architecture.

[1]: https://ai.google.dev/gemini-api/docs/pricing?authuser=451499271&utm_source=chatgpt.com "Gemini Developer API pricing  |  Gemini API  |  Google AI for Developers"
[2]: https://ai.google.dev/gemini-api/docs/structured-output?authuser=14&hl=en&utm_source=chatgpt.com "Structured outputs  |  Gemini API  |  Google AI for Developers"
[3]: https://ai.google.dev/gemini-api/docs/pricing?authuser=00&hl=en&utm_source=chatgpt.com "Gemini Developer API pricing  |  Gemini API  |  Google AI for Developers"
