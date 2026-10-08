import { useQuery } from "@tanstack/react-query";
import { useAccountStore } from "@/lib/account-store";
import { authClient } from "@/lib/auth-client";
import { QueryKey } from "@/lib/query-keys";
import {
	type AccountRecord,
	ensureDefaultAccount,
	getAccounts,
} from "@/server/portfolioActions";

// Every screen reads the active account's currency. A user who signed up
// before sign-up provisioning, or who deleted the default account, gets one
// through an explicit, idempotent POST; the GET never writes.
async function loadAccounts(): Promise<AccountRecord[]> {
	const accounts = await getAccounts();
	return accounts.some((account) => account.isDefault)
		? accounts
		: ensureDefaultAccount();
}

export function useAccounts() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	const query = useQuery({
		queryKey: [QueryKey.Accounts, userId],
		queryFn: loadAccounts,
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
