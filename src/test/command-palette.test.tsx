// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/command-palette/command-palette";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	setTheme: vi.fn(),
	session: { user: { id: "u1" } } as object | null,
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
}));
vi.mock("@/components/theme-provider", () => ({
	useTheme: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: mocks.session }) },
}));
vi.mock("@/components/command-palette/command-preview", () => ({
	CommandPreview: () => <div>Review before saving</div>,
}));
beforeAll(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.session = { user: { id: "u1" } };
});
function setup() {
	function Harness() {
		const [open, setOpen] = useState(false);
		return <CommandPalette open={open} onOpenChange={setOpen} />;
	}
	render(<Harness />);
}
describe("palette keyboard flow", () => {
	it.each(["ctrlKey", "metaKey"])(
		"opens with %s+K and navigates on Enter",
		async (modifier) => {
			setup();
			fireEvent.keyDown(document, { key: "k", [modifier]: true });
			const input = screen.getByRole("combobox");
			fireEvent.change(input, { target: { value: "journal" } });
			await waitFor(() =>
				expect(screen.getByRole("option").getAttribute("aria-selected")).toBe(
					"true",
				),
			);
			fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
			await waitFor(() =>
				expect(mocks.navigate).toHaveBeenCalledWith({ to: "/journal" }),
			);
		},
	);
	it("supports arrow selection", async () => {
		setup();
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		const input = screen.getByRole("combobox");
		await waitFor(() =>
			expect(
				screen
					.getByRole("option", { name: /Dashboard/ })
					.getAttribute("aria-selected"),
			).toBe("true"),
		);
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/journal" });
	});
	it("changes theme and requires a separate preview for writes", async () => {
		setup();
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "dark mode" },
		});
		fireEvent.click(screen.getByRole("option", { name: "Dark mode" }));
		expect(mocks.setTheme).toHaveBeenCalledWith("dark");
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "short gold" },
		});
		fireEvent.click(screen.getByRole("option", { name: /Log short XAUUSDM/ }));
		expect(screen.getByText("Review before saving")).toBeTruthy();
	});
	it("does not open without a session", () => {
		mocks.session = null;
		setup();
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
