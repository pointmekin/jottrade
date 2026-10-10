// @vitest-environment jsdom

import {
	act,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewSaveStatus } from "@/components/reviews/review-save-status";
import { useReviewAutosave } from "@/hooks/use-review-autosave";
import type { RevisionedFields } from "@/lib/review-draft";

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));

type Notes = RevisionedFields<{ notes: string }>;
const KEY = "jottrade.review-draft.v1:u1:1:trade:1";
const server: Notes = { revision: 1, fields: { notes: "server" } };

function renderAutosave(
	save: (draft: Notes) => Promise<Notes>,
	reload: () => Promise<Notes>,
) {
	localStorage.setItem(
		KEY,
		JSON.stringify({
			revision: 1,
			generation: 1,
			fields: { notes: "offline" },
		}),
	);
	return renderHook(() => useReviewAutosave(KEY, server, save, reload));
}

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("review autosave on reconnect", () => {
	it("saves a local draft with the expected revision when the device is online again", async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error("Failed to fetch"))
			.mockResolvedValueOnce({ revision: 2, fields: { notes: "offline" } });
		const reload = vi.fn().mockResolvedValue(server);
		const { result } = renderAutosave(save, reload);
		await waitFor(() => expect(result.current.status).toBe("error"));

		act(() => {
			window.dispatchEvent(new Event("online"));
		});

		await waitFor(() => expect(result.current.status).toBe("saved"));
		expect(reload).toHaveBeenCalled();
		expect(save).toHaveBeenLastCalledWith({
			revision: 1,
			fields: { notes: "offline" },
		});
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it("shows a conflict and does not save when the server has a newer edit", async () => {
		const save = vi.fn().mockRejectedValueOnce(new Error("Failed to fetch"));
		const reload = vi
			.fn()
			.mockResolvedValue({ revision: 2, fields: { notes: "newer" } });
		const { result } = renderAutosave(save, reload);
		await waitFor(() => expect(result.current.status).toBe("error"));

		act(() => {
			window.dispatchEvent(new Event("online"));
		});

		await waitFor(() => expect(result.current.status).toBe("conflict"));
		expect(save).toHaveBeenCalledTimes(1);
		expect(result.current.fields.notes).toBe("offline");
	});
});

describe("review save status", () => {
	it("says the draft is on this device only when a save fails offline", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		render(
			<ReviewSaveStatus
				status="error"
				error="Failed to fetch"
				retry={vi.fn()}
				reload={vi.fn()}
				resolve={vi.fn()}
				serverText=""
			/>,
		);

		expect(screen.getByRole("alert").textContent).toBe(
			"Offline. Saved on this device only.",
		);
	});
});
