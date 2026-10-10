import { useBlocker } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ReviewAutosave } from "@/lib/review-autosave";
import type { RevisionedFields } from "@/lib/review-draft";

export function useReviewAutosave<T extends object>(
	key: string,
	server: RevisionedFields<T>,
	save: (draft: RevisionedFields<T>) => Promise<RevisionedFields<T>>,
	reload: () => Promise<RevisionedFields<T>>,
) {
	const [controller] = useState(
		() =>
			new ReviewAutosave(
				key,
				server,
				{
					getItem: (value) => window.localStorage.getItem(value),
					setItem: (name, value) => window.localStorage.setItem(name, value),
					removeItem: (value) => window.localStorage.removeItem(value),
				},
				save,
			),
	);
	const state = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getServerSnapshot,
	);
	useBlocker({
		shouldBlockFn: () => controller.getSnapshot().status === "storage-error",
		enableBeforeUnload: () =>
			controller.getSnapshot().status === "storage-error",
	});
	useEffect(() => {
		controller.restore();
		if (controller.getSnapshot().status === "local") void controller.flush();
		const refresh = () => {
			void reload()
				.then((value) => controller.reconcile(value))
				.catch(() => {});
		};
		const reconnect = () => {
			void reload()
				.then((value) => {
					controller.reconcile(value);
					const { status } = controller.getSnapshot();
					if (status === "local" || status === "error")
						return controller.flush();
				})
				.catch(() => {});
		};
		window.addEventListener("focus", refresh);
		window.addEventListener("storage", refresh);
		window.addEventListener("online", reconnect);
		return () => {
			window.removeEventListener("focus", refresh);
			window.removeEventListener("storage", refresh);
			window.removeEventListener("online", reconnect);
			controller.dispose();
		};
	}, [controller, reload]);
	useEffect(() => {
		controller.reconcile(server);
	}, [controller, server]);
	return {
		...state,
		edit: (fields: T) => controller.edit(fields),
		flush: () => controller.flush(),
		reload: async () => controller.reconcile(await reload()),
		resolve: (keep: boolean) => controller.resolve(keep),
	};
}
