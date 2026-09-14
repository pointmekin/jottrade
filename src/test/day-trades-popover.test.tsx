// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayTradesPopover } from "@/components/calendar/DayTradesPopover";

const { viewport } = vi.hoisted(() => ({ viewport: { isMobile: false } }));

type MockLinkProps = ComponentProps<"a"> & {
	to: string;
	params: { tradeId: string };
};

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => viewport.isMobile,
}));

vi.mock("@/hooks/use-currency", () => ({
	useCurrency: () => "USD",
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, onClick, params, to }: MockLinkProps) => (
		<a
			href={to.replace("$tradeId", params.tradeId)}
			onClick={(event) => {
				event.preventDefault();
				onClick?.(event);
			}}
		>
			{children}
		</a>
	),
}));

vi.mock("@/components/ui/drawer", () => ({
	Drawer: ({
		children,
		direction,
		onOpenChange,
	}: {
		children: ReactNode;
		direction: string;
		onOpenChange: (open: boolean) => void;
	}) => (
		<div data-testid="day-trades-drawer" data-direction={direction}>
			{children}
			<button type="button" onClick={() => onOpenChange(false)}>
				Dismiss slider
			</button>
		</div>
	),
	DrawerContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => (
		<div data-testid="day-trades-drawer-content" className={className}>
			{children}
		</div>
	),
	DrawerDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DrawerHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
	DrawerTrigger: ({ children }: { children: ReactNode }) => children,
}));

const day = {
	netPnl: 125.5,
	tradeCount: 1,
	trades: [
		{
			id: 42,
			symbol: "AAPL",
			side: "LONG",
			status: "CLOSED",
			netPnl: 125.5,
		},
	],
};

function renderSlider(isMobile: boolean) {
	viewport.isMobile = isMobile;
	const onOpenChange = vi.fn();
	const onTradeClick = vi.fn();
	render(
		<DayTradesPopover
			date="2025-01-03"
			day={day}
			open
			onOpenChange={onOpenChange}
			onTradeClick={onTradeClick}
		>
			<button type="button">January 3</button>
		</DayTradesPopover>,
	);
	return { onOpenChange, onTradeClick };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("DayTradesPopover", () => {
	it("renders a constrained right-side slider on desktop", () => {
		const { onOpenChange, onTradeClick } = renderSlider(false);

		expect(screen.getByTestId("day-trades-drawer").dataset.direction).toBe(
			"right",
		);
		expect(screen.getByTestId("day-trades-drawer-content").className).toContain(
			"w-[440px]",
		);
		expect(
			screen.getByRole("heading", { name: /friday, january 3, 2025/i }),
		).toBeTruthy();
		expect(screen.getByText(/1 trade · net p&l/i)).toBeTruthy();
		expect(screen.getByText("AAPL")).toBeTruthy();

		const tradeLink = screen.getByRole("link", { name: /AAPL/i });
		expect(tradeLink.getAttribute("href")).toBe("/journal/42");
		fireEvent.click(tradeLink);
		expect(onTradeClick).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole("button", { name: "Dismiss slider" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("keeps the bottom-sheet slider on mobile", () => {
		renderSlider(true);

		expect(screen.getByTestId("day-trades-drawer").dataset.direction).toBe(
			"bottom",
		);
		expect(screen.getByTestId("day-trades-drawer-content").className).toContain(
			"max-h-[92vh]",
		);
		expect(
			screen.getByRole("heading", { name: /friday, january 3, 2025/i }),
		).toBeTruthy();
		expect(screen.getByText("AAPL")).toBeTruthy();
	});
});
