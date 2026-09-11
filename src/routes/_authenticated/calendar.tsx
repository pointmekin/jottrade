import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { AppPageHeader } from "@/components/app-page-header";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { Button } from "@/components/ui/button";
import { getCalendarData } from "@/server/calendarActions";

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

	const { data: calendarData = {}, isLoading } = useQuery({
		queryKey: ["calendar", year, month],
		queryFn: () => getCalendarData({ data: { year, month } }),
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

	return (
		<div className="app-page">
			<main className="page-frame section-enter space-y-6">
				<AppPageHeader
					title="Calendar"
					description="Read performance in the rhythm it happened, one trading day at a time."
					meta={monthName}
					actions={
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="icon"
								className="border-border h-8 w-8"
								onClick={() => goTo(year, month - 1)}
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<span className="text-foreground font-medium min-w-36 text-center">
								{monthName}
							</span>
							<Button
								variant="outline"
								size="icon"
								className="border-border h-8 w-8"
								onClick={() => goTo(year, month + 1)}
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="border-border text-foreground ml-2"
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
					<div className="empty-field h-96 text-muted-foreground">
						Reading calendar section…
					</div>
				) : (
					<CalendarGrid year={year} month={month} data={calendarData as any} />
				)}
			</main>
		</div>
	);
}
