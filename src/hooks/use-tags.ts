import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryKey } from "@/lib/query-keys";
import { createTag, getTags } from "@/server/tagActions";

export function useTags() {
	return useQuery({ queryKey: [QueryKey.Tags], queryFn: () => getTags() });
}

export function useCreateTag() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (name: string) => createTag({ data: { name } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: [QueryKey.Tags] }),
	});
}
