import { Skeleton } from "@/components/ui/skeleton";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CELLS = Array.from({ length: 42 }, (_, index) => `cell-${index}`);

export function CalendarSkeleton() {
	return (
		<div className="surface min-w-0 overflow-hidden" aria-busy="true">
			<div className="grid min-w-0 grid-cols-7 border-b border-border bg-background">
				{DOW.map((day) => (
					<div key={day} className="min-w-0 px-1 py-2">
						<Skeleton className="mx-auto h-3 w-8 rounded-sm" />
					</div>
				))}
			</div>
			<div className="grid min-w-0 grid-cols-7">
				{CELLS.map((cell) => (
					<div
						key={cell}
						className="min-h-11 min-w-0 border-b border-r border-border p-1 sm:min-h-[88px] sm:p-2"
					>
						<Skeleton className="h-3 w-3 rounded-sm sm:h-3.5 sm:w-4" />
						<Skeleton className="mt-2 h-3 w-4/5 rounded-sm sm:mt-4 sm:h-3.5" />
					</div>
				))}
			</div>
		</div>
	);
}
