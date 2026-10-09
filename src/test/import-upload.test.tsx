// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportBatchZone } from "@/components/journal/import-batch-zone";
import { ImportKind } from "@/lib/import-batch";
import { stageImport } from "@/server/importActions";

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({
		activeAccount: { id: 1, name: "Account A", currency: "USD" },
		accounts: [{ id: 1, name: "Account A", currency: "USD" }],
	}),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { user: { id: "fixture-user" } } }),
	},
}));
vi.mock("@/server/importActions", () => ({
	stageImport: vi.fn(),
	repairImportRow: vi.fn(),
	commitImport: vi.fn(),
}));

function upload(file: File) {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<ImportBatchZone kind={ImportKind.Trades} />
		</QueryClientProvider>,
	);
	fireEvent.click(screen.getByRole("checkbox"));
	const input = document.querySelector('input[type="file"]');
	if (!input) throw Error("File input not found.");
	fireEvent.change(input, { target: { files: [file] } });
}

describe("import upload messages", () => {
	afterEach(cleanup);
	it.each([
		[
			new File(["text"], "trades.xlsx", { type: "application/vnd.ms-excel" }),
			"This file is not a CSV. Upload the .csv file from Exness.",
		],
		[
			new File([], "trades.csv", { type: "text/csv" }),
			"This file is empty. Download the CSV from Exness again.",
		],
		[
			new File(["x".repeat(5 * 1024 * 1024 + 1)], "trades.csv", {
				type: "text/csv",
			}),
			"This file is larger than 5 MB. Download a shorter date range, then import each file.",
		],
	])("explains a rejected file %#", async (file, message) => {
		upload(file);
		expect((await screen.findByRole("alert")).textContent).toBe(message);
		expect(stageImport).not.toHaveBeenCalled();
	});
	it("says that nothing was imported when the stage fails", async () => {
		vi.mocked(stageImport).mockRejectedValueOnce(
			Error("This CSV has no records."),
		);
		const file = new File(["ticket\n"], "trades.csv", { type: "text/csv" });
		upload(Object.assign(file, { text: async () => "ticket\n" }));
		expect((await screen.findByRole("alert")).textContent).toBe(
			"This CSV has no records. Nothing was imported.",
		);
	});
});
