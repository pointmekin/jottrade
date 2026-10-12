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
