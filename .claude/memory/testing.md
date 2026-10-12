# Testing notes

- Run one E2E spec with the verify setup: `npm run verify -- e2e/<spec>.ts` (add `--no-build` to skip the build, `-g "<name>"` to filter).
- Server function POST bodies are encoded. Do not match a request by a field value in `postData()`. Match by `method() === "POST"` and a one-shot flag.
- Do not call `page.unrouteAll` inside a route handler. It releases the current request to the server and the browser gets the response.
- To simulate a lost response: `await route.fetch(); return route.abort();`.
- E2E seed users: Erin is the user that specs write to. Bob has two accounts, but specs only read his server data. Use `localStorage`-only actions for Bob.
- jsdom tests share `localStorage` in one file. Call `localStorage.clear()` in `beforeEach` when a component writes drafts.
