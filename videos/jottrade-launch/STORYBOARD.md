---
duration: 45
format: 1920x1080
fps: 30
music: none
captions: skipped (on-screen copy is designed for muted playback)
---

# JotTrade — 45-second product showcase

Promise: every trade leaves a lesson, and JotTrade helps you read it.
Arc: hook → capture → understand → review → brand. One camera, one window language, carousel hand-offs.
Every screen is a real capture of the app on the local dev database with the fictional "Demo Trader" seed.

## Video direction

- Palette: canvas `#0b0c0f`, ink `#f2f4f7`, muted `#9aa3b2`, accent `#4c8df6` (the app's primary blue). Green and red appear only where the product shows profit and loss.
- Type: Archivo 600 for headlines, Archivo 400 for subs, Azeret Mono for labels and figures (the app's own fonts).
- Motion: long-tail `power3` eases, no bounce. Each headline enters word by word. Each scene pushes in once, then holds the read. Scene hand-offs are a carousel with matched speed.
- Held reads: the import summary (8.4–12.4s), the curve after it draws (18.9–19.4s), the plan-adherence result (35.5–37.1s), and the end card (42.2–45s).
- Do not use: bounce, looping "breathing" motion, particles, stock imagery, or invented features or metrics.

## Frames

| # | Time | On-screen copy | Visual | Motion |
|---|------|----------------|--------|--------|
| 1 | 0.0–5.0 | "Every trade leaves a lesson." / "Most traders never read it." → JotTrade / "Your private trading journal." | Type on the dark grid, then the logo lockup | Words reveal one by one. The first line dims and rises. The crosshair mark draws itself. A low impact plays at 3.55s. |
| 2 | 4.6–14.4 | 01 Capture — "Bring every trade in." / "Import your Exness MT4/MT5 history, or log a trade by hand." → "Every record checked before it saves." | Journal (`journal.png`). A cursor clicks Import CSV. The real import preview (`import-preview.png`) shows "10 source records · 10 insert". | The window rises in 3D. Click with a ripple. The camera pushes into the summary and an accent ring appears. It holds, then zooms out. |
| 3 | 13.7–25.4 | 02 Understand — "See what is working." → "Every day, in the rhythm it happened." / "Green and red days on one calendar." | Dashboard (Trading P&L view), then the September calendar | Carousel in from the right. The metrics count up to the real values. The equity curve draws under a scan line. The calendar slides over the dashboard, and traded days fill in by date. |
| 4 | 24.8–37.4 | 03 Review — "Check each trade against your playbook." → "Write down the one change." → "Then see what your rules are worth." | Playbook check on a London Breakout trade (four Followed clicks, Save check → "Followed plan"). The daily review notes for 9 Oct fill in. London Breakout plan adherence: Followed 76.5% win rate (+$1,016.80) vs Broke 28.6% (−$270.50). | A cursor clicks each rule (click sounds), and the save plays a chime. The notes appear with a left-to-right reveal, one prompt at a time. The camera zooms to the adherence cards. A green ring marks Followed, a red ring marks Broke, and Not checked dims. |
| 5 | 37.2–45.0 | "Capture / Understand / Review" → JotTrade / "Journal every trade. Learn from every one." / "Start your journal" | A three-window fan (calendar, dashboard, plan adherence), then the brand lockup | The review window glides into the fan and the other two fly in. The fan recedes and blurs. The mark draws again. The tagline and the CTA arrive, then hold for about 2.8s. |

## Sound

Generated interface effects only, no licensed music: `assets/sfx/click.wav`, `whoosh.wav`, `impact.wav`, `chime.wav` (made with ffmpeg `aevalsrc`/`anoisesrc`). Each cue is an `<audio>` element at the end of `index.html`.
