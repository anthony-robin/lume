import { NDKEvent } from "@nostr-dev-kit/ndk";
import { Note } from "..";
import { useArk } from "../../../provider";

export function TextNote({
	event,
	className,
}: { event: NDKEvent; className?: string }) {
	const ark = useArk();
	const thread = ark.getEventThread({ tags: event.tags });

	return (
		<Note.Provider event={event}>
			<Note.Root className={className}>
				<div className="flex items-center justify-between px-3 h-14">
					<Note.User className="flex-1 pr-1" />
					<Note.Menu />
				</div>
				<Note.Thread thread={thread} className="mb-2" />
				<Note.Content className="min-w-0 px-3" />
				<div className="flex items-center justify-between px-3 h-14">
					<Note.Pin />
					<div className="inline-flex items-center gap-10">
						<Note.Reply />
						<Note.Repost />
						<Note.Zap />
					</div>
				</div>
			</Note.Root>
		</Note.Provider>
	);
}