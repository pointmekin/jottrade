import { X } from "lucide-react";
import { TagColor, type TradeTag } from "@/lib/trade-tag";
import { cn } from "@/lib/utils";

const TAG_DOT_CLASS: Record<TagColor, string> = {
	[TagColor.Gray]: "bg-zinc-400",
	[TagColor.Blue]: "bg-sky-500",
	[TagColor.Violet]: "bg-violet-500",
	[TagColor.Teal]: "bg-teal-500",
	[TagColor.Amber]: "bg-amber-500",
	[TagColor.Pink]: "bg-pink-500",
};

export function TagDot({ color }: { color: TagColor }) {
	return (
		<span
			aria-hidden
			className={cn("size-1.5 shrink-0 rounded-full", TAG_DOT_CLASS[color])}
		/>
	);
}

interface TagChipProps {
	tag: TradeTag;
	onRemove?: () => void;
	className?: string;
}

export function TagChip({ tag, onRemove, className }: TagChipProps) {
	return (
		<span
			className={cn(
				"inline-flex h-5 max-w-40 items-center gap-1.5 rounded-md border border-border bg-background px-1.5 text-xs text-foreground",
				"motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150",
				className,
			)}
		>
			<TagDot color={tag.color} />
			<span className="truncate">{tag.name}</span>
			{onRemove && (
				<button
					type="button"
					className="-mr-0.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`Remove tag ${tag.name}`}
					onClick={onRemove}
				>
					<X className="size-3" />
				</button>
			)}
		</span>
	);
}

const VISIBLE_TAGS = 2;

/** A compact list for table rows: the first tags, then a count of the rest. */
export function TagList({ tags }: { tags?: TradeTag[] }) {
	if (!tags?.length) return null;
	const hidden = tags.slice(VISIBLE_TAGS);
	return (
		<span className="flex items-center gap-1">
			{tags.slice(0, VISIBLE_TAGS).map((tag) => (
				<TagChip key={tag.id} tag={tag} />
			))}
			{hidden.length > 0 && (
				<span
					className="text-xs text-muted-foreground"
					title={hidden.map((tag) => tag.name).join(", ")}
				>
					+{hidden.length}
				</span>
			)}
		</span>
	);
}
