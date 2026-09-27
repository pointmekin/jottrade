import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JournalPaginationProps {
	page: number;
	totalPages: number;
	total: number;
	onPageChange: (page: number) => void;
}

export function JournalPagination({
	page,
	totalPages,
	total,
	onPageChange,
}: JournalPaginationProps) {
	if (totalPages <= 1) return null;

	return (
		<div className="flex items-center justify-between pt-2">
			<p className="text-sm text-muted-foreground">
				{total} trades · Page {page} of {totalPages}
			</p>
			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="border-border"
					aria-label="Previous page"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="border-border"
					aria-label="Next page"
					disabled={page >= totalPages}
					onClick={() => onPageChange(page + 1)}
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
