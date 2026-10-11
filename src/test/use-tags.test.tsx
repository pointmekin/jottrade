// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isPendingTag,
	useCreateTag,
	useDeleteTag,
	useTags,
	useUpdateTag,
} from "@/hooks/use-tags";
import { QueryKey } from "@/lib/query-keys";
import { TagColor, type TradeTag } from "@/lib/trade-tag";

const mocks = vi.hoisted(() => ({
	createTag: vi.fn(),
	updateTag: vi.fn(),
	deleteTag: vi.fn(),
	getTags: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@/server/tagActions", () => mocks);
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

const late = { id: 1, name: "Late entry", color: TagColor.Gray };
const fomo = { id: 2, name: "FOMO", color: TagColor.Pink };

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function setup<Result>(hook: () => Result, tags: TradeTag[] = [late]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: Infinity } },
	});
	queryClient.setQueryData([QueryKey.Tags], tags);
	mocks.getTags.mockImplementation(async () => tags);
	const { result } = renderHook(hook, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	});
	const cached = () =>
		queryClient.getQueryData<TradeTag[]>([QueryKey.Tags]) ?? [];
	return { result, cached, queryClient };
}

afterEach(() => vi.clearAllMocks());

describe("useCreateTag", () => {
	it("shows the new tag at once, then replaces it with the saved tag", async () => {
		const request = deferred<TradeTag>();
		mocks.createTag.mockReturnValue(request.promise);
		const { result, cached } = setup(() => useCreateTag());

		act(() => result.current.mutate("  breakout  "));

		await waitFor(() => expect(cached()).toHaveLength(2));
		const [pending] = cached();
		expect(pending.name).toBe("breakout");
		expect(isPendingTag(pending)).toBe(true);

		const saved = { id: 7, name: "breakout", color: TagColor.Gray };
		mocks.getTags.mockResolvedValue([saved, late]);
		await act(async () => request.resolve(saved));

		await waitFor(() => expect(cached()).toEqual([saved, late]));
	});

	it("removes the pending tag and shows an error when the request fails", async () => {
		mocks.createTag.mockRejectedValue(new Error("Network error."));
		const { result, cached } = setup(() => useCreateTag());

		await act(async () => {
			await result.current.mutateAsync("Breakout").catch(() => undefined);
		});

		expect(cached()).toEqual([late]);
		expect(mocks.toastError).toHaveBeenCalledWith(
			"The tag “Breakout” was not created.",
			{ description: "Network error." },
		);
	});

	it("keeps one tag when the server returns an existing tag", async () => {
		const request = deferred<TradeTag>();
		mocks.createTag.mockReturnValue(request.promise);
		const { result, cached } = setup(() => useCreateTag(), [fomo, late]);
		mocks.getTags.mockReturnValue(new Promise(() => undefined));

		act(() => result.current.mutate("fomo"));
		await act(async () => request.resolve(fomo));

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(cached()).toEqual([fomo, late]);
	});

	it("keeps a concurrent pending tag when another create fails", async () => {
		const first = deferred<TradeTag>();
		const second = deferred<TradeTag>();
		mocks.createTag
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const { result, cached } = setup(
			() => [useCreateTag(), useCreateTag(), useTags()] as const,
		);

		act(() => result.current[0].mutate("Alpha"));
		act(() => result.current[1].mutate("Zulu"));
		await waitFor(() => expect(cached()).toHaveLength(3));

		await act(async () => first.reject(new Error("Failed.")));

		expect(cached().map((tag) => tag.name)).toEqual(["Late entry", "Zulu"]);
		expect(mocks.getTags).not.toHaveBeenCalled();
	});
});

describe("useUpdateTag", () => {
	it("renames the tag at once and restores it when the server rejects", async () => {
		const request = deferred<TradeTag>();
		mocks.updateTag.mockReturnValue(request.promise);
		const { result, cached } = setup(() => useUpdateTag(late), [fomo, late]);

		act(() => result.current.mutate({ name: "Early exit" }));

		await waitFor(() =>
			expect(cached().map((tag) => tag.name)).toEqual(["Early exit", "FOMO"]),
		);

		await act(async () =>
			request.reject(new Error("A tag with this name already exists.")),
		);

		expect(cached()).toEqual([fomo, late]);
		expect(mocks.toastError).toHaveBeenCalledWith("The tag was not saved.", {
			description: "A tag with this name already exists.",
		});
	});
});

describe("useDeleteTag", () => {
	it("removes the tag at once and restores it when the request fails", async () => {
		const request = deferred<{ success: boolean }>();
		mocks.deleteTag.mockReturnValue(request.promise);
		const { result, cached } = setup(() => useDeleteTag(fomo), [fomo, late]);

		act(() => result.current.mutate());

		await waitFor(() => expect(cached()).toEqual([late]));

		await act(async () => request.reject(new Error("Tag not found.")));

		expect(cached()).toEqual([fomo, late]);
	});
});
