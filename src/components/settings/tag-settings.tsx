import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/app-page-header";
import { TagDot } from "@/components/tags/tag-chip";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useCreateTag, useTags } from "@/hooks/use-tags";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import {
	normalizeTagName,
	TAG_NAME_MAX_LENGTH,
	TagColor,
	type TradeTag,
} from "@/lib/trade-tag";
import { deleteTag, updateTag } from "@/server/tagActions";

function useTagChange<Variables>(
	run: (variables: Variables) => Promise<unknown>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: [QueryKey.Tags] }),
				invalidateTradeQueries(queryClient),
			]),
		onError: (error) =>
			toast.error("The tag was not saved.", { description: error.message }),
	});
}

function TagRow({ tag }: { tag: TradeTag }) {
	const [name, setName] = useState(tag.name);
	const update = useTagChange((changes: { name?: string; color?: TagColor }) =>
		updateTag({ data: { id: tag.id, ...changes } }),
	);
	const remove = useTagChange(() => deleteTag({ data: { id: tag.id } }));
	const rename = () => {
		const next = normalizeTagName(name);
		if (!next || next === tag.name) {
			setName(tag.name);
			return;
		}
		update.mutate({ name: next }, { onError: () => setName(tag.name) });
	};

	return (
		<li className="flex items-center gap-2 py-1.5">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						aria-label={`Change color of ${tag.name}`}
					>
						<span className="flex size-3 items-center justify-center">
							<TagDot color={tag.color} />
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{Object.values(TagColor).map((color) => (
						<DropdownMenuItem
							key={color}
							onSelect={() => update.mutate({ color })}
							className="capitalize"
						>
							<TagDot color={color} /> {color}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<Input
				value={name}
				maxLength={TAG_NAME_MAX_LENGTH}
				aria-label={`Rename ${tag.name}`}
				className="h-8 bg-background text-sm"
				onChange={(event) => setName(event.target.value)}
				onBlur={rename}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
					if (event.key === "Escape") setName(tag.name);
				}}
			/>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 text-muted-foreground hover:text-destructive"
						aria-label={`Delete ${tag.name}`}
					>
						<Trash2 className="size-3.5" />
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete the tag “{tag.name}”?</AlertDialogTitle>
						<AlertDialogDescription>
							The tag is removed from every trade. The trades stay.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => remove.mutate(undefined)}>
							Delete tag
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</li>
	);
}

export function TagSettings() {
	const { data: tags = [], isLoading } = useTags();
	const create = useCreateTag();
	const [name, setName] = useState("");
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!normalizeTagName(name)) return;
		create.mutate(name, { onSuccess: () => setName("") });
	};

	return (
		<div className="surface mt-6 space-y-4 p-5">
			<SectionHeading title="Trade tags" detail={`${tags.length} tags`} />
			<p className="max-w-prose text-sm text-muted-foreground">
				Rename a tag to update it on every trade. Names ignore letter case, so
				“FOMO” and “fomo” are one tag.
			</p>
			<form onSubmit={submit} className="flex gap-2">
				<Input
					value={name}
					maxLength={TAG_NAME_MAX_LENGTH}
					placeholder="New tag, for example Late entry"
					aria-label="New tag name"
					className="h-9 bg-background text-sm"
					onChange={(event) => setName(event.target.value)}
				/>
				<Button type="submit" variant="outline" disabled={create.isPending}>
					Add tag
				</Button>
			</form>
			{create.error && (
				<p role="alert" className="text-sm text-destructive">
					{create.error.message}
				</p>
			)}
			{!isLoading && tags.length === 0 && (
				<p className="text-sm text-muted-foreground">
					No tags yet. Add one here or from a trade.
				</p>
			)}
			{tags.length > 0 && (
				<ul className="divide-y divide-border">
					{tags.map((tag) => (
						<TagRow key={`${tag.id}-${tag.name}`} tag={tag} />
					))}
				</ul>
			)}
		</div>
	);
}
