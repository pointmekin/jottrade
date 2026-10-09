import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, readImportCsv } from "@/lib/import-source";

const header = "ticket,symbol,type";

describe("readImportCsv messages", () => {
	it("explains a CSV with headers and no records", () => {
		expect(() => readImportCsv(`${header}\n`)).toThrow(
			"This CSV has no records. Check the account and the date range in Exness, then download the file again.",
		);
	});
	it("gives the record count and the limit", () => {
		const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => "1,A,buy");
		expect(() => readImportCsv([header, ...rows].join("\n"))).toThrow(
			"This CSV has 5001 records. The limit is 5000. Download a shorter date range, then import each file.",
		);
	});
	it("explains a file over 5 MB", () => {
		expect(() => readImportCsv(`${header}\n${"x".repeat(5_300_000)}`)).toThrow(
			"This file is larger than 5 MB. Download a shorter date range, then import each file.",
		);
	});
	it("explains a file that is not comma-separated", () => {
		expect(() => readImportCsv("Trade report\nNo data")).toThrow(
			"This file is not a comma-separated CSV. Upload the CSV file from Exness without changes.",
		);
	});
	it("names a record that cannot be read", () => {
		expect(() => readImportCsv(`${header}\n1,A,buy\n2,B,sell,extra`)).toThrow(
			"CSV record 3 could not be read (Too many fields: expected 3 fields but parsed 4). Upload the CSV file from Exness without changes.",
		);
	});
});
