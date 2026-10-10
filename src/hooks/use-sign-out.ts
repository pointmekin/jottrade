import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearUserDrafts, userDraftKeys } from "@/lib/review-draft";

export function useSignOut() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const [draftCount, setDraftCount] = useState(0);
	const userId = session?.user.id;

	const signOut = async () => {
		setDraftCount(0);
		if (userId) clearUserDrafts(userId);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					await router.navigate({ to: "/sign-in" });
					queryClient.clear();
				},
			},
		});
	};
	const requestSignOut = () => {
		const count = userId ? userDraftKeys(userId).length : 0;
		if (count > 0) setDraftCount(count);
		else void signOut();
	};

	return {
		draftCount,
		requestSignOut,
		signOut,
		cancel: () => setDraftCount(0),
	};
}
