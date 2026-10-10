import { useEffect, useState, useSyncExternalStore } from "react";
import { DEVICE_STORAGE_ERROR, type DraftStorage } from "@/lib/review-autosave";
import {
	readTradeDraft,
	TRADE_DRAFT_SAVE_DELAY_MS,
	TradeDraftStatus,
	type TradeDraftValues,
	tradeDraftKey,
	writeTradeDraft,
} from "@/lib/trade-draft";

const TRADE_DRAFT_EVENT = "jottrade:trade-draft";

type TradeDraftState = {
	draftId: string;
	savedAt: string | null;
	isUnreadable: boolean;
	storageError: string | null;
};

class TradeDraftController {
	readonly restored: TradeDraftValues | undefined;
	private state: TradeDraftState;
	private pending: TradeDraftValues | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private listeners = new Set<() => void>();
	constructor(
		private key: string | undefined,
		private storage: DraftStorage | undefined,
	) {
		this.state = {
			draftId: crypto.randomUUID(),
			savedAt: null,
			isUnreadable: false,
			storageError: null,
		};
		if (!key || !storage) return;
		try {
			const stored = readTradeDraft(storage, key);
			if (stored.status === TradeDraftStatus.Ready) {
				this.restored = stored.draft.values;
				this.state.draftId = stored.draft.draftId;
				this.state.savedAt = stored.draft.savedAt;
			}
			this.state.isUnreadable = stored.status === TradeDraftStatus.Unreadable;
		} catch {
			this.state.storageError = DEVICE_STORAGE_ERROR;
		}
	}
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	getSnapshot = () => this.state;
	private publish(patch: Partial<TradeDraftState>) {
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener();
		window.dispatchEvent(new Event(TRADE_DRAFT_EVENT));
	}
	schedule(values: TradeDraftValues) {
		if (this.state.isUnreadable) return;
		this.pending = values;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.flush(), TRADE_DRAFT_SAVE_DELAY_MS);
	}
	flush() {
		clearTimeout(this.timer);
		const values = this.pending;
		if (!values || !this.key || !this.storage) return;
		this.pending = null;
		const savedAt = new Date().toISOString();
		try {
			writeTradeDraft(this.storage, this.key, {
				v: 1,
				draftId: this.state.draftId,
				savedAt,
				values,
			});
			this.publish({ savedAt, storageError: null });
		} catch {
			this.publish({ storageError: DEVICE_STORAGE_ERROR });
		}
	}
	discard() {
		clearTimeout(this.timer);
		this.pending = null;
		let storageError: string | null = null;
		try {
			if (this.key) this.storage?.removeItem(this.key);
		} catch {
			storageError = DEVICE_STORAGE_ERROR;
		}
		this.publish({
			draftId: crypto.randomUUID(),
			savedAt: null,
			isUnreadable: false,
			storageError,
		});
	}
	logged() {
		if (!this.state.isUnreadable) return this.discard();
		clearTimeout(this.timer);
		this.pending = null;
		this.publish({ draftId: crypto.randomUUID() });
	}
}

function browserStorage() {
	return typeof window === "undefined" ? undefined : window.localStorage;
}

function draftKey(userId: string | undefined, portfolioId: number | undefined) {
	return userId && portfolioId ? tradeDraftKey(userId, portfolioId) : undefined;
}

export function useTradeDraft(
	userId: string | undefined,
	portfolioId: number | undefined,
) {
	const [controller] = useState(
		() =>
			new TradeDraftController(draftKey(userId, portfolioId), browserStorage()),
	);
	const state = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot,
	);
	useEffect(() => () => controller.flush(), [controller]);
	return {
		...state,
		restored: controller.restored,
		schedule: (values: TradeDraftValues) => controller.schedule(values),
		flush: () => controller.flush(),
		discard: () => controller.discard(),
		logged: () => controller.logged(),
	};
}

function subscribeToDrafts(listener: () => void) {
	window.addEventListener(TRADE_DRAFT_EVENT, listener);
	window.addEventListener("storage", listener);
	return () => {
		window.removeEventListener(TRADE_DRAFT_EVENT, listener);
		window.removeEventListener("storage", listener);
	};
}

export function useHasTradeDraft(
	userId: string | undefined,
	portfolioId: number | undefined,
) {
	const key = draftKey(userId, portfolioId);
	return useSyncExternalStore(
		subscribeToDrafts,
		() => {
			try {
				return key ? localStorage.getItem(key) !== null : false;
			} catch {
				return false;
			}
		},
		() => false,
	);
}
