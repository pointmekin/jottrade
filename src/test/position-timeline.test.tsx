// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PositionTimeline } from "@/components/journal/position-timeline";
import type { ExecutionFill } from "@/db/positions";
import { ExecutionKind, replayPosition } from "@/lib/position";
import { type Trade, TradeSide, TradeStatus } from "@/lib/trade";
import {
	addExecution,
	deleteExecution,
	getPositionExecutions,
} from "@/server/positionActions";

vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/ui/drawer", () => {
	const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
	return {
		Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
			open ? <div role="dialog">{children}</div> : null,
		DrawerContent: Pass,
		DrawerHeader: Pass,
		DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
		DrawerDescription: ({ children }: { children: ReactNode }) => (
			<p>{children}</p>
		),
	};
});
vi.mock("@/server/positionActions", () => ({
	getPositionExecutions: vi.fn(),
	addExecution: vi.fn(),
	updateExecution: vi.fn(),
	deleteExecution: vi.fn(),
}));

const mockGet = vi.mocked(getPositionExecutions);
const mockAdd = vi.mocked(addExecution);
const mockDelete = vi.mocked(deleteExecution);

const at = (hour: number) => new Date(Date.UTC(2026, 9, 1, hour));
const fill = (
	id: number | undefined,
	kind: ExecutionKind,
	hour: number,
	quantity: string,
	price: string,
): ExecutionFill => ({
	id,
	kind,
	executedAt: at(hour),
	price,
	quantity,
	fees: "0",
});

const trade: Trade = {
	id: 5,
	symbol: "EURUSD",
	side: TradeSide.Long,
	status: TradeStatus.Open,
	entryDate: at(1),
	exitDate: null,
	entryPrice: "1.1",
	exitPrice: null,
	quantity: "1",
	netPnl: null,
	returnPercent: null,
};

function loaded(fills: ExecutionFill[], isMaterialized = true) {
	return {
		editRevision: 4,
		isMaterialized,
		fills,
		replay: replayPosition(TradeSide.Long, fills, {
			symbol: "EURUSD",
			accountCurrency: "USD",
		}),
	} as Awaited<ReturnType<typeof getPositionExecutions>>;
}

function renderTimeline(value: Trade = trade) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<PositionTimeline trade={value} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("PositionTimeline", () => {
	it("shows one row and the two actions for a single-fill trade", async () => {
		mockGet.mockResolvedValue(
			loaded([fill(undefined, ExecutionKind.Entry, 1, "1", "1.1")], false),
		);
		renderTimeline();

		const rows = await screen.findAllByRole("listitem");
		expect(rows).toHaveLength(1);
		expect(rows[0].textContent).toContain("Open 1.0 lots · avg 1.1");
		expect(screen.getByRole("button", { name: "Add entry" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Close part" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
	});

	it("shows each fill in time order with the position after it, and the totals", async () => {
		mockGet.mockResolvedValue(
			loaded([
				fill(1, ExecutionKind.Entry, 1, "1", "1.1"),
				fill(2, ExecutionKind.Entry, 2, "1", "1.095"),
				fill(3, ExecutionKind.Exit, 3, "0.5", "1.105"),
			]),
		);
		renderTimeline();

		const rows = await screen.findAllByRole("listitem");
		expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
			expect.stringMatching(/^Entry at/),
			expect.stringMatching(/^Entry at/),
			expect.stringMatching(/^Exit at/),
		]);
		expect(rows[2].textContent).toContain(
			"Open 1.5 lots · avg 1.0975 · realized +$375.00",
		);
		const totals = screen.getByLabelText("Position totals");
		expect(within(totals).getByText("2.0 lots")).toBeTruthy();
		expect(within(totals).getByText("1.5 lots")).toBeTruthy();
		expect(within(totals).getByText("+$375.00")).toBeTruthy();
		expect(screen.getAllByRole("button", { name: /^Edit/ })).toHaveLength(3);
	});

	it("shows the notice and no actions for an imported trade", async () => {
		mockGet.mockResolvedValue(
			loaded([fill(undefined, ExecutionKind.Entry, 1, "1", "1.1")], false),
		);
		renderTimeline({ ...trade, importHash: "abc" });

		expect(
			await screen.findByText("Broker rows cannot get manual fills."),
		).toBeTruthy();
		await screen.findAllByRole("listitem");
		expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
	});

	it("shows an error with Retry, and Retry loads again", async () => {
		mockGet.mockRejectedValueOnce(new Error("Network"));
		mockGet.mockResolvedValueOnce(
			loaded([fill(undefined, ExecutionKind.Entry, 1, "1", "1.1")], false),
		);
		renderTimeline();

		fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
		expect(await screen.findAllByRole("listitem")).toHaveLength(1);
	});

	it("starts Close part with the open quantity and shows an over-close under the quantity", async () => {
		mockGet.mockResolvedValue(
			loaded([fill(1, ExecutionKind.Entry, 1, "1", "1.1")]),
		);
		mockAdd.mockRejectedValue(
			new Error("This exit closes more than was open. You can close up to 1."),
		);
		renderTimeline();

		fireEvent.click(await screen.findByRole("button", { name: "Close part" }));
		const form = screen.getByRole("dialog");
		const quantity = within(form).getByLabelText("Quantity (lots)");
		expect((quantity as HTMLInputElement).value).toBe("1");
		fireEvent.change(quantity, { target: { value: "1.5" } });
		fireEvent.change(within(form).getByLabelText("Price"), {
			target: { value: "1.2" },
		});
		fireEvent.click(within(form).getByRole("button", { name: "Save fill" }));

		await waitFor(() =>
			expect(quantity.getAttribute("aria-invalid")).toBe("true"),
		);
		expect(within(form).getByRole("alert").textContent).toBe(
			"This exit closes more than was open. You can close up to 1.",
		);
		expect(mockAdd).toHaveBeenCalledWith({
			data: expect.objectContaining({
				tradeId: 5,
				expectedRevision: 4,
				kind: ExecutionKind.Exit,
				quantity: "1.5",
			}),
		});
	});

	it("deletes a fill only after the confirm", async () => {
		mockGet.mockResolvedValue(
			loaded([
				fill(1, ExecutionKind.Entry, 1, "1", "1.1"),
				fill(2, ExecutionKind.Entry, 2, "1", "1.095"),
			]),
		);
		mockDelete.mockResolvedValue({ success: true });
		renderTimeline();

		const [, second] = await screen.findAllByRole("button", {
			name: /^Delete Entry/,
		});
		fireEvent.click(second);
		expect(mockDelete).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Delete fill" }));
		await waitFor(() =>
			expect(mockDelete).toHaveBeenCalledWith({
				data: { tradeId: 5, expectedRevision: 4, executionId: 2 },
			}),
		);
	});
});
