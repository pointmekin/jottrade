import { describe, expect, it } from "vitest";
import { navItems } from "../lib/nav-items";

describe("navItems", () => {
	it("exports 6 items", () => {
		expect(navItems).toHaveLength(6);
	});

	it("has the correct urls", () => {
		const urls = navItems.map((i) => i.url);
		expect(urls).toEqual([
			"/dashboard",
			"/journal",
			"/calendar",
			"/strategies",
			"/reviews",
			"/settings",
		]);
	});

	it("has title and icon on every item", () => {
		for (const item of navItems) {
			expect(item.title.length).toBeGreaterThan(0);
			expect(item.icon).toBeDefined();
			expect(item.icon).not.toBeNull();
		}
	});
});
