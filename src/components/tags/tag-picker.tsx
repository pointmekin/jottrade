import { Check, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCreateTag, useTags } from "@/hooks/use-tags";
import {
	normalizeTagName,
	sameTagName,
	TAG_NAME_MAX_LENGTH,
	type TradeTag,
} from "@/lib/trade-tag";
import { cn } from "@/lib/utils";
import { TagDot } from "./tag-chip";

interface TagPickerProps {
	trigger: ReactNode;
	selectedIds: readonly number[];
	onSelect: (tag: TradeTag) => void;
	canCreate?: boolean;
	placeholder?: string;
	align?: "start" | "end";
}

export function TagPicker({
	trigger,
	selectedIds,
	onSelect,
	canCreate = true,
	placeholder = "Find or create a tag",
	align = "start",
}: TagPickerProps) {
	const [query, setQuery] = useState("");
	const { data: tags = [], isLoading, isError } = useTags();
	const create = useCreateTag();
	const name = normalizeTagName(query);
	const hasMatch = tags.some((tag) => sameTagName(tag.name, name));
	const showCreate = canCreate && name.length > 0 && !hasMatch;
	const selected = new Set(selectedIds);
	let emptyText = "No tags yet.";
	if (isError) emptyText = "Tags did not load. Close this list and try again.";
	else if (isLoading) emptyText = "Loading tags…";
	else if (tags.length) emptyText = "No matching tag.";

	const createAndSelect = () =>
		create.mutate(name, {
			onSuccess: (tag) => {
				setQuery("");
				onSelect(tag);
			},
		});

	return (
		<Popover onOpenChange={() => create.reset()}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align={align} className="w-64 p-0">
				<Command>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder={placeholder}
						maxLength={TAG_NAME_MAX_LENGTH}
					/>
					<CommandList>
						{!showCreate && <CommandEmpty>{emptyText}</CommandEmpty>}
						{tags.length > 0 && (
							<CommandGroup>
								{tags.map((tag) => (
									<CommandItem
										key={tag.id}
										value={`${tag.name} ${tag.id}`}
										onSelect={() => onSelect(tag)}
									>
										<TagDot color={tag.color} />
										<span className="flex-1 truncate">{tag.name}</span>
										<Check
											className={cn(
												"size-3.5",
												selected.has(tag.id) ? "opacity-100" : "opacity-0",
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{showCreate && (
							<CommandGroup forceMount>
								<CommandItem
									forceMount
									value={`create ${name}`}
									disabled={create.isPending}
									onSelect={createAndSelect}
								>
									<Plus className="size-3.5" />
									<span className="truncate">
										Create <span className="font-medium">{name}</span>
									</span>
								</CommandItem>
							</CommandGroup>
						)}
					</CommandList>
					{create.error && (
						<p
							role="alert"
							className="border-t px-3 py-2 text-xs text-destructive"
						>
							{create.error.message}
						</p>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}
