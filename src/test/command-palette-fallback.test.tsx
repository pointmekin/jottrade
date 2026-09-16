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
	extract: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
}));
vi.mock("@/components/theme-provider", () => ({
	useTheme: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "u1" } } }) },
}));
vi.mock("@/server/commandIntentActions", () => ({
	extractCommandIntent: mocks.extract,
}));
vi.mock("@/components/command-palette/command-preview", () => ({
	CommandPreview: ({ warning }: { warning?: string }) => (
		<div>Review before saving{warning ? `: ${warning}` : ""}</div>
	),
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
});

function open(query: string) {
	function Harness() {
		const [isOpen, setOpen] = useState(false);
		return <CommandPalette open={isOpen} onOpenChange={setOpen} />;
	}
	render(<Harness />);
	fireEvent.keyDown(document, { key: "k", metaKey: true });
	fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
}
const fallback = () => screen.queryByText("Interpret with Gemini");

describe("Gemini fallback", () => {
	it("stays hidden for an empty query and a confident local command", () => {
		open("");
		expect(fallback()).toBeNull();
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "journal" },
		});
		expect(fallback()).toBeNull();
		expect(mocks.extract).not.toHaveBeenCalled();
	});

	it("does not call Gemini until the user selects the fallback", async () => {
		mocks.extract.mockResolvedValue({
			intent: "account-entry",
			kind: "DEPOSIT",
			amount: "1000",
		});
		open("I put another thousand dollars into my account");
		expect(mocks.extract).not.toHaveBeenCalled();

		fireEvent.click(screen.getByText("Interpret with Gemini"));
		await waitFor(() =>
			expect(screen.getByText(/Review before saving/)).toBeTruthy(),
		);
		expect(mocks.extract).toHaveBeenCalledWith({
			data: { command: "I put another thousand dollars into my account" },
		});
		expect(screen.getByText(/Review before saving/).textContent).toMatch(
			/Gemini/,
		);
	});

	it("applies a navigation intent without a confirmation step", async () => {
		mocks.extract.mockResolvedValue({
			intent: "navigation",
			path: "/journal",
		});
		open("show me where my trades live");
		fireEvent.click(screen.getByText("Interpret with Gemini"));

		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({ to: "/journal" }),
		);
	});

	it("keeps local commands usable when Gemini fails", async () => {
		mocks.extract.mockRejectedValue(new Error("Could not reach Gemini."));
		open("something vague");
		fireEvent.click(screen.getByText("Interpret with Gemini"));

		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toMatch(/Gemini/),
		);
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "journal" },
		});
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByText("Journal")).toBeTruthy();
	});

	it("reports an unsupported intent instead of saving", async () => {
		mocks.extract.mockResolvedValue({ intent: "unknown" });
		open("delete my account please");
		fireEvent.click(screen.getByText("Interpret with Gemini"));

		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toMatch(
				/did not match a supported command/,
			),
		);
		expect(screen.queryByText(/Review before saving/)).toBeNull();
	});

	it("shows a spinner and disables the local commands while it interprets", async () => {
		mocks.extract.mockReturnValue(new Promise(() => {}));
		open("deposit something vague");
		fireEvent.click(screen.getByText("Interpret with Gemini"));

		await waitFor(() => expect(screen.getByText("Interpreting…")).toBeTruthy());
		expect(screen.getByRole("status")).toBeTruthy();
		const local = screen
			.getAllByRole("option")
			.filter((item) => !item.textContent?.includes("Interpreting…"));
		expect(local.length).toBeGreaterThan(0);
		for (const item of local) {
			expect(item.getAttribute("data-disabled")).toBe("true");
		}
	});

	it("discards a response that arrives after the query changed", async () => {
		let settle: (value: unknown) => void = () => {};
		mocks.extract.mockReturnValue(
			new Promise((resolve) => {
				settle = resolve;
			}),
		);
		open("something vague");
		fireEvent.click(screen.getByText("Interpret with Gemini"));
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "deposit" },
		});
		settle({ intent: "navigation", path: "/settings" });

		await waitFor(() => expect(screen.getByText("Add deposit")).toBeTruthy());
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
