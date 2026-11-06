import { z } from "zod";
import { isValidTimeZone, nextDayKey, previousDayKey } from "./date";
import { ReviewKind } from "./review";
export const reviewDaySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const date = new Date(`${value}T00:00:00Z`);
		return (
			Number.isFinite(date.getTime()) &&
			date.toISOString().slice(0, 10) === value
		);
	}, "Invalid calendar date");
export const reviewScopeSchema = z.object({
	portfolioId: z.number().int().positive(),
	kind: z.enum(ReviewKind),
	start: reviewDaySchema,
});
export const reviewPreferencesSchema = z.object({
	portfolioId: z.number().int().positive(),
	timezone: z.string().refine(isValidTimeZone, "Invalid IANA timezone"),
	weekStartsOn: z.union([z.literal(0), z.literal(1)]),
});
export function reviewPeriod(
	day: string,
	kind: ReviewKind,
	weekStartsOn: number,
) {
	let start = reviewDaySchema.parse(day);
	if (kind === ReviewKind.Weekly) {
		let weekday = new Date(`${start}T00:00:00Z`).getUTCDay();
		while (weekday !== weekStartsOn) {
			start = previousDayKey(start);
			weekday = new Date(`${start}T00:00:00Z`).getUTCDay();
		}
	}
	let end = nextDayKey(start);
	if (kind === ReviewKind.Weekly)
		for (let index = 1; index < 7; index++) end = nextDayKey(end);
	return { periodStart: start, periodEndExclusive: end };
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const RANGE_FORMAT = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** "Fri, Nov 6, 2026" for a day, "Nov 2 – 8, 2026" for a period. */
export function formatReviewPeriod(start: string, endExclusive: string) {
	const last = previousDayKey(endExclusive);
	if (last === start) return DAY_FORMAT.format(dayDate(start));
	return RANGE_FORMAT.formatRange(dayDate(start), dayDate(last));
}
