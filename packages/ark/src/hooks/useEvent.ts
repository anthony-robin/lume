import { useQuery } from "@tanstack/react-query";
import { useArk } from "./useArk";

export function useEvent(id: string) {
	const ark = useArk();
	const { isLoading, isError, data } = useQuery({
		queryKey: ["event", id],
		queryFn: async () => {
			const event = await ark.getEventById(id);
			if (!event)
				throw new Error(
					`Cannot get event with ${id}, will be retry after 10 seconds`,
				);
			return event;
		},
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		refetchOnReconnect: false,
		staleTime: Infinity,
		retry: 2,
	});

	return { isLoading, isError, data };
}
