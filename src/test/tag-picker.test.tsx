// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagPicker } from "@/components/tags/tag-picker";
import { QueryKey } from "@/lib/query-keys";
import { TagColor, type TradeTag } from "@/lib/trade-tag";

const mocks = vi.hoisted(() => ({
	createTag: vi.fn(),
	getTags: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@/server/tagActions", () => mocks);
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => undefined;

function renderPicker(onSelect: (tag: TradeTag) => void) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: Infinity } },
	});
	queryClient.setQueryData([QueryKey.Tags], []);
	render(
		<QueryClientProvider client={queryClient}>
			<TagPicker
				trigger={<button type="button">Tags</button>}
				selectedIds={[]}
				onSelect={onSelect}
			/>
		</QueryClientProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Tags" }));
	return screen.getByPlaceholderText("Find or create a tag");
}

describe("TagPicker", () => {
	it("shows a new tag as saving, then selects the saved tag", async () => {
		let resolve!: (tag: TradeTag) => void;
		mocks.createTag.mockReturnValue(
			new Promise<TradeTag>((res) => {
				resolve = res;
			}),
		);
		mocks.getTags.mockReturnValue(new Promise(() => undefined));
		const onSelect = vi.fn();
		const input = renderPicker(onSelect);

		fireEvent.change(input, { target: { value: "Breakout" } });
		fireEvent.click(await screen.findByText("Breakout"));

		expect(await screen.findByText("Saving…")).toBeTruthy();
		expect(onSelect).not.toHaveBeenCalled();

		const saved = { id: 9, name: "Breakout", color: TagColor.Gray };
		await act(async () => resolve(saved));

		expect(onSelect).toHaveBeenCalledWith(saved);
		await waitFor(() => expect(screen.queryByText("Saving…")).toBeNull());
	});

	it("restores the typed name when the tag is not created", async () => {
		mocks.createTag.mockRejectedValue(new Error("Network error."));
		const input = renderPicker(vi.fn());

		fireEvent.change(input, { target: { value: "Breakout" } });
		await act(async () => {
			fireEvent.click(await screen.findByText("Breakout"));
		});

		expect((input as HTMLInputElement).value).toBe("Breakout");
		expect(screen.queryByText("Saving…")).toBeNull();
		expect(mocks.toastError).toHaveBeenCalled();
	});
});
