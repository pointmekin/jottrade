import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ImportAction, ImportKind } from "@/lib/import-batch";
import { matchImportRows } from "@/lib/import-matching";
import { buildImportPlan } from "@/lib/import-plan";
import { summarizeImport } from "@/lib/import-reconciliation";
import { recordNet } from "@/lib/import-record";
import { parseImportSource, readImportCsv } from "@/lib/import-source";
import { importDecimal } from "@/lib/import-values";

const csv = readFileSync("e2e/fixtures/exness-native-values.csv", "utf8");

async function stage() {
	const source = readImportCsv(csv);
	return parseImportSource(
		"fixture-user",
		1,
		ImportKind.Trades,
		"USD",
		source.rows,
		source.fields,
	);
}

describe("native Exness export values", () => {
	it("stages long prices, separate partial closes and blank breakeven profit", async () => {
		const rows = matchImportRows(await stage(), [], []);
		expect(rows.map((row) => row.issues)).toEqual([[], [], [], []]);
		expect(rows.map((row) => row.action)).toEqual(
			Array(4).fill(ImportAction.Insert),
		);
		expect(rows[1].fingerprint).not.toBe(rows[2].fingerprint);
		expect(summarizeImport(rows, buildImportPlan(rows, []))).toMatchObject({
			sourceNet: "85.6",
			accountDelta: "85.6",
			unknownAmounts: 0,
		});
	});
	it.each([false, true])(
		"adopts unchanged legacy prices with grouped legs=%s",
		async (isGroupedLeg) => {
			const rows = await stage();
			const existing = rows.map((row, id) => {
				if (!row.record) throw Error("Expected native trade");
				return {
					id: id + 1,
					isGroupedLeg,
					revision: 0,
					snapshot: { ...row.record, importHash: row.legacyHash },
					importHash: row.legacyHash,
					notes: "Keep my journal",
					reason: "legacy",
				};
			});
			const matched = matchImportRows(rows, existing, []);
			expect(matched.map((row) => row.action)).toEqual(
				Array(4).fill(ImportAction.Adopt),
			);
			const plan = buildImportPlan(matched, []);
			expect(summarizeImport(matched, plan).accountDelta).toBe("0");
			expect(plan.map((item) => recordNet(item.after))).toEqual(
				existing.map((item) => recordNet(item.snapshot)),
			);
			if (isGroupedLeg)
				expect(() =>
					buildImportPlan(matched, [
						{
							rowNumber: matched[0].rowNumber,
							action: ImportAction.Correct,
							targetId: existing[0].id,
						},
					]),
				).toThrow("Trade is grouped into a position. Ungroup it first.");
		},
	);
	it.each([
		"NaN",
		"Infinity",
		"1.2junk",
		"1,23.45",
		"1000000000000000000000000",
		"1".repeat(49),
	])("still rejects malformed or oversized decimal %s", (value) => {
		expect(importDecimal(value)).toBeNull();
	});
});
