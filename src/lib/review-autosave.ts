import {
	type ReviewDraft,
	type RevisionedFields,
	sameReviewFields,
} from "./review-draft";

export type SaveStatus =
	| "saved"
	| "local"
	| "saving"
	| "error"
	| "conflict"
	| "storage-error";
export type AutosaveState<T> = {
	fields: T;
	revision: number;
	status: SaveStatus;
	serverFields: T;
	error: string | null;
};
export const DEVICE_STORAGE_ERROR =
	"Device storage failed. Copy your text before leaving.";
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export class ReviewAutosave<T extends object> {
	private draft: ReviewDraft<T>;
	private inFlight = false;
	private storedText: string | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private listeners = new Set<() => void>();
	private state: AutosaveState<T>;
	private initialSnapshot: AutosaveState<T>;
	constructor(
		private key: string,
		server: RevisionedFields<T>,
		private storage: DraftStorage,
		private save: (draft: RevisionedFields<T>) => Promise<RevisionedFields<T>>,
	) {
		this.draft = { ...server, generation: 0 };
		this.state = {
			...server,
			serverFields: server.fields,
			status: "saved",
			error: null,
		};
		this.initialSnapshot = this.state;
	}
	restore() {
		try {
			const text = this.storage.getItem(this.key);
			if (!text) return;
			this.storedText = text;
			const value: unknown = JSON.parse(text);
			if (!isDraft(value, this.draft.fields))
				throw new Error(
					"Invalid saved draft. Copy your notes before discarding it.",
				);
			const draft = value as ReviewDraft<T>;
			if (sameReviewFields(draft.fields, this.state.fields)) {
				this.clearStoredDraft();
				return;
			}
			this.draft = draft;
			const status =
				draft.revision === this.state.revision ? "local" : "conflict";
			this.publish({ ...this.state, fields: draft.fields, status });
		} catch (error) {
			this.publish({
				...this.state,
				status: "storage-error",
				error: String(error),
			});
		}
	}
	getSnapshot = () => this.state;
	getServerSnapshot = () => this.initialSnapshot;
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	private publish(state: AutosaveState<T>) {
		this.state = state;
		for (const listener of this.listeners) listener();
	}
	private persist() {
		try {
			const text = JSON.stringify(this.draft);
			this.storage.setItem(this.key, text);
			this.storedText = text;
			return true;
		} catch {
			this.publish({
				...this.state,
				status: "storage-error",
				error: DEVICE_STORAGE_ERROR,
			});
			return false;
		}
	}
	private clearStoredDraft() {
		try {
			if (this.storage.getItem(this.key) === this.storedText)
				this.storage.removeItem(this.key);
		} catch {
			this.publish({
				...this.state,
				status: "storage-error",
				error: DEVICE_STORAGE_ERROR,
			});
		}
	}
	edit(fields: T) {
		this.draft = {
			fields,
			revision: this.draft.revision,
			generation: this.draft.generation + 1,
		};
		const conflict = this.state.status === "conflict";
		this.publish({
			...this.state,
			fields,
			status: conflict ? "conflict" : "local",
			error: null,
		});
		if (!this.persist() || conflict) return;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			void this.flush();
		}, 700);
	}
	async flush() {
		clearTimeout(this.timer);
		if (
			this.inFlight ||
			this.state.status === "saved" ||
			this.state.status === "conflict"
		)
			return;
		const sent = this.draft;
		this.inFlight = true;
		this.publish({ ...this.state, status: "saving", error: null });
		try {
			const saved = await this.save({
				revision: sent.revision,
				fields: sent.fields,
			});
			this.draft = { ...this.draft, revision: saved.revision };
			const current = sent.generation === this.draft.generation;
			this.publish({
				...this.state,
				revision: saved.revision,
				serverFields: saved.fields,
				status: current ? "saved" : "local",
			});
			if (current) this.clearStoredDraft();
			else this.persist();
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Couldn't save. Your draft is kept.";
			this.publish({
				...this.state,
				status: message.includes("changed") ? "conflict" : "error",
				error: message,
			});
		} finally {
			this.inFlight = false;
		}
		if (this.state.status === "local") await this.flush();
	}
	reconcile(server: RevisionedFields<T>) {
		if (this.inFlight || server.revision < this.state.revision) return;
		if (
			server.revision === this.state.revision &&
			sameReviewFields(server.fields, this.state.serverFields)
		)
			return;
		if (sameReviewFields(server.fields, this.draft.fields)) {
			this.draft = { ...this.draft, revision: server.revision };
			this.publish({
				...this.state,
				...server,
				serverFields: server.fields,
				status: "saved",
				error: null,
			});
			this.clearStoredDraft();
			return;
		}
		if (this.state.status === "saved") {
			this.draft = { ...server, generation: this.draft.generation };
			this.publish({ ...this.state, ...server, serverFields: server.fields });
			return;
		}
		if (server.revision !== this.draft.revision)
			this.publish({
				...this.state,
				revision: server.revision,
				serverFields: server.fields,
				status: "conflict",
			});
	}
	resolve(keepLocal: boolean) {
		this.draft = {
			fields: keepLocal ? this.state.fields : this.state.serverFields,
			revision: this.state.revision,
			generation: this.draft.generation + 1,
		};
		this.publish({
			...this.state,
			fields: this.draft.fields,
			status: keepLocal ? "local" : "saved",
			error: null,
		});
		if (keepLocal) {
			this.persist();
			void this.flush();
		} else this.clearStoredDraft();
	}
	dispose() {
		clearTimeout(this.timer);
	}
}
function isDraft(value: unknown, fields: object) {
	if (typeof value !== "object" || value === null) return false;
	const draft = value as Record<string, unknown>;
	if (
		!Number.isInteger(draft.revision) ||
		!Number.isInteger(draft.generation) ||
		typeof draft.fields !== "object" ||
		draft.fields === null
	)
		return false;
	const restored = draft.fields as Record<string, unknown>;
	return Object.keys(fields).every(
		(key) => typeof restored[key] === "string" && restored[key].length <= 20000,
	);
}
