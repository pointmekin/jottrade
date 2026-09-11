---
target: authenticated app / dashboard
total_score: 16
p0_count: 1
p1_count: 3
timestamp: 2026-09-11T19-26-42Z
slug: src-routes-authenticated-dashboard-tsx
---
## Design Health Score: 16/40 (needs significant rework)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Full-page spinner not skeletons; useQuery error state never read on data surfaces |
| 2 | Match System / Real World | 1 | Architectural jargon over trading domain: "Project index", "JT-01", "Equity section", "Datum" |
| 3 | User Control and Freedom | 2 | No time-range control anywhere; "ALL RECORDED HISTORY" is static text |
| 4 | Consistency and Standards | 2 | Four competing containers; rounded bars inside a square system |
| 5 | Error Prevention | 2 | Calculator renders raw float 13466.800000000007 |
| 6 | Recognition Rather Than Recall | 1 | Collapsed sidebar shows 01-04 not icons; 25 instances of 9-10px text; no metric tooltips |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts despite PRODUCT.md principle 4; no export; no filters |
| 8 | Aesthetic and Minimalist Design | 1 | 72px "Today", 38 eyebrows, ~400px dead space, decorative datum line |
| 9 | Error Recovery | 2 | Auth forms handle errors; data surfaces do not |
| 10 | Help and Documentation | 2 | Good empty states; zero metric explanation |

## Anti-Patterns Verdict

Detector: 6 findings, all in src/routes/demo/* starter files. Zero in app surfaces.

Four absolute-ban violations the detector does not cover:
1. Numbered section markers (01/02/03/04 sidebar)
2. Tiny uppercase tracked eyebrows (38 instances)
3. The hero-metric template (dashboard top band)
4. Fluid display headings in product UI (clamp to 4.5rem)

Root cause: PRODUCT.md commits to a Vercel-led restrained product language. The shipped "Section Desk" architectural-drafting world contradicts the brief.

## Priority Issues

- [P0] Collapsed sidebar clips icons/labels. app-sidebar.tsx:103 number span consumes the 16px content box left by size-8 + p-2.
- [P1] Dark mode chroma 0.030-0.065 vs the 0.005-0.015 tinted-neutral range; accent is 4.3x over. Warm hue-105 ink on cold hue-238 ground.
- [P1] ~400px dead space: grid row stretches to the taller right rail while the chart is pinned at h-[25rem]. Calculator occupies prime above-fold space.
- [P1] Chart bugs: XAxis has no interval/minTickGap (label smear); Tooltip has no cursor prop (gray block over bars).
- [P2] Inverted hierarchy: 72px uninformative "Today"; 25 instances of 9-10px labels; mono used for labels not just numerals.
- [P2] Datum line hardcoded left-1/2, aria-hidden, no selection logic. The system's signature device is decorative.

## Resolution

User chose: replace the design language toward Exness/StonkJournal references; move calculator off the dashboard rail and widen the chart; keep mono numerals for data, semantic market colors, and the empty states.
