import { Info } from "lucide-react";
import type { ReactNode } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MetricLabelProps {
	label: string;
	children: ReactNode;
	className?: string;
}

/** A metric label with its definition one tap away; a popover also works on touch. */
export function MetricLabel({ label, children, className }: MetricLabelProps) {
	return (
		<p className={cn("field-label flex items-center gap-1", className)}>
			{label}
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label={`How ${label} is calculated`}
						className="-m-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 data-[state=open]:text-foreground"
					>
						<Info className="size-3.5" />
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-72 p-3 text-sm">
					<p className="font-medium text-foreground">{label}</p>
					<div className="mt-1 space-y-2 leading-relaxed text-muted-foreground">
						{children}
					</div>
				</PopoverContent>
			</Popover>
		</p>
	);
}
