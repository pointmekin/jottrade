import type { CSSProperties } from "react";

export const AXIS_TICK = {
	fill: "var(--muted-foreground)",
	fontFamily: "var(--font-mono)",
	fontSize: 11,
};

export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
	background: "var(--popover)",
	border: "1px solid var(--border)",
	borderRadius: 8,
	color: "var(--popover-foreground)",
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
	color: "var(--popover-foreground)",
};
