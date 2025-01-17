// inspired by NDK Cache Dexie
// source: https://github.com/nostr-dev-kit/ndk/tree/master/ndk-cache-dexie

import { LumeStorage } from "@lume/storage";
import {
	Hexpubkey,
	NDKCacheAdapter,
	NDKEvent,
	NDKFilter,
	NDKRelay,
	NDKSubscription,
	NDKUserProfile,
	profileFromEvent,
} from "@nostr-dev-kit/ndk";
import { LRUCache } from "lru-cache";
import { NostrEvent } from "nostr-fetch";
import { matchFilter } from "nostr-tools";

export class NDKCacheAdapterTauri implements NDKCacheAdapter {
	#storage: LumeStorage;
	private dirtyProfiles: Set<Hexpubkey> = new Set();
	public profiles?: LRUCache<Hexpubkey, NDKUserProfile>;
	readonly locking: boolean;

	constructor(storage: LumeStorage) {
		this.#storage = storage;
		this.locking = true;

		this.profiles = new LRUCache({
			max: 100000,
		});

		setInterval(() => {
			this.dumpProfiles();
		}, 1000 * 10);
	}

	public async query(subscription: NDKSubscription): Promise<void> {
		Promise.allSettled(
			subscription.filters.map((filter) =>
				this.processFilter(filter, subscription),
			),
		);
	}

	public async fetchProfile(pubkey: Hexpubkey) {
		if (!this.profiles) return null;

		let profile = this.profiles.get(pubkey);

		if (!profile) {
			const user = await this.#storage.getCacheUser(pubkey);
			if (user) {
				profile = user.profile as NDKUserProfile;
				this.profiles.set(pubkey, profile);
			}
		}

		return profile;
	}

	public saveProfile(pubkey: Hexpubkey, profile: NDKUserProfile) {
		if (!this.profiles) return;

		this.profiles.set(pubkey, profile);

		this.dirtyProfiles.add(pubkey);
	}

	private async processFilter(
		filter: NDKFilter,
		subscription: NDKSubscription,
	): Promise<void> {
		const _filter = { ...filter };
		_filter.limit = undefined;
		const filterKeys = Object.keys(_filter || {})
			.sort()
			.filter((e) => e !== "limit");

		try {
			await Promise.allSettled([
				this.byKindAndAuthor(filterKeys, filter, subscription),
				this.byAuthors(filterKeys, filter, subscription),
				this.byKinds(filterKeys, filter, subscription),
				this.byIdsQuery(filterKeys, filter, subscription),
				this.byNip33Query(filterKeys, filter, subscription),
				this.byTagsAndOptionallyKinds(filterKeys, filter, subscription),
			]);
		} catch (error) {
			console.error(error);
		}
	}

	public async setEvent(
		event: NDKEvent,
		filters: NDKFilter[],
		relay?: NDKRelay,
	): Promise<void> {
		if (event.kind === 0) {
			if (!this.profiles) return;

			const profile: NDKUserProfile = profileFromEvent(event);
			this.profiles.set(event.pubkey, profile);
		} else {
			let addEvent = true;

			if (event.isParamReplaceable()) {
				const replaceableId = `${event.kind}:${event.pubkey}:${event.tagId()}`;
				const existingEvent = await this.#storage.getCacheEvent(replaceableId);
				if (
					existingEvent &&
					event.created_at &&
					existingEvent.createdAt > event.created_at
				) {
					addEvent = false;
				}
			}

			if (addEvent) {
				this.#storage.setCacheEvent({
					id: event.tagId(),
					pubkey: event.pubkey,
					content: event.content,
					// biome-ignore lint/style/noNonNullAssertion: <explanation>
					kind: event.kind!,
					// biome-ignore lint/style/noNonNullAssertion: <explanation>
					createdAt: event.created_at!,
					relay: relay?.url,
					event: JSON.stringify(event.rawEvent()),
				});

				// Don't cache contact lists as tags since it's expensive
				// and there is no use case for it
				if (event.kind !== 3) {
					for (const tag of event.tags) {
						if (tag[0].length !== 1) return;

						this.#storage.setCacheEventTag({
							id: `${event.id}:${tag[0]}:${tag[1]}`,
							eventId: event.id,
							tag: tag[0],
							value: tag[1],
							tagValue: tag[0] + tag[1],
						});
					}
				}
			}
		}
	}

	/**
	 * Searches by authors
	 */
	private async byAuthors(
		filterKeys: string[],
		filter: NDKFilter,
		subscription: NDKSubscription,
	): Promise<boolean> {
		const f = ["authors"];
		const hasAllKeys =
			filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

		let foundEvents = false;

		if (hasAllKeys && filter.authors) {
			for (const pubkey of filter.authors) {
				const events = await this.#storage.getCacheEventsByPubkey(pubkey);
				for (const event of events) {
					let rawEvent: NostrEvent;
					try {
						rawEvent = JSON.parse(event.event);
					} catch (e) {
						console.log("failed to parse event", e);
						continue;
					}

					const ndkEvent = new NDKEvent(undefined, rawEvent);
					const relay = event.relay ? new NDKRelay(event.relay) : undefined;
					subscription.eventReceived(ndkEvent, relay, true);
					foundEvents = true;
				}
			}
		}
		return foundEvents;
	}

	/**
	 * Searches by kinds
	 */
	private async byKinds(
		filterKeys: string[],
		filter: NDKFilter,
		subscription: NDKSubscription,
	): Promise<boolean> {
		const f = ["kinds"];
		const hasAllKeys =
			filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

		let foundEvents = false;

		if (hasAllKeys && filter.kinds) {
			for (const kind of filter.kinds) {
				const events = await this.#storage.getCacheEventsByKind(kind);
				for (const event of events) {
					let rawEvent: NostrEvent;
					try {
						rawEvent = JSON.parse(event.event);
					} catch (e) {
						console.log("failed to parse event", e);
						continue;
					}

					const ndkEvent = new NDKEvent(undefined, rawEvent);
					const relay = event.relay ? new NDKRelay(event.relay) : undefined;
					subscription.eventReceived(ndkEvent, relay, true);
					foundEvents = true;
				}
			}
		}
		return foundEvents;
	}

	/**
	 * Searches by ids
	 */
	private async byIdsQuery(
		filterKeys: string[],
		filter: NDKFilter,
		subscription: NDKSubscription,
	): Promise<boolean> {
		const f = ["ids"];
		const hasAllKeys =
			filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

		if (hasAllKeys && filter.ids) {
			for (const id of filter.ids) {
				const event = await this.#storage.getCacheEvent(id);
				if (!event) continue;

				let rawEvent: NostrEvent;
				try {
					rawEvent = JSON.parse(event.event);
				} catch (e) {
					console.log("failed to parse event", e);
					continue;
				}

				const ndkEvent = new NDKEvent(undefined, rawEvent);
				const relay = event.relay ? new NDKRelay(event.relay) : undefined;
				subscription.eventReceived(ndkEvent, relay, true);
			}

			return true;
		}

		return false;
	}

	/**
	 * Searches by NIP-33
	 */
	private async byNip33Query(
		filterKeys: string[],
		filter: NDKFilter,
		subscription: NDKSubscription,
	): Promise<boolean> {
		const f = ["#d", "authors", "kinds"];
		const hasAllKeys =
			filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

		if (hasAllKeys && filter.kinds && filter.authors) {
			for (const kind of filter.kinds) {
				const replaceableKind = kind >= 30000 && kind < 40000;

				if (!replaceableKind) continue;

				for (const author of filter.authors) {
					for (const dTag of filter["#d"]) {
						const replaceableId = `${kind}:${author}:${dTag}`;
						const event = await this.#storage.getCacheEvent(replaceableId);
						if (!event) continue;

						let rawEvent: NostrEvent;
						try {
							rawEvent = JSON.parse(event.event);
						} catch (e) {
							console.log("failed to parse event", e);
							continue;
						}

						const ndkEvent = new NDKEvent(undefined, rawEvent);
						const relay = event.relay ? new NDKRelay(event.relay) : undefined;
						subscription.eventReceived(ndkEvent, relay, true);
					}
				}
			}
			return true;
		}
		return false;
	}

	/**
	 * Searches by kind & author
	 */
	private async byKindAndAuthor(
		filterKeys: string[],
		filter: NDKFilter,
		subscription: NDKSubscription,
	): Promise<boolean> {
		const f = ["authors", "kinds"];
		const hasAllKeys =
			filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));
		let foundEvents = false;

		if (!hasAllKeys) return false;

		if (filter.kinds && filter.authors) {
			for (const kind of filter.kinds) {
				for (const author of filter.authors) {
					const events = await this.#storage.getCacheEventsByKindAndAuthor(
						kind,
						author,
					);

					for (const event of events) {
						let rawEvent: NostrEvent;
						try {
							rawEvent = JSON.parse(event.event);
						} catch (e) {
							console.log("failed to parse event", e);
							continue;
						}

						const ndkEvent = new NDKEvent(undefined, rawEvent);
						const relay = event.relay ? new NDKRelay(event.relay) : undefined;
						subscription.eventReceived(ndkEvent, relay, true);
						foundEvents = true;
					}
				}
			}
		}
		return foundEvents;
	}

	/**
	 * Searches by tags and optionally filters by tags
	 */
	private async byTagsAndOptionallyKinds(
		filterKeys: string[],
		filter: NDKFilter,
		subscription: NDKSubscription,
	): Promise<boolean> {
		for (const filterKey of filterKeys) {
			const isKind = filterKey === "kinds";
			const isTag = filterKey.startsWith("#") && filterKey.length === 2;

			if (!isKind && !isTag) return false;
		}

		const events = await this.filterByTag(filterKeys, filter);
		const kinds = filter.kinds as number[];

		for (const event of events) {
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			if (!kinds?.includes(event.kind!)) continue;
			subscription.eventReceived(event, undefined, true);
		}

		return false;
	}

	private async filterByTag(
		filterKeys: string[],
		filter: NDKFilter,
	): Promise<NDKEvent[]> {
		const retEvents: NDKEvent[] = [];

		for (const filterKey of filterKeys) {
			if (filterKey.length !== 2) continue;
			const tag = filterKey.slice(1);
			// const values = filter[filterKey] as string[];
			const values: string[] = [];
			for (const [key, value] of Object.entries(filter)) {
				if (key === filterKey) values.push(value as string);
			}

			for (const value of values) {
				const eventTags = await this.#storage.getCacheEventTagsByTagValue(
					tag + value,
				);
				if (!eventTags.length) continue;

				const eventIds = eventTags.map((t) => t.eventId);

				const events = await this.#storage.getCacheEvents(eventIds);
				for (const event of events) {
					let rawEvent: NostrEvent;
					try {
						rawEvent = JSON.parse(event.event);

						// Make sure all passed filters match the event
						if (!matchFilter(filter, rawEvent)) continue;
					} catch (e) {
						console.log("failed to parse event", e);
						continue;
					}

					const ndkEvent = new NDKEvent(undefined, rawEvent);
					const relay = event.relay ? new NDKRelay(event.relay) : undefined;
					ndkEvent.relay = relay;
					retEvents.push(ndkEvent);
				}
			}
		}

		return retEvents;
	}

	private async dumpProfiles(): Promise<void> {
		const profiles = [];

		if (!this.profiles) return;

		for (const pubkey of this.dirtyProfiles) {
			const profile = this.profiles.get(pubkey);

			if (!profile) continue;

			profiles.push({
				pubkey,
				profile: JSON.stringify(profile),
				createdAt: Date.now(),
			});
		}

		if (profiles.length) {
			await this.#storage.setCacheProfiles(profiles);
		}

		this.dirtyProfiles.clear();
	}
}
