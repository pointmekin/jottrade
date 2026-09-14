import { describe, expect, it } from "vitest";
import {
	localDateTimeToIso,
	toDateTimeLocalValue,
	toDayKey,
	zonedHour,
} from "../lib/date";

describe("timezone-aware date parts", () => {
	it("keeps a late Friday close on Friday in Bangkok", () => {
		expect(toDayKey(new Date("2025-01-03T16:30:00Z"), "Asia/Bangkok")).toBe(
			"2025-01-03",
		);
	});

	it("moves a UTC Friday close across Bangkok's local midnight", () => {
		expect(toDayKey(new Date("2025-01-03T18:00:00Z"), "Asia/Bangkok")).toBe(
			"2025-01-04",
		);
	});

	it("supports negative-offset IANA timezones", () => {
		const instant = new Date("2025-01-04T02:00:00Z");
		expect(toDayKey(instant, "America/New_York")).toBe("2025-01-03");
		expect(zonedHour(instant, "America/New_York")).toBe(21);
	});
});

describe("datetime-local conversion", () => {
	it("stores a late Friday Bangkok form value as the matching UTC instant", () => {
		const originalTimeZone = process.env.TZ;
		process.env.TZ = "Asia/Bangkok";
		try {
			const localDate = new Date(2025, 0, 3, 23, 30);
			expect(toDateTimeLocalValue(localDate)).toBe("2025-01-03T23:30");
			expect(localDateTimeToIso("2025-01-03T23:30")).toBe(
				"2025-01-03T16:30:00.000Z",
			);
		} finally {
			if (originalTimeZone) process.env.TZ = originalTimeZone;
			else delete process.env.TZ;
		}
	});
});
