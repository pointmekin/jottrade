import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { clearUserDrafts, userDraftKeys } from "@/lib/review-draft";

const SIGN_OUT_FAILED = "Couldn't sign out. Your drafts are kept. Try again.";

export function useSignOut() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const [draftCount, setDraftCount] = useState(0);
	const userId = session?.user.id;

	const signOut = async () => {
		setDraftCount(0);
		const result = await authClient.signOut().catch(() => null);
		if (!result || result.error) {
			toast.error(SIGN_OUT_FAILED);
			return;
		}
		if (userId) clearUserDrafts(userId);
		await router.navigate({ to: "/sign-in" });
		queryClient.clear();
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
