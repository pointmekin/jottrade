// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupCalculator } from "@/components/tools/SetupCalculator";
import { getCurrentFxRate } from "@/server/positionSizingActions";

vi.mock("@/hooks/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("@/server/positionSizingActions", () => ({
	getCurrentFxRate: vi.fn(),
}));
vi.mock("@/components/ui/slider", () => ({
	Slider: () => (
		<div
			role="slider"
			aria-label="Risk percentage"
			aria-valuenow={1}
			tabIndex={0}
		/>
	),
}));

function enterPrices(symbol: string, entry: string, stop: string) {
	fireEvent.change(screen.getByLabelText("Symbol"), {
		target: { value: symbol },
	});
	fireEvent.change(screen.getByLabelText("Entry price"), {
		target: { value: entry },
	});
	fireEvent.change(screen.getByLabelText("Stop loss"), {
		target: { value: stop },
	});
}

afterEach(() => vi.clearAllMocks());

describe("SetupCalculator", () => {
	it("does not request FX while typing and calculates local pairs without FX", async () => {
		render(<SetupCalculator initialBalance={10_000} />);
		enterPrices("EURUSD", "1.1025", "1.1");

		expect(getCurrentFxRate).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Calculate" }));

		await screen.findByText("0.4");
		expect(screen.getByText("lots")).toBeTruthy();
		expect(getCurrentFxRate).not.toHaveBeenCalled();
	});

	it("requests one current conversion only after Calculate", async () => {
		vi.mocked(getCurrentFxRate).mockResolvedValue({
			fromCurrency: "JPY",
			toCurrency: "USD",
			rate: 0.0065,
			provider: "frankfurter",
			precision: "DAILY",
			asOf: "2026-09-16T00:00:00.000Z",
		} as never);
		render(<SetupCalculator initialBalance={10_000} />);
		enterPrices("EURJPY", "155", "154");
		expect(getCurrentFxRate).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Calculate" }));

		await waitFor(() => expect(getCurrentFxRate).toHaveBeenCalledOnce());
		expect(getCurrentFxRate).toHaveBeenCalledWith({
			data: { fromCurrency: "JPY", toCurrency: "USD" },
		});
		expect(
			await screen.findByText(/Frankfurter daily reference rate/),
		).toBeTruthy();
	});

	it("shows a conversion-specific error and no result when the rate fails", async () => {
		vi.mocked(getCurrentFxRate).mockRejectedValue(
			new Error(
				"Unable to retrieve the JPY → USD conversion rate required to calculate this position.",
			),
		);
		render(<SetupCalculator initialBalance={10_000} />);
		enterPrices("EURJPY", "155", "154");

		fireEvent.click(screen.getByRole("button", { name: "Calculate" }));

		expect((await screen.findByRole("alert")).textContent).toContain(
			"Unable to retrieve the JPY → USD conversion rate",
		);
		expect(screen.queryByText("Position size")).toBeTruthy();
		expect(screen.queryByText("lots")).toBeNull();
	});
});
