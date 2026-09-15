import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { AppPageHeader } from "@/components/app-page-header";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { type CalendarDay, getCalendarData } from "@/server/calendarActions";

const calendarSearchSchema = z.object({
	year: z.number().default(() => new Date().getFullYear()),
	month: z.number().default(() => new Date().getMonth() + 1),
});

export const Route = createFileRoute("/_authenticated/calendar")({
	validateSearch: calendarSearchSchema,
	component: CalendarPage,
});

function CalendarPage() {
	const navigate = useNavigate({ from: "/calendar" });
	const { year, month } = useSearch({ from: "/_authenticated/calendar" });
	const currency = useCurrency();
	const { activeAccount } = useAccounts();
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const range = useMemo(
		() => ({
			from: new Date(year, month - 1, 1).toISOString(),
			to: new Date(year, month, 1).toISOString(),
		}),
		[year, month],
	);

	const { data: calendarData = {} as Record<string, CalendarDay>, isLoading } =
		useQuery({
			queryKey: ["calendar", activeAccount?.id, year, month, timeZone],
			queryFn: () =>
				getCalendarData({
					data: {
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

	const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});
	const monthControlName = new Date(year, month - 1, 1).toLocaleDateString(
		"en-US",
		{
			month: "short",
			year: "numeric",
		},
	);

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

				{isLoading ? (
					<CalendarSkeleton />
				) : (
					<CalendarGrid year={year} month={month} data={calendarData} />
				)}
			</main>
		</div>
	);
}
