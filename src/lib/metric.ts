export const MetricVariant = {
	Cell: "cell",
	Card: "card",
	Compact: "compact",
} as const;

export type MetricVariant = (typeof MetricVariant)[keyof typeof MetricVariant];

export const MetricTone = {
	Neutral: "neutral",
	Positive: "positive",
	Negative: "negative",
} as const;

export type MetricTone = (typeof MetricTone)[keyof typeof MetricTone];

export const UNAVAILABLE = "—";

export function toneOf(value: number | null): MetricTone {
	if (value === null) return MetricTone.Neutral;
	return value >= 0 ? MetricTone.Positive : MetricTone.Negative;
}
