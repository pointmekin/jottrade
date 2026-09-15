import { create } from "zustand";
import { persist } from "zustand/middleware";

type AccountStoreState = {
	activeByUser: Record<string, number>;
	setActiveAccount: (userId: string, accountId: number) => void;
	clearActiveAccount: (userId: string) => void;
};

export const useAccountStore = create<AccountStoreState>()(
	persist(
		(set) => ({
			activeByUser: {},
			setActiveAccount: (userId, accountId) =>
				set((state) => ({
					activeByUser: { ...state.activeByUser, [userId]: accountId },
				})),
			clearActiveAccount: (userId) =>
				set((state) => {
					const activeByUser = { ...state.activeByUser };
					delete activeByUser[userId];
					return { activeByUser };
				}),
		}),
		{ name: "jottrade.active-accounts", version: 1 },
	),
);
