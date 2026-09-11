---
name: JotTrade
description: A restrained, information-dense trading journal that keeps the data in front and the interface out of the way.
colors:
  canvas-light: "oklch(1 0 0)"
  canvas-dark: "oklch(0.185 0.008 260)"
  surface-light: "oklch(1 0 0)"
  surface-dark: "oklch(0.215 0.009 260)"
  ink-light: "oklch(0.22 0.01 260)"
  ink-dark: "oklch(0.95 0.003 260)"
  muted-light: "oklch(0.5 0.012 260)"
  muted-dark: "oklch(0.7 0.01 260)"
  accent-blue: "oklch(0.55 0.17 256)"
  profit-green: "oklch(0.52 0.14 150)"
  loss-red: "oklch(0.55 0.19 27)"
  warning-amber: "oklch(0.67 0.16 70)"
typography:
  page-title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.25
  metric:
    fontFamily: "Azeret Mono, SFMono-Regular, monospace"
    fontSize: "1.5rem"
    fontWeight: 600
    letterSpacing: "-0.02em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-blue}"
    textColor: "oklch(0.99 0 0)"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink-light}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  surface:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: JotTrade

## Overview

JotTrade is a working tool, not a showpiece. The interface earns trust by being
familiar, dense, and quiet. A trader should be able to scan a screen and read
the numbers without decoding a visual metaphor first.

The reference language is restrained product UI in the manner of Vercel, Exness
Personal Area, and StonkJournal: neutral grounds, thin dividers, sentence-case
labels at readable sizes, and a single accent reserved for action and focus.

**Key characteristics:**

- Neutral grounds in both themes. Chroma stays at or below 0.015.
- One accent blue for primary action, selection, and focus.
- Market colors carry meaning only. Green is profit, red is loss.
- Monospace for figures, proportional sans for everything else.
- Rounded corners at 6-8px. Nothing is square by doctrine.

## Colors

### Grounds

Light mode uses a pure white canvas with white surfaces separated by hairline
borders. Dark mode uses a near-neutral dark ground at `oklch(0.185 0.008 260)`
with surfaces one step lighter.

Every dark surface stays within 0.008 to 0.012 chroma. That range keeps the
theme reading as neutral rather than blue.

### Accent

Accent blue `oklch(0.55 0.17 256)` marks the primary action, the current
selection, and the focus ring. It never decorates.

### Market colors

- **Profit green** for positive P&L.
- **Loss red** for negative P&L.
- **Warning amber** for caution states.

These appear only where the data gives them meaning. A green value always means
money was made.

## Typography

Archivo carries the interface. Azeret Mono carries figures, with
`tabular-nums` so columns of numbers align.

Sizes are fixed rem values, not fluid clamps. Product UI is viewed at a
consistent size, and a heading that shrinks inside a panel looks worse, not
better. The one exception is the marketing landing page, where a display clamp
is appropriate.

Labels are sentence case at 13px. Uppercase tracked micro-labels are not part
of this system.

## Layout

### Page structure

Every screen opens with a title, an optional description, an optional action on
the right, and an optional toolbar row underneath for filters and controls.
`AppPageHeader` owns this pattern.

### Density

Metrics sit in compact rows of four, each with a label, a value, and an optional
supporting line. There is no hero metric. The largest element on a screen should
be the data the user came to read.

Charts fill their container. A chart pinned to a fixed height inside a stretching
grid row leaves dead space, so chart wrappers size to their own content.

### Containers

`.surface` is the standard container: rounded, hairline border, card ground. Use
it for a coherent region, not as a wrapper around every paragraph.

The page canvas carries no texture or grid. Cards and sheets stay opaque so
dense content remains legible.

## Components

Every interactive component carries default, hover, focus, active, and disabled
states. Buttons are medium weight, 36px tall, with a 6px radius. Inputs match
that height and radius on an opaque ground.

Table headers are sentence case at 13px in muted ink. Rows stay dense.

## Motion

Motion reports state; it does not perform. Page content fades and rises 4px over
180ms on mount. Transitions run 150-250ms. Every animation respects
`prefers-reduced-motion`.

There are no orchestrated page-load sequences.

## Do's and Don'ts

**Do**

- Put a control row under the title when a screen has something to filter.
- Reserve accent blue for action, selection, and focus.
- Use monospace with tabular figures for any aligned number.
- Explain a metric with a short supporting line under its value.

**Don't**

- Number the navigation, or any list that is not genuinely a sequence.
- Add uppercase tracked micro-labels above sections.
- Put a decorative rule, grid, or marker on a surface.
- Size product headings with a fluid clamp.
- Let a translucent surface sit over a textured ground.
