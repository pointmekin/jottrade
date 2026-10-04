import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAccounts } from "@/hooks/use-accounts";

export function useReviewRouteAccount(account: number | undefined) {
	const navigate = useNavigate({ from: "/reviews" });
	const { activeAccount, accounts, setActiveAccount } = useAccounts();
	const previous = useRef<{
		account?: number;
		active?: number;
		pending?: number;
	}>({});
	const requestedId = accounts.find((item) => item.id === account)?.id;
	useEffect(() => {
		const old = previous.current;
		if (account !== old.account || old.active === undefined) {
			old.account = account;
			old.pending = requestedId;
		}
		if (old.pending !== undefined && old.pending !== activeAccount?.id) {
			setActiveAccount(old.pending);
			return;
		}
		old.pending = undefined;
		if (!activeAccount) return;
		const changed = old.active !== activeAccount.id;
		const invalid = account !== undefined && requestedId === undefined;
		old.active = activeAccount.id;
		if ((changed || invalid) && account !== activeAccount.id)
			void navigate({
				search: (previous) => ({ ...previous, account: activeAccount.id }),
			});
	}, [account, activeAccount, requestedId, setActiveAccount, navigate]);
	return !account || account === activeAccount?.id;
}
