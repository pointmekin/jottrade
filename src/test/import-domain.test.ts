import { describe, expect, it } from "vitest";
import { parseAdjustmentCsv } from "@/lib/adjustment-import";
import {
	ImportAction,
	ImportKind,
	type ImportPreviewRow,
} from "@/lib/import-batch";
import { matchImportRows } from "@/lib/import-matching";
import { buildImportPlan } from "@/lib/import-plan";
import { summarizeImport } from "@/lib/import-reconciliation";
import { parseImportSource, readImportCsv } from "@/lib/import-source";
import { importUtcDate, sumImportMoney } from "@/lib/import-values";
import { tradeCsv } from "./import-sql-fixture";

async function parsed(account = 1, csv = tradeCsv) {
	const source = readImportCsv(csv);
	return parseImportSource(
		"fixture-user",
		account,
		ImportKind.Trades,
		"USD",
		source.rows,
		source.fields,
	);
}
describe("account-scoped import versions", () => {
	it("includes account and ticket in exact version fingerprints", async () => {
		const a = await parsed(),
			b = await parsed(2),
			ticket = await parsed(1, tradeCsv.replace("101,", "102,"));
		expect(a[0].fingerprint).not.toBe(b[0].fingerprint);
		expect(a[0].fingerprint).not.toBe(ticket[0].fingerprint);
	});
	it("normalizes decimal spelling but detects money and close-leg changes", async () => {
		const a = await parsed();
		expect(
			(await parsed(1, tradeCsv.replace("1.1000", "1.1")))[0].fingerprint,
		).toBe(a[0].fingerprint);
		expect(
			(await parsed(1, tradeCsv.replace("50.00", "60.00")))[0].fingerprint,
		).not.toBe(a[0].fingerprint);
		expect(
			(await parsed(1, tradeCsv.replace("10:00:00", "11:00:00")))[0]
				.fingerprint,
		).not.toBe(a[0].fingerprint);
	});
	it("keeps identical ambiguous source occurrences separate until chosen", async () => {
		const rows = await parsed(1, `${tradeCsv}\n${tradeCsv.split("\n")[1]}`);
		const matched = matchImportRows(rows, [], []);
		expect(matched.map((row) => row.action)).toEqual([
			ImportAction.Ambiguous,
			ImportAction.Ambiguous,
		]);
		expect(() => buildImportPlan(matched, [])).toThrow(/resolve/);
		const plan = buildImportPlan(
			matched,
			matched.map((row) => ({
				rowNumber: row.rowNumber,
				action: ImportAction.Insert,
			})),
		);
		expect(plan[0].after?.importHash).not.toBe(plan[1].after?.importHash);
	});
	it("reimports an unchanged recorded version as duplicate and leaves old corrected versions superseded", async () => {
		const rows = await parsed();
		const fingerprint = rows[0].fingerprint as string;
		const aliases = [
			{ fingerprint, occurrence: 0, recordId: 7, state: "active" },
		];
		expect(matchImportRows(rows, [], aliases)[0].action).toBe(
			ImportAction.Duplicate,
		);
		expect(
			matchImportRows(rows, [], [{ ...aliases[0], state: "superseded" }])[0]
				.action,
		).toBe(ImportAction.Superseded);
	});
	it("does not auto-adopt a legacy hash after a manual execution edit", async () => {
		const rows = await parsed();
		const record = rows[0].record as NonNullable<ImportPreviewRow["record"]>;
		if (record.kind !== ImportKind.Trades)
			throw Error("Expected trade fixture");
		const existing = {
			id: 7,
			revision: 1,
			snapshot: {
				...record,
				entryPrice: "1.2",
				importHash: rows[0].legacyHash,
			},
			importHash: rows[0].legacyHash,
			notes: "a user note",
			reason: "legacy",
		};
		const matched = matchImportRows(rows, [existing], []);
		expect(matched[0].action).toBe(ImportAction.Ambiguous);
		expect(() => buildImportPlan(matched, [])).toThrow();
	});
	it("adopts only compatible legacy facts without rewriting legacy fee or user fields", async () => {
		const rows = await parsed();
		const record = rows[0].record as NonNullable<ImportPreviewRow["record"]>;
		if (record.kind !== ImportKind.Trades)
			throw Error("Expected trade fixture");
		const existing = {
			id: 7,
			revision: 0,
			snapshot: {
				...record,
				fees: "2.7",
				brokerTicket: null,
				importHash: rows[0].legacyHash,
			},
			importHash: rows[0].legacyHash,
			notes: "keep manual notes",
			reason: "legacy",
		};
		const matched = matchImportRows(rows, [existing], []);
		expect(matched[0].action).toBe(ImportAction.Adopt);
		const plan = buildImportPlan(matched, []);
		expect(plan[0].recordId).toBe(7);
		expect(plan[0].after).toMatchObject({ fees: "2.7", brokerTicket: "101" });
		expect(summarizeImport(matched, plan).accountDelta).toBe("0");
	});
	it("does not allow clients to forge an adoption or duplicate outcome", async () => {
		const rows = await parsed();
		expect(() =>
			buildImportPlan(rows, [{ rowNumber: 2, action: ImportAction.Adopt }]),
		).toThrow();
		expect(() =>
			buildImportPlan(rows, [{ rowNumber: 2, action: ImportAction.Duplicate }]),
		).toThrow();
	});
});
describe("source arithmetic and errors", () => {
	it("sums decimal source values exactly without rounding every row", () => {
		expect(sumImportMoney(["0.1", "0.2", "0.0001"])).toBe("0.3001");
	});
	it.each([
		"2026-02-30 08:00:00",
		"2026-09-01 24:00:00",
		"not-a-date",
		"2026-09-01 10:61:00",
	])("rejects malformed UTC value %s", (value) => {
		expect(importUtcDate(value)).toBeNull();
	});
	it("maps broker UTC and explicit offsets to the same instant", () => {
		expect(importUtcDate("2026-09-01 23:30:00")).toBe(
			importUtcDate("2026-09-02T06:30:00+07:00"),
		);
	});
	it("preserves signed adjustment amounts and rejects embedded junk", () => {
		const header = "Adjustment date,Adjustment";
		expect(
			parseAdjustmentCsv(`${header}\n2026-09-01 21:00:00,-4.50 USD`)
				.adjustments[0].amountDecimal,
		).toBe("-4.5");
		const bad = parseAdjustmentCsv(
			`${header}\n2026-09-01 21:00:00,cost 4.50 USD`,
		);
		expect(bad.adjustments).toEqual([]);
		expect(bad.rows[0].issues[0].column).toBe("Adjustment");
	});
	it("invalid excluded money remains unknown in reconciliation", async () => {
		const rows = await parsed(1, tradeCsv.replace("50.00", "broken"));
		const plan = buildImportPlan(rows, [
			{ rowNumber: 2, action: ImportAction.Exclude },
		]);
		const summary = summarizeImport(
			rows.map((row) => ({ ...row, action: ImportAction.Exclude })),
			plan,
		);
		expect(summary).toMatchObject({
			unknownAmounts: 1,
			excluded: 1,
			accountDelta: "0",
		});
	});
	it("separates reported open results from realized account effects", async () => {
		const rows = await parsed(
			1,
			tradeCsv.replace("2026-09-01 10:00:00", "").replace("1.1050", ""),
		);
		const plan = buildImportPlan(rows, []);
		expect(summarizeImport(rows, plan)).toMatchObject({
			openRows: 1,
			openNet: "51.3",
			sourceNet: "0",
			accountDelta: "0",
		});
	});
	it("requires USD source currency for USD-labeled fields", async () => {
		const source = readImportCsv(tradeCsv.replace("profit,", "profit_usd,"));
		await expect(
			parseImportSource(
				"fixture-user",
				1,
				ImportKind.Trades,
				"EUR",
				source.rows,
				source.fields,
			),
		).rejects.toThrow(/USD/);
	});
});
