# Command system: phase 1 handoff

> **Historical.** This document records past work. Its instructions are not active, and its file paths and status may be out of date. For the current state, read [README.md](../../README.md), [AGENTS.md](../../AGENTS.md) and [docs/feature-map.md](../feature-map.md).

Phase 1 is implemented. Begin phase 2 from the committed phase 1 code. The original feature plan is in `docs/plans/command-system.md`.

## User instructions

Use Bun, including `bunx`, rather than pnpm. Commit completed increments with Conventional Commit messages. Complete phases in order, with a handoff document and a new Codex task for each next phase. Do not push or deploy. The coordinating task will integrate each phase and create the next task. Repository AGENTS.md applies; do not spawn subagents.

## Implemented behavior

- Global authenticated palette inside the root ThemeProvider, opened with Cmd+K/Ctrl+K, the sidebar Commands button, or mobile Account > Commands.
- Registry reuses `navItems`; navigation, themes, trade logging, deposits, and withdrawals.
- Local parsers and ranked matching in `src/lib/commands/`. Gold/xau/xauusd map to XAUUSDM. Quantities remain lots for supported instruments; no multiplication during input.
- Write candidates always open `command-preview.tsx`. Users can edit missing fields and choose an account. The reviewed account is frozen when the preview opens, currencies must match, and duplicate saves are blocked. Mutations use existing authentication and ownership checks. Withdrawals are negative cash flows.
- Nullable `trades.target_price`, typed createTrade input validation, optional target in manual entry and trade details. Target alone never closes a trade or changes realized P&L.
- Migration `drizzle/0006_amusing_kylun.sql` and snapshot are generated but NOT applied to a database. Apply with `bun run db:migrate` against the intended environment before running DB-backed trade queries with this schema. Database destination was not verified, so no environment was mutated.

## Verification

- Full Vitest suite: 121 tests passed before adding the eight server target tests. The additional eight target tests passed separately.
- Parser, confirmation, and keyboard tests cover supplied examples, incomplete commands, malformed data, navigation, themes, authentication gating, explicit write confirmation, duplicate clicks, error retention, currency mismatch, target persistence, and server authorization.
- Biome passes for all new code. Existing files have pre-existing lint findings, including the inline theme initialization script and `any` types.
- `bunx tsc --noEmit` leaves six errors exactly matching an untouched baseline archive: Header.tsx stale demo link; StrategyForm.tsx two server input errors; StrategyList.tsx server input; gcp.ts tuple typing; demo/start.ssr.spa-mode.tsx initial state.
- Existing localhost server redirects the browser to sign-in. Authenticated visual/real database interaction has not been verified. A second dev server could not start because the existing TanStack devtools port 42069 is occupied. Do not kill the user's server.
- Impeccable mechanical detector reported no findings for the new palette files. Existing visual tokens and controls were preserved.

## Phase 2 instructions

Implement Gemini as an explicit fallback for ambiguous input, keeping high-confidence local commands local. Confirm current model/API details against Google's primary docs; the original plan's pricing/model claims are not verified facts.

1. Add one runtime-validated discriminated intent schema covering trade, account entry, navigation, theme, and unknown. Reuse the existing command types/registry where possible, and constrain routes/themes/actions to the supported list.
2. Add an authenticated TanStack server function for intent extraction. Keep GEMINI_API_KEY server-side. Send only the command being interpreted, not account/trade history or credentials. Bound input, response handling, timeout, and errors. Never let model output execute writes or select someone else's account.
3. Expose a deliberate fallback action for uncertain input, not a request per keystroke. Explain that using it sends the command text to Google. Missing keys, failures, stale responses, and invalid results must leave local commands usable.
4. Route validated extracted intents to the same preview/confirmation path. Keep amounts, quantity units, currencies, targets, and required missing fields intact. Do not silently invent trade values.
5. Add focused mocked tests for local bypass, ambiguous extraction, invalid response, auth, missing key, errors and confirmation. Use Bun. Compare typecheck/lint findings with the baseline rather than fixing unrelated files.
6. Commit phase 2 and create `docs/handoffs/command-phase-2.md` describing changes, checks, configuration and phase 3 instructions. Return the commit hashes and handoff path to the coordinating task. It will integrate phase 2 and create the phase 3 task.

Phase 3 adds browser-native speech-to-text as input to this same palette. It must preserve confirmation, provide unsupported-browser/error/listening states, stop recording on close/unmount, and avoid automatically saving transcripts. The user has authorized proceeding through all phases; no renewed implementation approval is needed.
