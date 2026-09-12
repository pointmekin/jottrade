import {
	endOfDay,
	endOfMonth,
	endOfYear,
	startOfDay,
	startOfMonth,
	startOfYear,
	subDays,
	subMonths,
	subYears,
} from "date-fns";

export const PeriodPreset = {
	All: "all",
	Last7Days: "7d",
	Last30Days: "30d",
	Last90Days: "90d",
	ThisMonth: "mtd",
	LastMonth: "last-month",
	YearToDate: "ytd",
	LastYear: "last-year",
	Custom: "custom",
} as const;

export type PeriodPreset = (typeof PeriodPreset)[keyof typeof PeriodPreset];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
	[PeriodPreset.All]: "All time",
	[PeriodPreset.Last7Days]: "Last 7 days",
	[PeriodPreset.Last30Days]: "Last 30 days",
	[PeriodPreset.Last90Days]: "Last 90 days",
	[PeriodPreset.ThisMonth]: "This month",
	[PeriodPreset.LastMonth]: "Last month",
	[PeriodPreset.YearToDate]: "Year to date",
	[PeriodPreset.LastYear]: "Last year",
	[PeriodPreset.Custom]: "Custom range",
};

export const PERIOD_PRESET_ORDER: PeriodPreset[] = [
	PeriodPreset.All,
	PeriodPreset.Last7Days,
	PeriodPreset.Last30Days,
	PeriodPreset.Last90Days,
	PeriodPreset.ThisMonth,
	PeriodPreset.LastMonth,
	PeriodPreset.YearToDate,
	PeriodPreset.LastYear,
	PeriodPreset.Custom,
];

/** A resolved window. `null` means unbounded on that side. */
export type PeriodRange = { from: Date | null; to: Date | null };

/** URL/search-param shape. `from` and `to` only apply to the custom preset. */
export type PeriodSelection = {
	preset?: PeriodPreset;
	from?: string;
	to?: string;
};

function parseDay(value: string | undefined): Date | null {
	if (!value) return null;
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolvePeriod(
	selection: PeriodSelection | undefined,
	now: Date = new Date(),
): PeriodRange {
	const preset = selection?.preset ?? PeriodPreset.All;

	switch (preset) {
		case PeriodPreset.Last7Days:
			return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
		case PeriodPreset.Last30Days:
			return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
		case PeriodPreset.Last90Days:
			return { from: startOfDay(subDays(now, 89)), to: endOfDay(now) };
		case PeriodPreset.ThisMonth:
			return { from: startOfMonth(now), to: endOfDay(now) };
		case PeriodPreset.LastMonth: {
			const previous = subMonths(now, 1);
			return { from: startOfMonth(previous), to: endOfMonth(previous) };
		}
		case PeriodPreset.YearToDate:
			return { from: startOfYear(now), to: endOfDay(now) };
		case PeriodPreset.LastYear: {
			const previous = subYears(now, 1);
			return { from: startOfYear(previous), to: endOfYear(previous) };
		}
		case PeriodPreset.Custom: {
			const from = parseDay(selection?.from);
			const to = parseDay(selection?.to);
			return { from, to: to ? endOfDay(to) : null };
		}
		default:
			return { from: null, to: null };
	}
}

export function describePeriod(
	selection: PeriodSelection | undefined,
	now: Date = new Date(),
): string {
	const preset = selection?.preset ?? PeriodPreset.All;
	if (preset !== PeriodPreset.Custom) return PERIOD_PRESET_LABELS[preset];

	const { from, to } = resolvePeriod(selection, now);
	if (!from && !to) return "Custom range";

	const format = (date: Date) =>
		date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});

	if (from && to) return `${format(from)} – ${format(to)}`;
	if (from) return `From ${format(from)}`;
	return `Until ${format(to as Date)}`;
}
