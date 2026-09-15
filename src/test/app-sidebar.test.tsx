// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/app-sidebar";
import { navItems } from "@/lib/nav-items";

const navigate = vi.fn();

type MockLinkProps = ComponentProps<"a"> & { to: string };

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, onClick, to, ...props }: MockLinkProps) => (
		<a
			{...props}
			href={to}
			onClick={(event) => {
				onClick?.(event);
				if (
					!event.defaultPrevented &&
					event.button === 0 &&
					!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
				) {
					event.preventDefault();
					navigate({ to });
				}
			}}
		>
			{children}
		</a>
	),
	useLocation: () => ({ pathname: "/dashboard" }),
	useRouter: () => ({ navigate }),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: null, isPending: true }),
		signOut: vi.fn(),
	},
}));

vi.mock("@/server/portfolioActions", () => ({
	createAccount: vi.fn(),
	updateAccount: vi.fn(),
	deleteAccount: vi.fn(),
}));
const state = vi.hoisted(() => ({ setActiveAccount: vi.fn() }));

const mockAccounts = vi.hoisted(() => [
	{
		id: 1,
		name: "Main account",
		description: null,
		kind: "REAL",
		currency: "USD",
		isDefault: true,
		tradeCount: 3,
	},
	{
		id: 2,
		name: "Exness Live",
		description: "Primary funded account",
		kind: "REAL",
		currency: "USD",
		isDefault: false,
		tradeCount: 41,
	},
	{
		id: 3,
		name: "Exness Demo",
		description: null,
		kind: "DEMO",
		currency: "USD",
		isDefault: false,
		tradeCount: 0,
	},
]);

vi.mock("@/hooks/use-accounts", () => ({
	useAccounts: () => ({
		accounts: mockAccounts,
		activeAccount: mockAccounts[0],
		setActiveAccount: state.setActiveAccount,
		clearActiveAccount: vi.fn(),
		isLoading: false,
		isError: false,
	}),
}));

vi.mock("@/components/ui/sidebar", () => ({
	Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
	SidebarContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SidebarFooter: ({ children }: { children: ReactNode }) => (
		<footer>{children}</footer>
	),
	SidebarGroup: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SidebarGroupContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
	SidebarMenuButton: ({
		asChild: _asChild,
		tooltip: _tooltip,
		children,
		...props
	}: ComponentProps<"button"> & { asChild?: boolean; tooltip?: string }) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	SidebarMenuItem: ({ children }: { children: ReactNode }) => (
		<li>{children}</li>
	),
	useSidebar: () => ({ state: "expanded", toggleSidebar: vi.fn() }),
}));

function primaryMouseEvent() {
	return { button: 0, detail: 1 };
}

function renderSidebar() {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	return render(<AppSidebar />, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	});
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("AppSidebar navigation", () => {
	it("navigates each sidebar link once on primary mouse-down", () => {
		renderSidebar();

		for (const item of navItems) {
			const link = screen.getByRole("link", { name: item.title });
			expect(link.getAttribute("href")).toBe(item.url);

			fireEvent.mouseDown(link, primaryMouseEvent());
			expect(navigate).toHaveBeenLastCalledWith({ to: item.url });
			expect(navigate).toHaveBeenCalledTimes(1);

			fireEvent.click(link, primaryMouseEvent());
			expect(navigate).toHaveBeenCalledTimes(1);
			navigate.mockClear();
		}
	});

	it("leaves modified and non-primary mouse interactions to the link", () => {
		renderSidebar();
		const link = screen.getByRole("link", { name: "Journal" });

		fireEvent.mouseDown(link, { button: 0, ctrlKey: true });
		fireEvent.click(link, { button: 0, ctrlKey: true, detail: 1 });
		fireEvent.mouseDown(link, { button: 1 });

		expect(navigate).not.toHaveBeenCalled();
		expect(link.getAttribute("href")).toBe("/journal");
	});

	it("keeps keyboard link activation working", () => {
		renderSidebar();
		const link = screen.getByRole("link", { name: "Journal" });

		fireEvent.click(link, { button: 0, detail: 0 });

		expect(navigate).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith({ to: "/journal" });
	});

	it("switches the active account from the switcher menu", async () => {
		renderSidebar();

		const trigger = screen.getByRole("button", { name: /Main account/ });
		fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
		fireEvent.click(trigger);

		const demoItem = await screen.findByRole("menuitem", {
			name: /Exness Demo/,
		});
		fireEvent.click(demoItem);

		await waitFor(() => expect(state.setActiveAccount).toHaveBeenCalledWith(3));
	});
});
