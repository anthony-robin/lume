import { NDKEvent } from '@nostr-dev-kit/ndk';
import { memo } from 'react';

import { ChildNote, NoteActions } from '@shared/notes';
import { User } from '@shared/user';

import { useNostr } from '@utils/hooks/useNostr';
import { useRichContent } from '@utils/hooks/useRichContent';

export function TextNote({ event }: { event: NDKEvent }) {
  const { parsedContent } = useRichContent(event.content);
  const { getEventThread } = useNostr();

  const thread = getEventThread(event);

  return (
    <div className="mb-3 h-min w-full px-3">
      <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl bg-neutral-50 pt-3 dark:bg-neutral-950">
        <User pubkey={event.pubkey} time={event.created_at} eventId={event.id} />
        {thread ? (
          <div className="w-full px-3">
            <div className="flex h-min w-full flex-col gap-3 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-900">
              {thread.rootEventId ? <ChildNote id={thread.rootEventId} isRoot /> : null}
              {thread.replyEventId ? <ChildNote id={thread.replyEventId} /> : null}
            </div>
          </div>
        ) : null}
        <div className="min-w-0 px-3">
          <div className="break-p select-text whitespace-pre-line leading-normal text-neutral-900 dark:text-neutral-100">
            {parsedContent}
          </div>
        </div>
        <NoteActions id={event.id} pubkey={event.pubkey} />
      </div>
    </div>
  );
}

export const MemoizedTextNote = memo(TextNote);
