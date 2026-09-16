// @vitest-environment jsdom
import {
	act,
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
	CommandPreview: () => <div>Review before saving</div>,
}));

type Handler = ((event: unknown) => void) | null;
class FakeRecognition {
	static instances: FakeRecognition[] = [];
	static failOnStart = false;
	lang = "";
	continuous = false;
	interimResults = false;
	started = 0;
	aborted = 0;
	onresult: Handler = null;
	onerror: Handler = null;
	onend: Handler = null;
	constructor() {
		FakeRecognition.instances.push(this);
	}
	start() {
		if (FakeRecognition.failOnStart) throw new Error("blocked");
		this.started++;
	}
	abort() {
		this.aborted++;
	}
}
const latest = () => FakeRecognition.instances.at(-1) as FakeRecognition;
function results(entries: { transcript: string; isFinal: boolean }[]) {
	return {
		results: entries.map((entry) => ({
			0: { transcript: entry.transcript },
			isFinal: entry.isFinal,
			length: 1,
		})),
	};
}
function say(entries: { transcript: string; isFinal: boolean }[]) {
	act(() => latest().onresult?.(results(entries)));
}

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
	FakeRecognition.instances = [];
	FakeRecognition.failOnStart = false;
	Reflect.deleteProperty(window, "SpeechRecognition");
	Reflect.deleteProperty(window, "webkitSpeechRecognition");
});

function support(key: "SpeechRecognition" | "webkitSpeechRecognition") {
	Object.defineProperty(window, key, {
		value: FakeRecognition,
		configurable: true,
		writable: true,
	});
}
function setup() {
	const result = { close: () => {} };
	function Harness() {
		const [open, setOpen] = useState(false);
		result.close = () => setOpen(false);
		return <CommandPalette open={open} onOpenChange={setOpen} />;
	}
	const view = render(<Harness />);
	fireEvent.keyDown(document, { key: "k", metaKey: true });
	return { ...view, ...result };
}
const mic = () => screen.queryByRole("button", { name: "Dictate a command" });
const stopButton = () => screen.getByRole("button", { name: "Stop dictation" });

describe("palette dictation", () => {
	it("hides the microphone when the browser has no speech recognition", async () => {
		setup();
		await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
		expect(mic()).toBeNull();
		expect(screen.getByRole("combobox")).toBeTruthy();
	});

	it.each(["SpeechRecognition", "webkitSpeechRecognition"] as const)(
		"shows the microphone for %s and asks for permission only on start",
		async (key) => {
			support(key);
			setup();
			await waitFor(() => expect(mic()).toBeTruthy());
			expect(FakeRecognition.instances).toHaveLength(0);

			fireEvent.click(mic() as HTMLElement);
			expect(latest().started).toBe(1);
			expect(latest().interimResults).toBe(true);
			expect(screen.getByText(/Listening/)).toBeTruthy();
		},
	);

	it("shows the interim transcript, then puts the final text in the input", async () => {
		support("SpeechRecognition");
		setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);

		say([{ transcript: "deposit one", isFinal: false }]);
		expect(screen.getByText("deposit one")).toBeTruthy();

		say([{ transcript: "deposit 1000", isFinal: true }]);
		expect(screen.getByRole("combobox")).toHaveProperty(
			"value",
			"deposit 1000",
		);
		expect(screen.queryByText(/Listening/)).toBeNull();
		expect(latest().aborted).toBe(1);
	});

	it("never saves a transcript on its own", async () => {
		support("SpeechRecognition");
		setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);
		say([{ transcript: "deposit 1000", isFinal: true }]);

		expect(screen.queryByText("Review before saving")).toBeNull();
		expect(screen.getByText("Add deposit")).toBeTruthy();

		fireEvent.click(screen.getByText("Add deposit"));
		expect(screen.getByText("Review before saving")).toBeTruthy();
	});

	it("stops dictation when the preview opens", async () => {
		support("SpeechRecognition");
		setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "deposit" },
		});
		fireEvent.click(mic() as HTMLElement);
		fireEvent.click(screen.getByText("Add deposit"));

		expect(screen.getByText("Review before saving")).toBeTruthy();
		expect(latest().aborted).toBe(1);
	});

	it("stops dictation when the palette closes", async () => {
		support("SpeechRecognition");
		const { close } = setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);

		act(() => close());
		expect(latest().aborted).toBe(1);
	});

	it("stops dictation on unmount", async () => {
		support("SpeechRecognition");
		const { unmount } = setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);

		unmount();
		expect(latest().aborted).toBe(1);
	});

	it("stops dictation when the user presses stop", async () => {
		support("SpeechRecognition");
		setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);
		fireEvent.click(stopButton());

		expect(latest().aborted).toBe(1);
		expect(screen.queryByText(/Listening/)).toBeNull();
		expect(mic()).toBeTruthy();
	});

	it.each([
		["not-allowed", /Microphone access is blocked/],
		["audio-capture", /No microphone was found/],
		["no-speech", /Nothing was heard/],
		["unknown-code", /Dictation failed/],
	])("reports the %s error and keeps typing usable", async (code, message) => {
		support("SpeechRecognition");
		setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);
		act(() => latest().onerror?.({ error: code }));

		expect(screen.getByRole("alert").textContent).toMatch(message);
		expect(latest().aborted).toBe(1);

		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "journal" },
		});
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByText("Journal")).toBeTruthy();
	});

	it("reports a start failure without leaving a listening state", async () => {
		support("SpeechRecognition");
		FakeRecognition.failOnStart = true;
		setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);

		expect(screen.getByRole("alert").textContent).toMatch(/Dictation failed/);
		expect(screen.queryByText(/Listening/)).toBeNull();
		expect(mic()).toBeTruthy();
	});

	it("clears the listening state when recognition ends by itself", async () => {
		support("SpeechRecognition");
		setup();
		await waitFor(() => expect(mic()).toBeTruthy());
		fireEvent.click(mic() as HTMLElement);
		act(() => latest().onend?.(undefined));

		expect(screen.queryByText(/Listening/)).toBeNull();
		expect(mic()).toBeTruthy();
	});
});
