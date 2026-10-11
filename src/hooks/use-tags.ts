import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import {
	normalizeTagName,
	sameTagName,
	TagColor,
	type TradeTag,
} from "@/lib/trade-tag";
import { createTag, deleteTag, getTags, updateTag } from "@/server/tagActions";

const TAGS_KEY = [QueryKey.Tags];
let lastPendingId = 0;

export const isPendingTag = (tag: TradeTag) => tag.id < 0;

const sortTags = (tags: TradeTag[]) =>
	[...tags].sort((a, b) =>
		a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
	);

function putTag(tags: TradeTag[], tag: TradeTag, replacedId = tag.id) {
	const rest = tags.filter((t) => t.id !== tag.id && t.id !== replacedId);
	return sortTags([...rest, tag]);
}

function setTags(
	queryClient: QueryClient,
	change: (tags: TradeTag[]) => TradeTag[],
) {
	queryClient.setQueryData<TradeTag[]>(
		TAGS_KEY,
		(tags) => tags && change(tags),
	);
}

/** Refetch only after the last tag mutation, so a refetch does not hide another pending change. */
function settleTags(queryClient: QueryClient) {
	if (queryClient.isMutating({ mutationKey: TAGS_KEY }) === 1)
		void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
}

export function useTags() {
	return useQuery({ queryKey: TAGS_KEY, queryFn: () => getTags() });
}

export function useCreateTag() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: TAGS_KEY,
		mutationFn: (name: string) => createTag({ data: { name } }),
		onMutate: async (name) => {
			await queryClient.cancelQueries({ queryKey: TAGS_KEY });
			const tags = queryClient.getQueryData<TradeTag[]>(TAGS_KEY) ?? [];
			if (tags.some((tag) => sameTagName(tag.name, name))) return {};
			lastPendingId -= 1;
			const pending = {
				id: lastPendingId,
				name: normalizeTagName(name),
				color: TagColor.Gray,
			};
			setTags(queryClient, (current) => putTag(current, pending));
			return { pendingId: pending.id };
		},
		onSuccess: (tag, _name, context) =>
			setTags(queryClient, (tags) => putTag(tags, tag, context.pendingId)),
		onError: (error, name, context) => {
			setTags(queryClient, (tags) =>
				tags.filter((tag) => tag.id !== context?.pendingId),
			);
			toast.error(`The tag “${normalizeTagName(name)}” was not created.`, {
				description: error.message,
			});
		},
		onSettled: () => settleTags(queryClient),
	});
}

function useTagChange<Variables>(
	tag: TradeTag,
	failure: string,
	run: (variables: Variables) => Promise<unknown>,
	change: (tags: TradeTag[], variables: Variables) => TradeTag[],
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: TAGS_KEY,
		mutationFn: run,
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: TAGS_KEY });
			const tags = queryClient.getQueryData<TradeTag[]>(TAGS_KEY) ?? [];
			const previous = tags.find((t) => t.id === tag.id) ?? tag;
			setTags(queryClient, (current) => change(current, variables));
			return { previous };
		},
		onSuccess: () => invalidateTradeQueries(queryClient),
		onError: (error, _variables, context) => {
			if (context)
				setTags(queryClient, (tags) => putTag(tags, context.previous));
			toast.error(failure, { description: error.message });
		},
		onSettled: () => settleTags(queryClient),
	});
}

export function useUpdateTag(tag: TradeTag) {
	return useTagChange(
		tag,
		"The tag was not saved.",
		(changes: { name?: string; color?: TagColor }) =>
			updateTag({ data: { id: tag.id, ...changes } }),
		(tags, changes) =>
			sortTags(tags.map((t) => (t.id === tag.id ? { ...t, ...changes } : t))),
	);
}

export function useDeleteTag(tag: TradeTag) {
	return useTagChange(
		tag,
		"The tag was not deleted.",
		() => deleteTag({ data: { id: tag.id } }),
		(tags) => tags.filter((t) => t.id !== tag.id),
	);
}
