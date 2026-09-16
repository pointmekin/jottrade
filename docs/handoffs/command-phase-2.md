# Command system: phase 2 handoff

Phase 2 is implemented. Begin phase 3 from the committed phase 2 code. The original feature plan is in `docs/plans/command-system.md`. The phase 1 handoff is in `docs/handoffs/command-phase-1.md`.

Commit: `da2c9ee` — `feat: add gemini fallback for ambiguous commands`

## User instructions

Use Bun, including `bunx`, rather than pnpm. Commit completed increments with Conventional Commit messages. Complete phases in order, with a handoff document and a new task for each next phase. Do not push or deploy. The coordinating task will integrate each phase and create the next task. Repository AGENTS.md applies; do not spawn subagents.

## Implemented behavior

- `src/lib/commands/intent-schema.ts` holds one Zod object schema, `extractedIntentSchema`, plus `intentJsonSchema` and `toCommandCandidate`. Both schemas derive their accepted routes, themes and entry kinds from `navItems` and `AccountEntryKind`, so the model can never return a route or kind the app does not support. `ADJUSTMENT` is excluded.
- Prices, quantities and amounts are accepted only as unsigned plain decimal strings. Signed, formatted and prose values fail validation.
- `toCommandCandidate` reuses the phase 1 `CommandCandidate` type and `resolveCommandSymbol`. Quantities stay lots, currencies are upper-cased, and missing fields stay `undefined`. Write candidates carry a warning that names Gemini.
- `src/server/commandIntentActions.ts` exposes `extractCommandIntent`, an authenticated POST server function. It checks the Better Auth session first, then the key, then the length bound, and only then calls Gemini. It sends the instruction text and the command only. It never sends the session, account or trade data.
- The fallback is deliberate, not per keystroke. `command-palette.tsx` shows an "Interpret with Gemini" item only when the command is non-empty and the best local confidence is below `LOCAL_CONFIDENCE_THRESHOLD` (0.9). The item states that the text goes to Google.
- Validated intents route through the existing paths. Trades and account entries open `CommandPreview` for confirmation; navigation and theme apply directly, as they do for local commands.
- Every failure — missing key, network error, error status, empty body, malformed JSON, invalid intent, unsupported intent — sets an inline alert and leaves local commands usable. Editing the command clears the alert and discards any in-flight response, so a stale answer can never act.

## Configuration

- `GEMINI_API_KEY` is optional and server-side only. It is documented in `.env.example`. Never add a `VITE_` prefix; that would ship the key to the browser.
- Without the key, the palette works exactly as it did in phase 1 and the fallback reports that interpretation is not configured.

## Verified API facts

Checked against Google's primary docs on 2026-09-16, because the original plan's model and pricing claims were not verified:

- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/interactions`, auth header `x-goog-api-key`. This is the current API; `generateContent` is the older shape.
- Structured output uses `response_format: { type, mime_type, schema }` with a JSON Schema object.
- Generated text is at `steps[].content[].text` for the `model_output` step. The code also accepts `output_text`.
- Model: `gemini-3.5-flash-lite`, a stable lightweight model.
- System-instruction and output-token fields were not documented on the pages read, so the instructions live in `input` and no unverified field is sent. Confirm those fields before adding them.

## Verification

- `bun run test`: 21 files, 162 tests passed. Phase 2 adds 33 tests across `command-intent.test.ts` (schema and mapper), `command-intent-server.test.ts` (auth, missing key, length bound, payload contents, six failure modes) and `command-palette-fallback.test.tsx` (no call until selected, hidden for confident local commands, confirmation kept, error recovery, unsupported intent, stale response discarded).
- `command-palette.test.tsx` now mocks `@/server/commandIntentActions`. Without the mock the real module pulls `@/lib/auth` and `@/db` into the test and throws on a missing `DATABASE_URL`.
- `bunx tsc --noEmit`: six errors, identical to the phase 1 baseline (Header.tsx, StrategyForm.tsx x2, StrategyList.tsx, gcp.ts, demo/start.ssr.spa-mode.tsx). No new errors.
- `bunx biome check` passes for all new and changed files.
- No live Gemini call was made; every test mocks `fetch`. No database was mutated. The phase 1 migration `drizzle/0006_amusing_kylun.sql` is still generated and NOT applied — apply it with `bun run db:migrate` against the intended environment before running DB-backed trade queries.
- Authenticated browser interaction was not verified. Do not kill the user's dev server; TanStack devtools port 42069 is occupied.

## Phase 3 instructions

Add browser-native speech-to-text as an input to the same palette. Speech is an input mechanism only. Do not build a second command system.

1. Transcribe with the browser `SpeechRecognition` / `webkitSpeechRecognition` API. Do not add a dependency and do not send audio to a server. Evaluate server-side transcription only if browser behaviour proves unacceptable, and report that finding rather than adding it silently.
2. Put the transcript into the existing palette input through `changeQuery`, so it runs the same local matcher and the same Gemini fallback. Never create a separate voice path.
3. Confirmation must stay. A transcript must never save a trade or an account entry on its own.
4. Provide clear states: idle, listening with the interim transcript visible, error, and unsupported browser. Hide or disable the microphone when the API is missing, and do not fail the palette.
5. Stop recognition when the palette closes, when the component unmounts, when the preview opens, and on error. Leaving a live microphone open is a defect.
6. Request microphone permission only when the user starts dictation. Handle a denied permission with a readable message.
7. Add focused mocked tests with a stubbed recognition object: unsupported browser, start and stop, transcript reaching the input, permission denied, error recovery, and cleanup on close and unmount. Use Bun. Compare typecheck and lint findings with the baseline above rather than fixing unrelated files.
8. Commit phase 3 and create `docs/handoffs/command-phase-3.md` describing changes, checks, configuration, browser support limits, and any remaining work. Return the commit hashes and the handoff path to the coordinating task.

The user has authorized proceeding through all phases; no renewed implementation approval is needed.

## Known limits and candidate follow-up work

Not defects, but worth deciding on after phase 3:

- The 0.9 threshold is a single constant. A partially parsed local command, such as `short gold`, scores 0.75 and therefore also offers the fallback. That is intended, but it is untuned against real use.
- `toCommandCandidate` sets a flat 0.9 confidence. It does not currently rank a Gemini result against local candidates, because it replaces them rather than joining the list.
- Instrument aliases are still the three entries in `aliases.ts`. Account-specific aliases remain out of scope.
- No rate limit sits in front of `extractCommandIntent` beyond the deliberate click. Add one if the fallback proves popular.
