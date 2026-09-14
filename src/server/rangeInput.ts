import { z } from "zod";
import type { DateRange } from "@/lib/analytics";
import { isValidTimeZone } from "@/lib/date";

/**
 * The client resolves a preset against its own clock, then sends absolute
 * bounds. That keeps "this month" aligned with the user's timezone.
 */
export const rangeSchema = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
	timeZone: z
		.string()
		.refine(isValidTimeZone, "Invalid IANA timezone")
		.default("UTC"),
});

export type RangeInput = z.infer<typeof rangeSchema>;

export function toDateRange(input: RangeInput | undefined): DateRange {
	return {
		from: input?.from ? new Date(input.from) : null,
		to: input?.to ? new Date(input.to) : null,
	};
}
