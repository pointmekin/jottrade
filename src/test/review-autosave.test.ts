import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewAutosave } from "@/lib/review-autosave";
import { type RevisionedFields, reviewDraftKey } from "@/lib/review-draft";

function storage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
}
function createEditor(
	key: string,
	server: RevisionedFields<{ notes: string }>,
	store: ReturnType<typeof storage>,
	save: (
		draft: RevisionedFields<{ notes: string }>,
	) => Promise<RevisionedFields<{ notes: string }>>,
) {
	const editor = new ReviewAutosave(key, server, store, save);
	editor.restore();
	return editor;
}
const initial = { revision: 0, fields: { notes: "server" } };
afterEach(() => vi.useRealTimers());
describe("durable review autosave", () => {
	it("keeps failed text across remount and retries without retyping", async () => {
		const store = storage();
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ revision: 1, fields: { notes: "draft" } });
		const editor = createEditor("u1:a1:t1", initial, store, save);
		editor.edit({ notes: "draft" });
		await editor.flush();
		expect(editor.getSnapshot().status).toBe("error");
		editor.dispose();
		const restored = createEditor("u1:a1:t1", initial, store, save);
		expect(restored.getSnapshot().fields.notes).toBe("draft");
		await restored.flush();
		expect(restored.getSnapshot().status).toBe("saved");
		expect(store.getItem("u1:a1:t1")).toBeNull();
	});
	it("serializes writes and does not clear later text on an older acknowledgment", async () => {
		const store = storage();
		let release:
			| ((value: RevisionedFields<{ notes: string }>) => void)
			| undefined;
		const save = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						release = resolve;
					}),
			)
			.mockResolvedValueOnce({ revision: 2, fields: { notes: "latest" } });
		const editor = createEditor("record", initial, store, save);
		editor.edit({ notes: "old" });
		const pending = editor.flush();
		editor.edit({ notes: "latest" });
		expect(save).toHaveBeenCalledTimes(1);
		release?.({ revision: 1, fields: { notes: "old" } });
		await pending;
		expect(save.mock.calls[1][0]).toEqual({
			revision: 1,
			fields: { notes: "latest" },
		});
		expect(editor.getSnapshot().fields.notes).toBe("latest");
		expect(editor.getSnapshot().revision).toBe(2);
	});
	it("does not delete another tab's newer durable draft after acknowledgment", async () => {
		const store = storage();
		let release: (value: RevisionedFields<{ notes: string }>) => void =
			() => {};
		const save = () =>
			new Promise<RevisionedFields<{ notes: string }>>((resolve) => {
				release = resolve;
			});
		const first = createEditor("key", initial, store, save);
		first.edit({ notes: "first tab" });
		const pending = first.flush();
		const second = createEditor("key", initial, store, vi.fn());
		second.edit({ notes: "second tab" });
		second.dispose();
		release({ revision: 1, fields: { notes: "first tab" } });
		await pending;
		expect(JSON.parse(store.getItem("key") ?? "{}").fields.notes).toBe(
			"second tab",
		);
	});
	it("keeps identities separate across account/user/period switches", () => {
		const store = storage();
		const key = reviewDraftKey("user-a", 1, "DAILY:2026-10-02");
		const editor = createEditor(key, initial, store, vi.fn());
		editor.edit({ notes: "A" });
		editor.dispose();
		for (const other of [
			reviewDraftKey("user-b", 1, "DAILY:2026-10-02"),
			reviewDraftKey("user-a", 2, "DAILY:2026-10-02"),
			reviewDraftKey("user-a", 1, "DAILY:2026-10-03"),
		])
			expect(
				createEditor(other, initial, store, vi.fn()).getSnapshot().fields.notes,
			).toBe("server");
	});
	it("requires explicit conflict resolution and ignores stale server reads", async () => {
		const store = storage();
		const save = vi
			.fn()
			.mockResolvedValue({ revision: 4, fields: { notes: "mine" } });
		const editor = createEditor("key", initial, store, save);
		editor.edit({ notes: "mine" });
		editor.reconcile({ revision: 3, fields: { notes: "theirs" } });
		editor.edit({ notes: "mine changed" });
		await editor.flush();
		expect(save).not.toHaveBeenCalled();
		expect(editor.getSnapshot().status).toBe("conflict");
		editor.resolve(false);
		expect(editor.getSnapshot().fields.notes).toBe("theirs");
		editor.reconcile(initial);
		expect(editor.getSnapshot().revision).toBe(3);
	});
	it("reconciles a committed save whose response was lost", async () => {
		const store = storage();
		const editor = createEditor(
			"key",
			initial,
			store,
			vi.fn().mockRejectedValue(new Error("network")),
		);
		editor.edit({ notes: "committed" });
		await editor.flush();
		editor.reconcile({ revision: 1, fields: { notes: "committed" } });
		expect(editor.getSnapshot().status).toBe("saved");
		expect(store.getItem("key")).toBeNull();
	});
	it("makes storage failure visible while preserving in-memory text", () => {
		const store = storage();
		store.setItem = () => {
			throw new Error("quota");
		};
		const editor = createEditor("key", initial, store, vi.fn());
		editor.edit({ notes: "keep me" });
		expect(editor.getSnapshot()).toMatchObject({
			status: "storage-error",
			fields: { notes: "keep me" },
		});
	});
	it("debounces typing and flushes on explicit save", async () => {
		vi.useFakeTimers();
		const save = vi
			.fn()
			.mockResolvedValue({ revision: 1, fields: { notes: "abc" } });
		const editor = createEditor("key", initial, storage(), save);
		editor.edit({ notes: "a" });
		editor.edit({ notes: "abc" });
		await vi.advanceTimersByTimeAsync(699);
		expect(save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(save).toHaveBeenCalledTimes(1);
	});
});
