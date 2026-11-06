import { Skeleton } from "@/components/ui/skeleton";
import { REVIEW_FIELDS } from "@/lib/review";

const RESULT_ROWS = ["trade", "adjustments", "flows", "closed", "win"];
const QUEUE_ROWS = ["one", "two", "three", "four"];

export function QueueRowsSkeleton() {
	return (
		<ul className="divide-y divide-border" aria-hidden="true">
			{QUEUE_ROWS.map((key) => (
				<li key={key} className="flex items-center justify-between py-3">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-20" />
				</li>
			))}
		</ul>
	);
}

/** Mirrors the loaded review layout, so nothing moves when data arrives. */
export function ReviewsSkeleton() {
	return (
		<output aria-busy="true" aria-label="Loading review" className="block">
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
				<div className="space-y-4 lg:order-last">
					<div className="surface space-y-4 p-4">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-7 w-28" />
						<div className="space-y-3 border-t border-border pt-3">
							{RESULT_ROWS.map((key) => (
								<div key={key} className="flex justify-between">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-4 w-14" />
								</div>
							))}
						</div>
					</div>
					<div className="surface space-y-3 p-4">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-4 w-full" />
					</div>
				</div>
				<div className="space-y-5">
					<div>
						<Skeleton className="h-5 w-32" />
						<Skeleton className="mt-2 h-4 w-80 max-w-full" />
					</div>
					{REVIEW_FIELDS.map((key) => (
						<div key={key} className="space-y-2">
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-16 w-full" />
						</div>
					))}
				</div>
			</div>
			<div className="page-section space-y-3">
				<Skeleton className="h-5 w-44" />
				<QueueRowsSkeleton />
			</div>
		</output>
	);
}
