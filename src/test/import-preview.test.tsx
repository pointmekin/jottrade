// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportBatchZone } from "@/components/journal/import-batch-zone";
import { ImportPreview } from "@/components/journal/import-preview";
import {
	type BrokerTrade,
	ImportAction,
	ImportKind,
	type ImportPreviewRow,
	type ImportReceipt,
} from "@/lib/import-batch";
import { summarizeImport } from "@/lib/import-reconciliation";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { calculateInitialRisk } from "@/lib/trade-risk";

const state = vi.hoisted(() => ({
	activeAccount: { id: 1, name: "Account A", currency: "USD" },
	accounts: [
		{ id: 1, name: "Account A", currency: "USD" },
		{ id: 2, name: "Account B", currency: "USD" },
	],
}));
vi.mock("@/hooks/use-accounts", () => ({ useAccounts: () => state }));
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
const record: BrokerTrade = {
	kind: ImportKind.Trades,
	symbol: "EURUSD",
	side: TradeSide.Long,
	status: TradeStatus.Closed,
	entryDate: "2026-09-01T08:00:00.000Z",
	exitDate: "2026-09-01T10:00:00.000Z",
	entryPrice: "1.1",
	exitPrice: "1.105",
	quantity: "0.1",
	fees: "-1.3",
	netPnl: "51.3",
	returnPercent: "0.45454545454545453",
	brokerSource: "exness",
	brokerTicket: "101",
	brokerProfit: "50",
	brokerCommission: "-0.7",
	brokerSwap: "2",
	brokerCloseReason: null,
	importHash: null,
};
function row(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
	return {
		rowNumber: 2,
		source: { lots: "0.1" },
		issues: [],
		record,
		fingerprint: "fixture-fingerprint",
		legacyHash: null,
		action: ImportAction.Insert,
		reason: "New source version.",
		candidates: [],
		occurrence: 0,
		targetId: null,
		expectedRevision: null,
		...overrides,
	};
}
function setup(rows: ImportPreviewRow[], pending = false) {
	const batch: ImportReceipt = {
		id: "fixture-batch",
		revision: 0,
		portfolioId: 1,
		sourceCurrency: "USD",
		fileName: "synthetic.csv",
		kind: ImportKind.Trades,
		state: "staged",
		summary: summarizeImport(rows),
		outcomes: [],
		rows,
		createdAt: "2026-09-01T00:00:00.000Z",
		expiresAt: "2026-09-08T00:00:00.000Z",
	};
	const onRepair = vi.fn();
	const onConfirm = vi.fn();
	render(
		<ImportPreview
			batch={batch}
			pending={pending}
			onRepair={onRepair}
			onConfirm={onConfirm}
			onCancel={vi.fn()}
		/>,
	);
	return { onRepair, onConfirm };
}
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	state.activeAccount = state.accounts[0];
});
describe("import decisions", () => {
	it("shows a correction's realized-R effect using the saved original denominator", () => {
		const risk = calculateInitialRisk({
			symbol: "EURUSD",
			side: TradeSide.Long,
			entryDate: record.entryDate,
			entryPrice: "1.1",
			quantity: "0.2",
			initialStopPrice: "1.095",
			accountCurrency: "USD",
		});
		setup([
			row({
				action: ImportAction.Ambiguous,
				record: { ...record, netPnl: "61.3" },
				candidates: [
					{
						id: 42,
						revision: 1,
						snapshot: record,
						reason: "Correction candidate",
						...risk,
					},
				],
			}),
		]);
		expect(
			screen.getByText(/Realized net R if corrected/).textContent,
		).toContain("0.51R → 0.61R");
		expect(screen.getByText(/original risk plan stays unchanged/)).toBeTruthy();
	});
	it("blocks malformed rows until explicit exclusion and keeps incomplete totals visible", () => {
		const { onConfirm } = setup([
			row({
				record: null,
				action: ImportAction.Error,
				issues: [
					{ column: "lots", message: "Enter a positive decimal value." },
				],
			}),
		]);
		const apply = screen.getByRole("button", {
			name: "Apply import",
		}) as HTMLButtonElement;
		expect(apply.disabled).toBe(true);
		fireEvent.change(screen.getByLabelText("Decision for record 2"), {
			target: { value: ImportAction.Exclude },
		});
		expect(apply.disabled).toBe(false);
		expect(screen.getByText(/Source total is incomplete/)).toBeTruthy();
		expect(screen.getByText(/This is a partial import/)).toBeTruthy();
		fireEvent.click(apply);
		expect(onConfirm).toHaveBeenCalledWith([
			{ rowNumber: 2, action: ImportAction.Exclude },
		]);
	});
	it("provides missing source fields for repair without losing existing values", () => {
		const { onRepair } = setup([
			row({
				record: null,
				action: ImportAction.Error,
				source: { lots: "bad", ticket: "101" },
				issues: [
					{ column: "commission", message: "Supply the missing signed cost." },
				],
			}),
		]);
		fireEvent.change(screen.getByLabelText("Record 2 lots"), {
			target: { value: "0.1" },
		});
		fireEvent.change(screen.getByLabelText("Record 2 commission"), {
			target: { value: "-0.7" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Validate repaired record" }),
		);
		expect(onRepair).toHaveBeenCalledWith(2, {
			lots: "0.1",
			ticket: "101",
			commission: "-0.7",
		});
	});
	it("requires a correction choice and submits the selected candidate revision", () => {
		const { onConfirm } = setup([
			row({
				action: ImportAction.Ambiguous,
				candidates: [
					{
						id: 7,
						revision: 3,
						reason: "Possible correction",
						snapshot: { ...record, netPnl: "41.3", brokerProfit: "40" },
					},
				],
			}),
		]);
		const apply = screen.getByRole("button", {
			name: "Apply import",
		}) as HTMLButtonElement;
		expect(apply.disabled).toBe(true);
		fireEvent.change(screen.getByLabelText("Decision for record 2"), {
			target: { value: "correct:7" },
		});
		expect(screen.getByText(/Account change: \$10.00 USD/)).toBeTruthy();
		fireEvent.click(apply);
		expect(onConfirm).toHaveBeenCalledWith([
			{
				rowNumber: 2,
				action: ImportAction.Correct,
				targetId: 7,
				expectedRevision: 3,
			},
		]);
	});
	it("makes records beyond the first page available for decisions", () => {
		setup(
			Array.from({ length: 26 }, (_, index) =>
				row({ rowNumber: index + 2, fingerprint: `fixture-${index}` }),
			),
		);
		expect(screen.queryByLabelText("Decision for record 27")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByLabelText("Decision for record 27")).toBeTruthy();
		expect(screen.queryByLabelText("Decision for record 2")).toBeNull();
	});
	it("requires renewed account confirmation when the target account changes", () => {
		const client = new QueryClient();
		const component = (
			<QueryClientProvider client={client}>
				<ImportBatchZone kind={ImportKind.Trades} />
			</QueryClientProvider>
		);
		const view = render(component);
		const confirmation = screen.getByRole("checkbox") as HTMLInputElement;
		fireEvent.click(confirmation);
		expect(confirmation.checked).toBe(true);
		state.activeAccount = state.accounts[1];
		view.rerender(
			<QueryClientProvider client={client}>
				<ImportBatchZone kind={ImportKind.Trades} />
			</QueryClientProvider>,
		);
		expect(confirmation.checked).toBe(false);
		expect(screen.getByText(/Target: Account B/)).toBeTruthy();
	});
});
