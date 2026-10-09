import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
	readFileSync("public/manifest.webmanifest", "utf8"),
) as {
	name: string;
	short_name: string;
	start_url: string;
	display: string;
	icons: { src: string; sizes: string; purpose: string }[];
};

function pngSize(path: string) {
	const png = readFileSync(path);
	return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe("app manifest", () => {
	it("names the installed app JotTrade", () => {
		expect(manifest.name).toBe("JotTrade");
		expect(manifest.short_name).toBe("JotTrade");
		expect(manifest.start_url).toBe("/dashboard");
		expect(manifest.display).toBe("standalone");
	});

	it("lists icon files with their stated sizes", () => {
		expect(manifest.icons.map((icon) => icon.purpose)).toEqual([
			"any",
			"any",
			"maskable",
		]);
		for (const icon of manifest.icons) {
			expect(pngSize(`public${icon.src}`)).toBe(icon.sizes);
		}
	});

	it("has a 180 px Apple touch icon", () => {
		expect(pngSize("public/icons/apple-touch-icon.png")).toBe("180x180");
	});
});
