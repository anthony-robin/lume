import { LumeIcon } from "@shared/icons";
import { RelayContext } from "@shared/relayProvider";
import { useActiveAccount } from "@stores/accounts";
import { READONLY_RELAYS } from "@stores/constants";
import { dateToUnix, getHourAgo } from "@utils/date";
import {
	addToBlacklist,
	countTotalNotes,
	createChat,
	createNote,
	getLastLogin,
} from "@utils/storage";
import { getParentID } from "@utils/transform";
import { useCallback, useContext, useRef } from "react";
import useSWRSubscription from "swr/subscription";
import { navigate } from "vite-plugin-ssr/client/router";

let lastLogin: string;
let totalNotes: number;

if (typeof window !== "undefined") {
	lastLogin = await getLastLogin();
	totalNotes = await countTotalNotes();
}

export function Page() {
	const pool: any = useContext(RelayContext);
	const account = useActiveAccount((state: any) => state.account);

	const now = useRef(new Date());
	const eose = useRef(0);

	const getQuery = useCallback(() => {
		const query = [];
		const follows = JSON.parse(account.follows);
		const last = parseInt(lastLogin);

		let queryNoteSince: number;

		if (totalNotes === 0) {
			queryNoteSince = dateToUnix(getHourAgo(48, now.current));
		} else {
			if (parseInt(lastLogin) > 0) {
				queryNoteSince = last;
			} else {
				queryNoteSince = dateToUnix(getHourAgo(48, now.current));
			}
		}

		// kind 1 (notes) query
		query.push({
			kinds: [1, 6, 1063],
			authors: follows,
			since: queryNoteSince,
		});

		// kind 4 (chats) query
		query.push({
			kinds: [4],
			"#p": [account.pubkey],
			since: last,
		});

		// kind 4 (chats) query
		query.push({
			kinds: [4],
			authors: [account.pubkey],
			since: last,
		});

		// kind 43, 43 (mute user, hide message) query
		query.push({
			authors: [account.pubkey],
			kinds: [43, 44],
			since: last,
		});

		return query;
	}, [account]);

	useSWRSubscription(account ? "prefetch" : null, () => {
		const query = getQuery();
		const unsubscribe = pool.subscribe(
			query,
			READONLY_RELAYS,
			(event: any) => {
				switch (event.kind) {
					// short text note
					case 1: {
						const parentID = getParentID(event.tags, event.id);
						// insert event to local database
						createNote(
							event.id,
							account.id,
							event.pubkey,
							event.kind,
							event.tags,
							event.content,
							event.created_at,
							parentID,
						);
						break;
					}
					// chat
					case 4: {
						if (event.pubkey === account.pubkey) {
							const receiver = event.tags.find((t) => t[0] === "p")[1];
							createChat(
								event.id,
								receiver,
								event.pubkey,
								event.content,
								event.tags,
								event.created_at,
							);
						} else {
							createChat(
								event.id,
								account.pubkey,
								event.pubkey,
								event.content,
								event.tags,
								event.created_at,
							);
						}
						break;
					}
					// repost
					case 6:
						createNote(
							event.id,
							account.id,
							event.pubkey,
							event.kind,
							event.tags,
							event.content,
							event.created_at,
							event.id,
						);
						break;
					// hide message (channel only)
					case 43:
						if (event.tags[0][0] === "e") {
							addToBlacklist(account.id, event.tags[0][1], 43, 1);
						}
						break;
					// mute user (channel only)
					case 44:
						if (event.tags[0][0] === "p") {
							addToBlacklist(account.id, event.tags[0][1], 44, 1);
						}
						break;
					case 1063:
						createNote(
							event.id,
							account.id,
							event.pubkey,
							event.kind,
							event.tags,
							event.content,
							event.created_at,
							"",
						);
						break;
					default:
						break;
				}
			},
			undefined,
			() => {
				eose.current += 1;
				if (eose.current === READONLY_RELAYS.length) {
					navigate("/app/space", { overwriteLastHistoryEntry: true });
				}
			},
		);

		return () => {
			unsubscribe();
		};
	});

	return (
		<div className="h-screen w-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-white">
			<div className="relative h-full overflow-hidden">
				{/* dragging area */}
				<div
					data-tauri-drag-region
					className="absolute left-0 top-0 z-20 h-16 w-full bg-transparent"
				/>
				{/* end dragging area */}
				<div className="relative flex h-full flex-col items-center justify-center">
					<div className="flex flex-col items-center gap-2">
						<LumeIcon className="h-16 w-16 text-black dark:text-white" />
						<div className="text-center">
							<h3 className="text-lg font-semibold leading-tight text-zinc-900 dark:text-white">
								Here&apos;s an interesting fact:
							</h3>
							<p className="font-medium text-zinc-300 dark:text-zinc-600">
								Bitcoin and Nostr can be used by anyone, and no one can stop
								you!
							</p>
						</div>
					</div>
					<div className="absolute bottom-16 left-1/2 -translate-x-1/2 transform">
						<svg
							className="h-5 w-5 animate-spin text-black dark:text-white"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<title id="loading">Loading</title>
							<circle
								className="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="4"
							/>
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	);
}