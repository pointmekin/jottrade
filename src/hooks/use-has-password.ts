import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { QueryKey } from "@/lib/query-keys";

// Better Auth stores an email/password login as the "credential" account.
const CREDENTIAL_PROVIDER = "credential";

export function useHasPassword() {
	return useQuery({
		queryKey: [QueryKey.AuthAccounts],
		queryFn: async () => {
			const { data, error } = await authClient.listAccounts();
			if (error)
				throw new Error(error.message ?? "The request failed. Try again.");
			return data;
		},
		select: (accounts) =>
			accounts.some((account) => account.providerId === CREDENTIAL_PROVIDER),
	});
}
