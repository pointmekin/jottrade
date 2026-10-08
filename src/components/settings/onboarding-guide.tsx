import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/use-onboarding";
import { QueryKey } from "@/lib/query-keys";
import { setOnboardingDismissed } from "@/server/onboardingActions";

export function OnboardingGuide() {
	const queryClient = useQueryClient();
	const { progress, isDismissed } = useOnboarding();
	const restore = useMutation({
		mutationFn: () => setOnboardingDismissed({ data: { isDismissed: false } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: [QueryKey.Onboarding] }),
	});

	if (!progress || !isDismissed || progress.isComplete) return null;

	return (
		<div className="surface mt-6 space-y-4 p-5">
			<SectionHeading
				title="Setup guide"
				detail={`${progress.doneCount} of ${progress.totalCount} steps done`}
			/>
			<div className="flex items-center justify-between gap-5">
				<p className="text-sm text-muted-foreground">
					You hid the checklist on the dashboard. Show it again to finish setup.
				</p>
				<Button
					variant="outline"
					onClick={() => restore.mutate()}
					disabled={restore.isPending}
				>
					Show setup guide
				</Button>
			</div>
		</div>
	);
}
