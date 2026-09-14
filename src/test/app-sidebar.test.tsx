// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
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
	SidebarMenuButton: ({ children }: { children: ReactNode }) => children,
	SidebarMenuItem: ({ children }: { children: ReactNode }) => (
		<li>{children}</li>
	),
	useSidebar: () => ({ state: "expanded", toggleSidebar: vi.fn() }),
}));

function primaryMouseEvent() {
	return { button: 0, detail: 1 };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("AppSidebar navigation", () => {
	it("navigates each sidebar link once on primary mouse-down", () => {
		render(<AppSidebar />);

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
		render(<AppSidebar />);
		const link = screen.getByRole("link", { name: "Journal" });

		fireEvent.mouseDown(link, { button: 0, ctrlKey: true });
		fireEvent.click(link, { button: 0, ctrlKey: true, detail: 1 });
		fireEvent.mouseDown(link, { button: 1 });

		expect(navigate).not.toHaveBeenCalled();
		expect(link.getAttribute("href")).toBe("/journal");
	});

	it("keeps keyboard link activation working", () => {
		render(<AppSidebar />);
		const link = screen.getByRole("link", { name: "Journal" });

		fireEvent.click(link, { button: 0, detail: 0 });

		expect(navigate).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith({ to: "/journal" });
	});
});
