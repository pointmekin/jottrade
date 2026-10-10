# Frame — JotTrade

Derived from the repository's `DESIGN.md` and `src/styles.css` (dark theme).

| Role | Value | Use |
|------|-------|-----|
| canvas | `#0b0c0f` | Video ground, one step darker than the app (`#111316`) so that windows separate |
| ink | `#f2f4f7` | Headlines |
| muted | `#9aa3b2` | Subs, labels, tagline |
| accent | `#4c8df6` | The app's primary blue: logo tile, focus rings, scan line, CTA |
| profit | `#4cc27a` | Only the "Followed" adherence ring |
| loss | `#f0605d` | Only the "Broke" adherence ring |

- Display and body font: Archivo (`assets/fonts/Archivo.woff2`, variable weight).
- Mono font: Azeret Mono (`assets/fonts/AzeretMono.woff2`) for eyebrows, pillars, and figures.
- Corners: 18px on product windows, 10px on rings, 12px on the CTA, 28px on the logo tile.
- Logo: the lucide `Crosshair` icon on an accent tile, as in `src/components/app-sidebar.tsx`.
