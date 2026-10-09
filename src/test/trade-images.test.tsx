// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeImages } from "@/components/journal/trade-images";
import type { Trade } from "@/lib/trade";
import { getSignedUploadUrl, saveTradeImage } from "@/server/imageActions";

vi.mock("@/server/imageActions", () => ({
	getSignedUploadUrl: vi.fn(),
	saveTradeImage: vi.fn(),
	deleteTradeImage: vi.fn(),
}));

const trade = { id: 7, screenshots: [] } as unknown as Trade;
const fetchMock = vi.fn();

function renderImages(onChange = vi.fn()) {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<TradeImages trade={trade} onChange={onChange} />
		</QueryClientProvider>,
	);
	return onChange;
}

function drop(...files: File[]) {
	const input = document.querySelector('input[type="file"]');
	if (!input) throw Error("File input not found.");
	fireEvent.change(input, { target: { files } });
}

const photo = () => new File(["jpg"], "image.jpg", { type: "image/jpeg" });
const uploadIds = () =>
	vi.mocked(getSignedUploadUrl).mock.calls.map(([call]) => call.data.uploadId);

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	vi.mocked(getSignedUploadUrl).mockImplementation(
		async ({ data }) =>
			({
				signedUrl: `https://signed/${data.uploadId}`,
				publicUrl: `https://public/${data.uploadId}`,
			}) as never,
	);
	vi.mocked(saveTradeImage).mockResolvedValue({
		success: true,
		alreadyAttached: false,
	} as never);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe("TradeImages uploads", () => {
	it("shows Failed with Retry, and the retry sends the same upload id", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
		const onChange = renderImages();

		drop(photo());

		expect(await screen.findByText("Failed: Upload failed: 503")).toBeTruthy();
		expect(screen.getByText("image.jpg")).toBeTruthy();
		expect(saveTradeImage).not.toHaveBeenCalled();

		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
		fireEvent.click(screen.getByRole("button", { name: "Retry image.jpg" }));

		await waitFor(() => expect(screen.queryByText("image.jpg")).toBeNull());
		const [first, second] = uploadIds();
		expect(second).toBe(first);
		expect(saveTradeImage).toHaveBeenCalledExactlyOnceWith({
			data: { tradeId: 7, url: `https://public/${first}` },
		});
		expect(onChange).toHaveBeenCalledOnce();
	});

	it("removes a failed file without a retry", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		renderImages();

		drop(photo());
		fireEvent.click(
			await screen.findByRole("button", { name: "Remove image.jpg" }),
		);

		expect(screen.queryByText("image.jpg")).toBeNull();
		expect(getSignedUploadUrl).toHaveBeenCalledOnce();
	});

	it("gives two files with the same name two upload ids", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
		const onChange = renderImages();

		drop(photo(), photo());

		await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
		const ids = uploadIds();
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
		expect(saveTradeImage).toHaveBeenCalledTimes(2);
	});
});
