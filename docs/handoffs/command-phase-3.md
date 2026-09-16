# Command system: phase 3 handoff

Phase 3 is implemented. All three phases of `docs/plans/command-system.md` are now complete. Earlier handoffs are in `docs/handoffs/command-phase-1.md` and `docs/handoffs/command-phase-2.md`.

Commit: `f9c71c4` — `feat: add speech input to the command palette`

## User instructions

Use Bun, including `bunx`, rather than pnpm. Commit completed increments with Conventional Commit messages. Do not push or deploy. Repository AGENTS.md applies; do not spawn subagents.

## Implemented behavior

- `src/hooks/use-speech-input.ts` wraps the browser `SpeechRecognition` / `webkitSpeechRecognition` API. No dependency was added. The app sends no audio to any JotTrade server.
- Speech is an input mechanism only. The transcript goes into the palette input through `changeQuery`, so it runs the same local matcher, the same Gemini fallback and the same preview as typed text. There is no second command path.
- Confirmation is unchanged. A transcript never saves a trade or an account entry. A test asserts this directly.
- States: the microphone button is hidden when the API is missing; `aria-pressed` and a stop icon mark the listening state; a live row shows the interim transcript; errors appear in the same alert area the Gemini fallback uses.
- Recognition stops when the user presses stop, when a final transcript arrives, when the preview opens, when the palette closes, when the component unmounts, on any error, and when the browser ends the session by itself. `stop()` detaches the handlers before it calls `abort()`, so a late event cannot act.
- Permission is requested only when the user starts dictation, because the browser prompts on `start()`. A denied permission, a missing microphone, silence, a network failure and a throwing `start()` each map to a readable message.
- `supported` resolves in an effect after mount, not during render, so the server and the client produce the same markup.

## Privacy note

The listening row states that most browsers send the audio to their own speech service. This is accurate: Chrome and Safari perform recognition server-side, so "the audio never leaves the device" would have been false. The Gemini fallback carries its own separate disclosure.

## Configuration

Nothing new. `GEMINI_API_KEY` from phase 2 stays optional and server-side. Dictation needs no key and no configuration.

## Verification

- `bun run test`: 22 files, 177 tests passed. Phase 3 adds 15 tests in `command-palette-speech.test.tsx`, driven by a stubbed recognition class: unsupported browser, both global names, no instance before the first click, interim then final transcript, no automatic save, and stop on preview, close, unmount, user stop, four error codes, a throwing `start()`, and a self-ended session.
- `bunx tsc --noEmit`: six errors, identical to the phase 1 and phase 2 baseline (Header.tsx, StrategyForm.tsx x2, StrategyList.tsx, gcp.ts, demo/start.ssr.spa-mode.tsx). No new errors.
- `bunx biome check` passes for all new and changed files.
- No live Gemini call, no live microphone, no database change.
- The phase 1 migration `drizzle/0006_amusing_kylun.sql` is still generated and NOT applied. Apply it with `bun run db:migrate` against the intended environment before running DB-backed trade queries.
- Authenticated browser interaction remains unverified across all three phases. Do not kill the user's dev server; TanStack devtools port 42069 is occupied.

## Browser support limits

- `SpeechRecognition` is unprefixed in recent Chrome and Edge and prefixed in Safari. The hook accepts both names.
- Firefox does not ship the API by default. The microphone button is simply absent there, and the palette works as it did in phases 1 and 2.
- Recognition is fixed to `lang = "en-US"`, because the local parsers and the Gemini instructions are English. A non-English user gets poor transcripts. Make the language configurable before any localization work.
- Recognition runs with `continuous = false`, so one press captures one command. Long dictation is out of scope.

## Remaining work and open decisions

None of these block use. Decide on them from real usage:

- Fallback tuning: the 0.9 threshold is untuned. A partially parsed command such as `short gold` scores 0.75 and therefore also offers the Gemini fallback.
- Gemini results replace local candidates rather than joining the ranked list, and they carry a flat 0.9 confidence.
- Instrument aliases are still the three entries in `aliases.ts`. Account-specific aliases remain out of scope.
- `extractCommandIntent` has no rate limit beyond the deliberate click.
- Dictation language is fixed, as noted above.
- Server-side transcription was not needed. Evaluate it only if browser behaviour proves unacceptable in real use; it would require sending audio to a server, which the current design avoids.
