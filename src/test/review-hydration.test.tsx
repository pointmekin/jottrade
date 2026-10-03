// @vitest-environment jsdom
import { act, useCallback } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReviewAutosave } from "@/hooks/use-review-autosave";

vi.mock("@tanstack/react-router", () => ({ useBlocker: () => {} }));
const server = { revision: 0, fields: { notes: "server text" } };
function Editor() {
	const reload = useCallback(async () => server, []);
	const save = useCallback(() => new Promise<typeof server>(() => {}), []);
	const editor = useReviewAutosave(
		"hydrate-owner-account-period",
		server,
		save,
		reload,
	);
	return (
		<>
			<textarea
				aria-label="Notes"
				value={editor.fields.notes}
				onChange={(event) => editor.edit({ notes: event.target.value })}
			/>
			<span>{editor.status}</span>
		</>
	);
}
const values = new Map<string, string>();
const storage = {
	getItem: vi.fn((key: string) => values.get(key) ?? null),
	setItem: (key: string, value: string) => {
		values.set(key, value);
	},
	removeItem: (key: string) => {
		values.delete(key);
	},
};
beforeEach(() => {
	values.clear();
	storage.getItem.mockClear();
	vi.stubGlobal("localStorage", storage);
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
it("renders the same initial snapshot and restores the scoped draft only after hydration", async () => {
	window.localStorage.setItem(
		"hydrate-owner-account-period",
		JSON.stringify({
			revision: 0,
			generation: 1,
			fields: { notes: "recovered draft" },
		}),
	);
	const get = storage.getItem;
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	const html = renderToString(<Editor />);
	expect(html).toContain("server text");
	expect(get).not.toHaveBeenCalled();
	const host = document.createElement("div");
	host.innerHTML = html;
	document.body.append(host);
	let root: ReturnType<typeof hydrateRoot> | undefined;
	await act(async () => {
		root = hydrateRoot(host, <Editor />);
	});
	expect(host.querySelector("textarea")?.value).toBe("recovered draft");
	expect(errors).not.toHaveBeenCalled();
	await act(async () => root?.unmount());
	host.remove();
});
