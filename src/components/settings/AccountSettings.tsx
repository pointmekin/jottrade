import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SectionHeading } from "@/components/app-page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { portfolioQueryKey, useCurrency } from "@/hooks/use-currency";
import { currencySymbol, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { updatePortfolio } from "@/server/portfolioActions";

export function AccountSettings() {
	const queryClient = useQueryClient();
	const currency = useCurrency();
	const currencyMutation = useMutation({
		mutationFn: (next: string) =>
			updatePortfolio({ data: { currency: next } } as never),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: portfolioQueryKey });
		},
	});

	return (
		<div className="surface space-y-4 p-5">
			<SectionHeading title="Account currency" detail="Applies everywhere" />
			<div className="flex items-center justify-between gap-5 py-2">
				<div>
					<p className="text-sm font-medium text-foreground">
						Reporting currency
					</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Every balance, P&amp;L, deposit, and adjustment uses this label.
						Amounts are not converted.
					</p>
				</div>
				<Select
					value={currency}
					onValueChange={(next) => currencyMutation.mutate(next)}
					disabled={currencyMutation.isPending}
				>
					<SelectTrigger className="h-9 w-40" aria-label="Reporting currency">
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
			</div>
		</div>
	);
}
