import { describe, expect, it } from "vitest";
import { parseUtcDate } from "../lib/date";

describe("broker UTC timestamp parsing", () => {
	it("treats an Exness UTC column without a suffix as a UTC instant", () => {
		expect(parseUtcDate("2025-01-03 16:30:00")).toBe(
			"2025-01-03T16:30:00.000Z",
		);
	});
});
