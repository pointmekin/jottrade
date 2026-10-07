import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/use-accounts";
import {
	currencySymbol,
	DEFAULT_CURRENCY,
	SUPPORTED_CURRENCIES,
} from "@/lib/currency";
import { type FirstAccountInput, firstAccountSchema } from "@/lib/onboarding";
import { QueryKey } from "@/lib/query-keys";
import { setupFirstAccount } from "@/server/onboardingActions";

const TIMEZONE_LIST_ID = "first-account-timezones";

function browserTimeZone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

interface FirstAccountDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function FirstAccountDialog({
	open,
	onOpenChange,
}: FirstAccountDialogProps) {
	const queryClient = useQueryClient();
	const { activeAccount, setActiveAccount } = useAccounts();
	const form = useForm<FirstAccountInput>({
		resolver: zodResolver(firstAccountSchema),
		values: {
			name: activeAccount?.name ?? "",
			broker: activeAccount?.description ?? "",
			currency: (SUPPORTED_CURRENCIES as readonly string[]).includes(
				activeAccount?.currency ?? "",
			)
				? (activeAccount?.currency as FirstAccountInput["currency"])
				: DEFAULT_CURRENCY,
			timezone: browserTimeZone(),
		},
	});

	const saveMutation = useMutation({
		mutationFn: (values: FirstAccountInput) =>
			setupFirstAccount({ data: values }),
		onSuccess: async ({ accountId }) => {
			await queryClient.invalidateQueries({ queryKey: [QueryKey.Accounts] });
			await queryClient.invalidateQueries({ queryKey: [QueryKey.Onboarding] });
			await queryClient.invalidateQueries({
				queryKey: [QueryKey.ReviewPreferences],
			});
			setActiveAccount(accountId);
			toast.success("Account ready");
			onOpenChange(false);
		},
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (saveMutation.isPending) return;
				onOpenChange(next);
			}}
		>
			<DialogContent className="bg-card sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Set up your trading account</DialogTitle>
					<DialogDescription>
						Your trades, deposits and reviews live in this account. You can
						change these details later in Settings.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit((values) =>
							saveMutation.mutate(values),
						)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<Label className="field-label">Account name</Label>
									<FormControl>
										<Input placeholder="Exness Standard" {...field} />
									</FormControl>
									<FormMessage className="text-xs text-destructive" />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="broker"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<Label className="field-label">Broker (optional)</Label>
									<FormControl>
										<Input placeholder="Exness" {...field} />
									</FormControl>
									<FormMessage className="text-xs text-destructive" />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="currency"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<Label className="field-label">Account currency</Label>
									<FormControl>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger
												className="h-9 w-full"
												aria-label="Account currency"
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{SUPPORTED_CURRENCIES.map((code) => (
													<SelectItem key={code} value={code}>
														{currencySymbol(code)} {code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage className="text-xs text-destructive" />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="timezone"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<Label className="field-label">Timezone</Label>
									<FormControl>
										<Input
											list={TIMEZONE_LIST_ID}
											placeholder="Asia/Bangkok"
											{...field}
										/>
									</FormControl>
									<datalist id={TIMEZONE_LIST_ID}>
										{Intl.supportedValuesOf("timeZone").map((zone) => (
											<option key={zone} value={zone} />
										))}
									</datalist>
									<p className="text-xs text-muted-foreground">
										Daily reviews use this timezone to decide where a day ends.
									</p>
									<FormMessage className="text-xs text-destructive" />
								</FormItem>
							)}
						/>
						{saveMutation.isError && (
							<p role="alert" className="text-sm text-destructive">
								{saveMutation.error.message}
							</p>
						)}
						<DialogFooter className="gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={saveMutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={saveMutation.isPending}>
								{saveMutation.isPending ? "Saving…" : "Save account"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
