import { useQuery } from '@tanstack/react-query';
import { useArk } from '@libs/ark';
import { NoteChildUser } from './childUser';

export function NoteChild({ eventId, isRoot }: { eventId: string; isRoot?: boolean }) {
  const ark = useArk();
  const { isLoading, isError, data } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      // get event from relay
      const event = await ark.getEventById({ id: eventId });

      if (!event)
        throw new Error(
          `Cannot get event with ${eventId}, will be retry after 10 seconds`
        );

      return event;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
  });

  if (isLoading) {
    return (
      <div className="relative flex gap-3">
        <div className="relative flex-1 rounded-md bg-neutral-200 px-2 py-2 dark:bg-neutral-800">
          <div className="h-4 w-full animate-pulse bg-neutral-300 dark:bg-neutral-700" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="relative flex gap-3">
        <div className="relative flex-1 rounded-md bg-neutral-200 px-2 py-2 dark:bg-neutral-800">
          Failed to fetch event
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex gap-3">
      <div className="relative flex-1 rounded-md bg-neutral-200 px-2 py-2 dark:bg-neutral-800">
        <div className="absolute right-0 top-[18px] h-3 w-3 -translate-y-1/2 translate-x-1/2 rotate-45 transform bg-neutral-200 dark:bg-neutral-800"></div>
        <div className="break-p mt-6 line-clamp-3 select-text leading-normal text-neutral-900 dark:text-neutral-100">
          {data.content}
        </div>
      </div>
      <NoteChildUser pubkey={data.pubkey} subtext={isRoot ? 'posted' : 'replied'} />
    </div>
  );
}