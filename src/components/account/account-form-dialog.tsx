import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { accountsQueryKey } from "@/hooks/use-accounts";
import { ACCOUNT_KIND_LABELS, AccountKind } from "@/lib/account";
import {
	currencySymbol,
	DEFAULT_CURRENCY,
	SUPPORTED_CURRENCIES,
} from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
	type AccountRecord,
	createAccount,
	updateAccount,
} from "@/server/portfolioActions";

const accountFormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(64, "Keep the name under 64 characters"),
	description: z
		.string()
		.trim()
		.max(500, "Keep the description under 500 characters"),
	kind: z.enum([AccountKind.Real, AccountKind.Demo]),
	currency: z.string().length(3),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

const kindDotStyles = {
	[AccountKind.Real]: "bg-success",
	[AccountKind.Demo]: "bg-warning",
} as const;

const inputCls =
	"bg-background border-input text-foreground font-data text-sm placeholder:text-muted-foreground";

const labelCls = "field-label";

interface AccountFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Present switches the dialog into edit mode. */
	account?: AccountRecord | null;
}

export function AccountFormDialog({
	open,
	onOpenChange,
	account,
}: AccountFormDialogProps) {
	const queryClient = useQueryClient();
	const form = useForm<AccountFormValues>({
		resolver: zodResolver(accountFormSchema),
		defaultValues: {
			name: "",
			description: "",
			kind: AccountKind.Real,
			currency: DEFAULT_CURRENCY,
		},
	});

	useEffect(() => {
		if (!open) return;
		form.reset({
			name: account?.name ?? "",
			description: account?.description ?? "",
			kind: account?.kind ?? AccountKind.Real,
			currency: account?.currency ?? DEFAULT_CURRENCY,
		});
	}, [open, account, form]);

	const saveMutation = useMutation({
		mutationFn: (values: AccountFormValues) =>
			account
				? updateAccount({ data: { id: account.id, ...values } })
				: createAccount({ data: values }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: accountsQueryKey });
			toast.success(account ? "Account updated" : "Account created");
			onOpenChange(false);
		},
	});

	const errorMessage =
		saveMutation.error instanceof Error
			? saveMutation.error.message
			: "The account could not be saved. Please try again.";

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
					<DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
					<DialogDescription>
						{account
							? "Update the name, description, type, or reporting currency."
							: "Each account keeps its own trades, cash flows, and analytics."}
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
									<Label className={labelCls}>Name</Label>
									<FormControl>
										<Input
											placeholder="Exness Standard"
											className={inputCls}
											{...field}
										/>
									</FormControl>
									<FormMessage className="text-xs text-destructive" />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<Label className={labelCls}>Description</Label>
									<FormControl>
										<Textarea
											placeholder="Optional. Broker, purpose, notes…"
											className={cn(inputCls, "min-h-16 resize-none")}
											{...field}
										/>
									</FormControl>
									<FormMessage className="text-xs text-destructive" />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="kind"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<Label className={labelCls}>Type</Label>
									<FormControl>
										<fieldset
											aria-label="Account type"
											className="grid grid-cols-2 gap-2 border-0 p-0"
										>
											{[AccountKind.Real, AccountKind.Demo].map((value) => (
												<button
													key={value}
													type="button"
													aria-pressed={field.value === value}
													onClick={() => field.onChange(value)}
													className={cn(
														"flex h-9 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors",
														field.value === value
															? "border-ring bg-accent text-accent-foreground"
															: "border-input text-muted-foreground hover:bg-accent/50",
													)}
												>
													<span
														aria-hidden
														className={cn(
															"size-1.5 rounded-full",
															kindDotStyles[value],
														)}
													/>
													{ACCOUNT_KIND_LABELS[value]}
												</button>
											))}
										</fieldset>
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
									<Label className={labelCls}>Reporting currency</Label>
									<FormControl>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger
												className="h-9 w-full"
												aria-label="Reporting currency"
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

						{saveMutation.isError && (
							<p role="alert" className="text-sm text-destructive">
								{errorMessage}
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
								{saveMutation.isPending
									? "Saving…"
									: account
										? "Save changes"
										: "Create account"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
