---
name: JotTrade
description: A quiet, data-led trading workspace built for fast capture and clear review.
colors:
  canvas-light: "oklch(1 0 0)"
  ink-light: "oklch(0.141 0.005 285.823)"
  canvas-dark: "oklch(0.108 0.004 285.823)"
  surface-dark: "oklch(0.21 0.006 285.885)"
  ink-dark: "oklch(0.985 0 0)"
  structural-muted: "oklch(0.274 0.006 286.033)"
  structural-border: "oklch(1 0 0 / 10%)"
  action-blue: "oklch(0.707 0.165 254.624)"
  profit-green: "oklch(0.696 0.175 145)"
  loss-red: "oklch(0.704 0.191 22.216)"
  warning-amber: "oklch(0.769 0.171 57)"
typography:
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.05em"
  data:
    fontFamily: "Anonymous Pro, Courier New, monospace"
    fontSize: "inherit"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: JotTrade

## Overview

**Creative North Star: "The Quiet Trading Terminal"**

JotTrade is a data-led operational workspace: minimal, intuitive, subtle, and quietly fun. The Vercel product interface is the primary language—compact navigation, crisp dividers, restrained color, and dense information made easy to scan. Personality comes from precise data typography, the faint dark-mode dot grid, responsive feedback, and small moments of delight rather than decorative spectacle.

The incumbent implementation is dark-first but supports a complete light theme. Open space, headings, and dividers establish hierarchy before containers do. Cards represent real conceptual groups; they are not a default wrapper for every section. The system should feel robust during long sessions and remain clear on mobile.

**Key Characteristics:**

- Quiet neutral canvas with a sparse blue action accent.
- Compact, purposeful information density.
- Crisp one-pixel borders and mostly flat surfaces.
- Monospaced, tabular numbers for trading data.
- Profit, loss, and warning colors reserved for meaning.
- Small functional transitions and progressive disclosure.

## Colors

The palette is a cool zinc-neutral system with one blue interaction accent and semantic market colors.

### Primary

- **Action Blue** (`oklch(0.707 0.165 254.624)` dark; `oklch(0.623 0.207 254.28)` light): primary actions, focus rings, links, and the blue chart ramp. Its rarity preserves priority.

### Secondary

- **Profit Green** (`oklch(0.696 0.175 145)` dark): positive P&L and successful states.
- **Loss Red** (`oklch(0.704 0.191 22.216)` dark): negative P&L, destructive actions, and errors.
- **Warning Amber** (`oklch(0.769 0.171 57)` dark): caution and pending attention.

### Neutral

- **Night Canvas** (`oklch(0.108 0.004 285.823)`): dark application background.
- **Zinc Surface** (`oklch(0.21 0.006 285.885)`): dark cards, panels, and popovers.
- **Quiet Structure** (`oklch(0.274 0.006 286.033)`): muted fills and selected navigation.
- **Hairline Border** (`oklch(1 0 0 / 10%)`): dark separators and container edges.
- **Paper Canvas** (`oklch(1 0 0)`): light application and card background.
- **Near-black Ink** (`oklch(0.141 0.005 285.823)`): primary light-theme text.

### Named Rules

**The Semantic Color Rule.** Green, red, and amber communicate trading or system state; they do not decorate neutral content.

**The Sparse Blue Rule.** Blue marks interaction, selection, or a primary data series. Avoid spreading it across passive surfaces.

## Typography

**Display Font:** Plus Jakarta Sans with system-ui fallback  
**Body Font:** Plus Jakarta Sans with system-ui fallback  
**Data Font:** Anonymous Pro with Courier New fallback

**Character:** Plus Jakarta Sans keeps the interface contemporary and approachable. Anonymous Pro separates figures, prices, and performance data from explanatory copy while its tabular numerals stabilize changing values.

### Hierarchy

- **Headline** (700, 30px, 1.2): page titles with tight tracking.
- **Metric** (700, 24–30px): prominent values; use `.font-data` when the value is financial or tabular.
- **Title** (600, 14–16px): card and section titles.
- **Body** (400, 14px, 1.5): controls, descriptions, and table content.
- **Label** (600, 12px, tracked uppercase where useful): compact categories and metric labels.

### Named Rules

**The Data Voice Rule.** Use the mono face for values that benefit from tabular alignment, not for paragraphs or ordinary navigation.

## Layout

Authenticated screens use a fixed desktop sidebar and a bottom navigation bar below the `md` breakpoint. Content generally uses `16px` padding on mobile and `32px` on large screens, with a `max-width: 80rem` dashboard container. Grids progress from one column to two, three, or four columns as space permits. The recurring spacing rhythm is 4, 8, 16, 24, and 32px.

Keep primary content in the open canvas. Use bordered groups for related metrics, tables, forms, and actionable objects. Preserve compact density in data-heavy views, then collapse grids and move secondary controls behind disclosure on small screens. Mobile is a complete operating surface, not a compressed desktop screenshot.

## Elevation & Depth

The system is flat by default. Canvas, inline panels, cards, tables, and inputs rely on tonal difference and crisp one-pixel borders. Shadows communicate a surface that actually sits above another layer: dropdowns, popovers, tooltips, dialogs, drawers, and transient dragged or focused states. Use the lowest elevation that makes the relationship clear.

### Shadow Vocabulary

- **Control Hairline** (`0 1px 2px rgba(0,0,0,0.05)`): the existing `shadow-xs` treatment on outlined controls and fields; omit when the border is sufficient.
- **Floating Surface** (`0 4px 12px rgba(0,0,0,0.18)`): menus and popovers.
- **Modal Surface** (`0 10px 30px rgba(0,0,0,0.28)`): dialogs and drawers over a backdrop.

### Named Rules

**The Meaningful Elevation Rule.** A shadow must explain overlap, focus, or movement. In-flow surfaces stay flat.

## Shapes

The base radius is 8px, yielding a restrained 4–12px family. Standard controls use 6px corners, operational cards use 8px, and larger dialogs may use 12px. Small status marks may be circular; ordinary actions and filters remain compact rounded rectangles rather than pills. Thin borders and rectilinear grids carry the technical character.

## Components

Controls are quiet at rest and become more explicit on hover, focus, selection, or error.

### Buttons

- **Shape:** compact 6px corners; 32, 36, or 40px heights.
- **Primary:** solid Action Blue with high-contrast text.
- **Hover / Focus:** increase fill contrast on hover; use a visible 3px translucent blue focus ring.
- **Secondary / Ghost:** bordered or neutral-fill secondary actions; ghost treatment for tertiary actions.

### Chips

- **Style:** small 12px labels with compact padding and 4–6px corners.
- **State:** neutral by default; selected filters gain a stronger surface or sparse blue emphasis. Semantic colors only reflect real status.

### Cards / Containers

- **Corner Style:** 8px for operational cards; 12px exists in the generic primitive but should be used deliberately.
- **Background:** canvas or Zinc Surface depending on theme and hierarchy.
- **Shadow Strategy:** flat for inline content; see Meaningful Elevation Rule.
- **Border:** one-pixel Hairline Border.
- **Internal Padding:** normally 16–20px for dense metrics and 24px for larger compositions.

### Inputs / Fields

- **Style:** 36px tall, 6px corners, quiet fill, one-pixel border, 12px horizontal padding.
- **Focus:** stronger Action Blue border with a 3px translucent ring.
- **Error / Disabled:** destructive border plus written error text; disabled controls retain their shape at reduced opacity.

### Navigation

Desktop navigation occupies a narrow persistent sidebar with 32px rows, 16px icons, and a subtle selected fill. Mobile uses a fixed bottom bar with safe-area padding and concise labels. Active state is visible through fill, contrast, and weight rather than color alone.

### Data Surfaces

Charts, metric grids, calendars, and tables favor alignment and comparison. Use mono tabular numerals for financial values, fine dividers for rows and cells, and minimal chart decoration. Positive and negative states combine color with signs or labels.

## Do's and Don'ts

### Do:

- **Do** let data and task hierarchy determine the layout.
- **Do** use whitespace, headings, and dividers before adding another container.
- **Do** preserve compact density while keeping controls comfortably operable.
- **Do** reveal advanced filters and secondary actions progressively.
- **Do** reserve shadows for surfaces that overlap or move above content.
- **Do** make hover, focus, active, error, loading, and empty states explicit.
- **Do** include occasional subtle, functional moments of fun.

### Don't:

- **Don't** wrap every section in a card.
- **Don't** use large ambient shadows on in-flow cards or settings groups.
- **Don't** use gradients, glass effects, oversized radii, or decorative icon tiles as default styling.
- **Don't** give primary, secondary, destructive, and tertiary actions equal visual weight.
- **Don't** use semantic market colors as decoration or as the only carrier of meaning.
- **Don't** sacrifice information density for oversized headings or empty space.
- **Don't** copy the secondary inspiration images' marketing-page composition into operational screens.
