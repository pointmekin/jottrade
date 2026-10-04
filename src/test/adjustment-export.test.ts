// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAdjustmentCsv } from "@/lib/adjustment-import";

const source = readFileSync("public/exness-adjustments-export.js", "utf8");
const header =
	"<tr><th>Symbol</th><th>Type</th><th>Lots</th><th>Position ID</th><th>Ex-date</th><th>Adjustment date</th><th>Dividend rate</th><th>Adjustment</th></tr>";
const row = (position = "77") =>
	`<tr><td>US500</td><td>Buy</td><td>1</td><td>${position}</td><td></td><td>2026-09-01 21:00:00 UTC</td><td>1.2</td><td>-4.50 USD</td></tr>`;
let copied = "";
beforeEach(() => {
	copied = "";
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: vi.fn(async (value: string) => {
				copied = value;
			}),
		},
	});
	const rect = new DOMRect(0, 0, 100, 20);
	const rects: DOMRectList = {
		0: rect,
		length: 1,
		item: (index) => (index === 0 ? rect : null),
		[Symbol.iterator]() {
			return [rect][Symbol.iterator]();
		},
	};
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(rects);
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
		() => undefined,
	);
	vi.stubGlobal("URL", {
		createObjectURL: () => "blob:synthetic",
		revokeObjectURL: () => undefined,
	});
	vi.spyOn(console, "log").mockImplementation(() => undefined);
	vi.spyOn(console, "table").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});
async function runExporter() {
	// eslint-disable-next-line sonarjs/code-eval -- Executes fixed repository-owned exporter code in a synthetic DOM, without external input.
	await new Function(`return ${source}`)();
}
describe("Exness adjustment exporter collection", () => {
	it("preserves indistinguishable rows in the same source view with an import warning", async () => {
		document.body.innerHTML = `<table>${header}${row()}${row()}</table>`;
		await runExporter();
		const parsed = parseAdjustmentCsv(copied);
		expect(parsed.adjustments).toHaveLength(2);
		expect(parsed.rows[0].source["Export warning"]).toContain(
			"Indistinguishable rows were preserved",
		);
	});
	it("avoids adding snapshot overlap twice while preserving newly observed multiplicity", async () => {
		document.body.innerHTML = `<table>${header}${row()}</table><button>Load more</button>`;
		document.querySelector("button")?.addEventListener("click", () => {
			document
				.querySelector("table")
				?.insertAdjacentHTML("beforeend", `${row()}${row("78")}`);
			document.querySelector("button")?.remove();
		});
		await runExporter();
		expect(parseAdjustmentCsv(copied).adjustments).toHaveLength(3);
	});
});
