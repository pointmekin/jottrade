import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { deriveOnboarding } from "@/lib/onboarding";
import { QueryKey } from "@/lib/query-keys";
import { getOnboarding } from "@/server/onboardingActions";

export function useOnboarding() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	const query = useQuery({
		queryKey: [QueryKey.Onboarding, userId],
		queryFn: () => getOnboarding(),
		enabled: !!userId,
	});

	const progress = query.data ? deriveOnboarding(query.data.facts) : undefined;
	const isDismissed = query.data?.isDismissed ?? false;

	return {
		hasTrades: query.data?.facts.hasTrades,
		progress,
		isDismissed,
		isChecklistVisible: !!progress && !isDismissed && !progress.isComplete,
		isLoading: query.isPending,
	};
}
