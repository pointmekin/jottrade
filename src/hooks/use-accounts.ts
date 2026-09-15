import { useQuery } from "@tanstack/react-query";
import { useAccountStore } from "@/lib/account-store";
import { authClient } from "@/lib/auth-client";
import { type AccountRecord, getAccounts } from "@/server/portfolioActions";

export const accountsQueryKey = ["accounts"] as const;

export function useAccounts() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	const query = useQuery({
		queryKey: [...accountsQueryKey, userId],
		queryFn: () => getAccounts(),
		enabled: !!userId,
		staleTime: 10 * 60 * 1000,
	});

	const activeId = useAccountStore((state) =>
		userId ? state.activeByUser[userId] : undefined,
	);

	const accounts: AccountRecord[] = query.data ?? [];
	const activeAccount =
		accounts.find((account) => account.id === activeId) ??
		accounts.find((account) => account.isDefault) ??
		accounts[0];

	const setActiveAccount = (accountId: number) => {
		if (userId) useAccountStore.getState().setActiveAccount(userId, accountId);
	};

	const clearActiveAccount = () => {
		if (userId) useAccountStore.getState().clearActiveAccount(userId);
	};

	return {
		accounts,
		activeAccount,
		setActiveAccount,
		clearActiveAccount,
		isLoading: query.isPending,
		isError: query.isError,
	};
}
