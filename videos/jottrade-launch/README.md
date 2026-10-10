# JotTrade launch video (HyperFrames)

A 45-second, 1920×1080, 30 fps product showcase built with [HyperFrames](https://github.com/heygen-com/hyperframes).

- Final video: `renders/video.mp4`
- Composition: `index.html` (one GSAP timeline, sections marked `01`–`05`)
- Storyboard: `STORYBOARD.md`
- Brief and design tokens: `BRIEF.md`, `frame.md`

## Preview

```sh
cd videos/jottrade-launch
npx hyperframes@0.8.145 preview          # Studio in the browser
npx hyperframes@0.8.145 snapshot --at 9.5,17.8,28.3,35.8,44   # stills in snapshots/
```

## Render

```sh
npx hyperframes@0.8.145 lint
npx hyperframes@0.8.145 check
npx hyperframes@0.8.145 render --quality high --fps 30 --output renders/video.mp4
```

## Edit

- Copy: each headline and sub is plain text in `index.html` (`#s2-a`, `#s3-b`, …). Keep a headline to about seven words. It must stay inside the 470px text column.
- Timing: each beat has a time in seconds in the `<script>` block. A `data-start`/`data-duration` pair on each clip sets when it is visible. If you move a beat, move its clip window and its `<audio>` cue too.
- Camera: `POS` holds the window positions. `focus({x, y, w, h}, scale)` zooms to a rectangle in the 1600×1000 app capture (CSS pixels).
- Screens: `assets/screens/*.png` are 2× captures at a 1600×1000 viewport.

## Capture the screens again

The screens come from the real app on the local dev database. The demo user is fictional.

```sh
# from the repository root
npm run db:setup
npx tsx --env-file=.env videos/jottrade-launch/scripts/seed-demo.ts   # adds demo@jottrade.test
npx vite dev --port 3107 --strictPort &
node videos/jottrade-launch/scripts/capture-app.mjs http://localhost:3107
# copy the files you use from capture/screens/ to assets/screens/
```

Run `seed-demo.ts` again before each capture: the `trade` shot saves a playbook check, and the `review` shot writes notes.

Capture states that the video depends on:

- `dashboard-pnl-empty.png` hides the metric values and the curve, so the video can count up and draw them.
- `calendar-empty.png` hides the day results, so the traded days can fill in.
- `trade-check-0…4.png` and `review-note-1…4.png` are the same page after each click or note.
