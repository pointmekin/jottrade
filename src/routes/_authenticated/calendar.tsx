import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	retainSearchParams,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { AppPageHeader } from "@/components/app-page-header";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { FilterBar } from "@/components/journal/FilterBar";
import { FirstTradeEmptyState } from "@/components/onboarding/first-trade-empty-state";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { useOnboarding } from "@/hooks/use-onboarding";
import type { CalendarDay } from "@/lib/calendar-days";
import {
	SCOPE_SEARCH_KEYS,
	scopeSearchSchema,
	toTradeQuery,
} from "@/lib/journal-search";
import { resolvePeriod } from "@/lib/period";
import { QueryKey } from "@/lib/query-keys";
import { getCalendarData } from "@/server/calendarActions";

const calendarSearchSchema = scopeSearchSchema.extend({
	year: z.number().default(() => new Date().getFullYear()),
	month: z.number().default(() => new Date().getMonth() + 1),
});

export const Route = createFileRoute("/_authenticated/calendar")({
	validateSearch: calendarSearchSchema,
	search: { middlewares: [retainSearchParams(SCOPE_SEARCH_KEYS)] },
	component: CalendarPage,
});

function CalendarPage() {
	const navigate = useNavigate({ from: "/calendar" });
	const search = useSearch({ from: "/_authenticated/calendar" });
	const { year, month } = search;
	const currency = useCurrency();
	const { activeAccount } = useAccounts();
	const { hasTrades } = useOnboarding();
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const range = useMemo(
		() => ({
			from: new Date(year, month - 1, 1).toISOString(),
			to: new Date(year, month, 1).toISOString(),
		}),
		[year, month],
	);
	const tradeQuery = toTradeQuery(
		search,
		resolvePeriod({
			preset: search.period,
			from: search.dateFrom,
			to: search.dateTo,
		}),
	);

	const { data: calendarData = {} as Record<string, CalendarDay>, isLoading } =
		useQuery({
			queryKey: [
				QueryKey.Calendar,
				activeAccount?.id,
				year,
				month,
				timeZone,
				tradeQuery,
			],
			queryFn: () =>
				getCalendarData({
					data: {
						...tradeQuery,
						year,
						month,
						timeZone,
						portfolioId: activeAccount?.id,
						...range,
					},
				} as never),
			enabled: activeAccount !== undefined,
		});

	const goTo = (y: number, m: number) => {
		let nm = m;
		let ny = y;
		if (nm < 1) {
			nm = 12;
			ny -= 1;
		}
		if (nm > 12) {
			nm = 1;
			ny += 1;
		}
		navigate({ search: { year: ny, month: nm } });
	};

	const firstOfMonth = new Date(year, month - 1, 1);
	const monthName = format(firstOfMonth, "MMMM yyyy");
	const monthControlName = format(firstOfMonth, "MMM yyyy");

	return (
		<div className="app-page">
			<main className="page-frame section-enter space-y-6">
				<AppPageHeader
					title="Calendar"
					description="Read performance in the rhythm it happened, one trading day at a time."
					meta={`${monthName} · ${currency}`}
					actions={
						<div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
							<Button
								variant="outline"
								size="icon"
								className="border-border h-8 w-8"
								aria-label="Previous month"
								onClick={() => goTo(year, month - 1)}
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<span className="min-w-0 flex-1 text-center text-sm font-medium text-foreground sm:min-w-36">
								<span className="sm:hidden">{monthControlName}</span>
								<span className="hidden sm:inline">{monthName}</span>
							</span>
							<Button
								variant="outline"
								size="icon"
								className="border-border h-8 w-8"
								aria-label="Next month"
								onClick={() => goTo(year, month + 1)}
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="border-border text-foreground"
								onClick={() =>
									goTo(new Date().getFullYear(), new Date().getMonth() + 1)
								}
							>
								Today
							</Button>
						</div>
					}
				/>

				<FilterBar
					filters={search}
					onFiltersChange={(filters) =>
						navigate({ search: { ...search, ...filters } })
					}
				/>
				{hasTrades === false && (
					<FirstTradeEmptyState
						icon={CalendarDays}
						title="Your calendar fills in as you trade"
						description="Each day you trade shows its result here. Log a trade to see your first day."
					/>
				)}
				{hasTrades !== false && isLoading && <CalendarSkeleton />}
				{hasTrades !== false && !isLoading && (
					<CalendarGrid year={year} month={month} data={calendarData} />
				)}
			</main>
		</div>
	);
}
