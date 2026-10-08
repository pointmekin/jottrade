import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import { QueryKey } from "@/lib/query-keys";
import {
	getReviewPreferences,
	updateReviewPreferences,
} from "@/server/reviewPreferenceActions";

export function useReviewPreferences() {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const portfolioId = activeAccount?.id;
	const userId = session?.user.id;
	return useQuery({
		queryKey: [QueryKey.ReviewPreferences, userId, portfolioId],
		queryFn: () =>
			getReviewPreferences({ data: { portfolioId: portfolioId as number } }),
		enabled: !!userId && portfolioId !== undefined,
	});
}
export function ReviewPreferences() {
	const { activeAccount } = useAccounts();
	const preferences = useReviewPreferences();
	if (!activeAccount) return null;
	if (preferences.isError)
		return (
			<p role="alert">
				Review preferences could not be loaded.{" "}
				<Button onClick={() => preferences.refetch()}>Retry</Button>
			</p>
		);
	if (!preferences.data) return <p>Loading review preferences...</p>;
	return (
		<PreferenceForm
			key={`${activeAccount.id}:${preferences.data.timezone}:${preferences.data.weekStartsOn}`}
			portfolioId={activeAccount.id}
			timezone={preferences.data.timezone}
			weekStartsOn={preferences.data.weekStartsOn}
		/>
	);
}
function PreferenceForm({
	portfolioId,
	timezone,
	weekStartsOn,
}: {
	portfolioId: number;
	timezone: string | null;
	weekStartsOn: number;
}) {
	const zoneId = useId();
	const weekId = useId();
	const [zone, setZone] = useState(
		timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
	);
	const [week, setWeek] = useState<0 | 1>(weekStartsOn === 0 ? 0 : 1);
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: () =>
			updateReviewPreferences({
				data: { portfolioId, timezone: zone, weekStartsOn: week },
			}),
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: [QueryKey.ReviewPreferences],
				}),
				queryClient.invalidateQueries({ queryKey: [QueryKey.Onboarding] }),
			]),
	});
	return (
		<section className="surface space-y-3 p-5">
			<h2 className="font-semibold">Account review preferences</h2>
			<p className="text-sm text-muted-foreground">
				Saved reviews keep their original timezone and dates. Calendar and
				analytics keep their existing timezone behavior.
			</p>
			<label className="block text-sm" htmlFor={zoneId}>
				IANA timezone
			</label>
			<Input
				id={zoneId}
				value={zone}
				onChange={(event) => setZone(event.target.value)}
				placeholder="Asia/Bangkok"
			/>
			<label className="block text-sm" htmlFor={weekId}>
				Week starts on
			</label>
			<select
				id={weekId}
				className="rounded border bg-background p-2"
				value={week}
				onChange={(event) => setWeek(event.target.value === "0" ? 0 : 1)}
			>
				<option value={1}>Monday</option>
				<option value={0}>Sunday</option>
			</select>
			<div>
				<Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
					{mutation.isPending ? "Saving..." : "Save review preferences"}
				</Button>
			</div>
			{mutation.isError && (
				<p role="alert" className="text-destructive">
					{mutation.error.message}
				</p>
			)}
		</section>
	);
}
