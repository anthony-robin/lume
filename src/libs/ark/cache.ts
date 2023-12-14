// inspired by NDK Cache Dexie
// source: https://github.com/nostr-dev-kit/ndk/tree/master/ndk-cache-dexie
import {
  Hexpubkey,
  NDKCacheAdapter,
  NDKEvent,
  NDKFilter,
  NDKRelay,
  NDKSubscription,
  NDKUserProfile,
  profileFromEvent,
} from '@nostr-dev-kit/ndk';
import Database from '@tauri-apps/plugin-sql';
import { LRUCache } from 'lru-cache';
import { NostrEvent } from 'nostr-fetch';
import { matchFilter } from 'nostr-tools';
import { NDKCacheEvent, NDKCacheEventTag, NDKCacheUser } from '@utils/types';

export class NDKCacheAdapterTauri implements NDKCacheAdapter {
  #db: Database;
  private dirtyProfiles: Set<Hexpubkey> = new Set();
  public profiles?: LRUCache<Hexpubkey, NDKUserProfile>;
  readonly locking: boolean;

  constructor(db: Database) {
    this.#db = db;
    this.locking = true;

    this.profiles = new LRUCache({
      max: 100000,
    });

    setInterval(() => {
      this.dumpProfiles();
    }, 1000 * 10);
  }

  async #getCacheUser(pubkey: string) {
    const results: Array<NDKCacheUser> = await this.#db.select(
      'SELECT * FROM ndk_users WHERE pubkey = $1 ORDER BY pubkey DESC LIMIT 1;',
      [pubkey]
    );

    if (!results.length) return null;

    if (typeof results[0].profile === 'string')
      results[0].profile = JSON.parse(results[0].profile);

    return results[0];
  }

  async #getCacheEvent(id: string) {
    const results: Array<NDKCacheEvent> = await this.#db.select(
      'SELECT * FROM ndk_events WHERE id = $1 ORDER BY id DESC LIMIT 1;',
      [id]
    );

    if (!results.length) return null;
    return results[0];
  }

  async #getCacheEvents(ids: string[]) {
    const idsArr = `'${ids.join("','")}'`;

    const results: Array<NDKCacheEvent> = await this.#db.select(
      `SELECT * FROM ndk_events WHERE id IN (${idsArr}) ORDER BY id;`
    );

    if (!results.length) return [];
    return results;
  }

  async #getCacheEventsByPubkey(pubkey: string) {
    const results: Array<NDKCacheEvent> = await this.#db.select(
      'SELECT * FROM ndk_events WHERE pubkey = $1 ORDER BY id;',
      [pubkey]
    );

    if (!results.length) return [];
    return results;
  }

  async #getCacheEventsByKind(kind: number) {
    const results: Array<NDKCacheEvent> = await this.#db.select(
      'SELECT * FROM ndk_events WHERE kind = $1 ORDER BY id;',
      [kind]
    );

    if (!results.length) return [];
    return results;
  }

  async #getCacheEventsByKindAndAuthor(kind: number, pubkey: string) {
    const results: Array<NDKCacheEvent> = await this.#db.select(
      'SELECT * FROM ndk_events WHERE kind = $1 AND pubkey = $2 ORDER BY id;',
      [kind, pubkey]
    );

    if (!results.length) return [];
    return results;
  }

  async #getCacheEventTagsByTagValue(tagValue: string) {
    const results: Array<NDKCacheEventTag> = await this.#db.select(
      'SELECT * FROM ndk_eventtags WHERE tagValue = $1 ORDER BY id;',
      [tagValue]
    );

    if (!results.length) return [];
    return results;
  }

  async #setCacheEvent({
    id,
    pubkey,
    content,
    kind,
    createdAt,
    relay,
    event,
  }: NDKCacheEvent) {
    return await this.#db.execute(
      'INSERT OR IGNORE INTO ndk_events (id, pubkey, content, kind, createdAt, relay, event) VALUES ($1, $2, $3, $4, $5, $6, $7);',
      [id, pubkey, content, kind, createdAt, relay, event]
    );
  }

  async #setCacheEventTag({ id, eventId, tag, value, tagValue }: NDKCacheEventTag) {
    return await this.#db.execute(
      'INSERT OR IGNORE INTO ndk_eventtags (id, eventId, tag, value, tagValue) VALUES ($1, $2, $3, $4, $5);',
      [id, eventId, tag, value, tagValue]
    );
  }

  async #setCacheProfiles(profiles: Array<NDKCacheUser>) {
    return await Promise.all(
      profiles.map(
        async (profile) =>
          await this.#db.execute(
            'INSERT OR IGNORE INTO ndk_users (pubkey, profile, createdAt) VALUES ($1, $2, $3);',
            [profile.pubkey, profile.profile, profile.createdAt]
          )
      )
    );
  }

  public async query(subscription: NDKSubscription): Promise<void> {
    Promise.allSettled(
      subscription.filters.map((filter) => this.processFilter(filter, subscription))
    );
  }

  public async fetchProfile(pubkey: Hexpubkey) {
    if (!this.profiles) return null;

    let profile = this.profiles.get(pubkey);

    if (!profile) {
      const user = await this.#getCacheUser(pubkey);
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
    subscription: NDKSubscription
  ): Promise<void> {
    const _filter = { ...filter };
    delete _filter.limit;
    const filterKeys = Object.keys(_filter || {}).sort();

    try {
      (await this.byKindAndAuthor(filterKeys, filter, subscription)) ||
        (await this.byAuthors(filterKeys, filter, subscription)) ||
        (await this.byKinds(filterKeys, filter, subscription)) ||
        (await this.byIdsQuery(filterKeys, filter, subscription)) ||
        (await this.byNip33Query(filterKeys, filter, subscription)) ||
        (await this.byTagsAndOptionallyKinds(filterKeys, filter, subscription));
    } catch (error) {
      console.error(error);
    }
  }

  public async setEvent(
    event: NDKEvent,
    _filter: NDKFilter,
    relay?: NDKRelay
  ): Promise<void> {
    if (event.kind === 0) {
      if (!this.profiles) return;

      const profile: NDKUserProfile = profileFromEvent(event);
      this.profiles.set(event.pubkey, profile);
    } else {
      let addEvent = true;

      if (event.isParamReplaceable()) {
        const replaceableId = `${event.kind}:${event.pubkey}:${event.tagId()}`;
        const existingEvent = await this.#getCacheEvent(replaceableId);
        if (
          existingEvent &&
          event.created_at &&
          existingEvent.createdAt > event.created_at
        ) {
          addEvent = false;
        }
      }

      if (addEvent) {
        this.#setCacheEvent({
          id: event.tagId(),
          pubkey: event.pubkey,
          content: event.content,
          kind: event.kind!,
          createdAt: event.created_at!,
          relay: relay?.url,
          event: JSON.stringify(event.rawEvent()),
        });

        // Don't cache contact lists as tags since it's expensive
        // and there is no use case for it
        if (event.kind !== 3) {
          event.tags.forEach((tag) => {
            if (tag[0].length !== 1) return;

            this.#setCacheEventTag({
              id: `${event.id}:${tag[0]}:${tag[1]}`,
              eventId: event.id,
              tag: tag[0],
              value: tag[1],
              tagValue: tag[0] + tag[1],
            });
          });
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
    subscription: NDKSubscription
  ): Promise<boolean> {
    const f = ['authors'];
    const hasAllKeys =
      filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

    let foundEvents = false;

    if (hasAllKeys && filter.authors) {
      for (const pubkey of filter.authors) {
        const events = await this.#getCacheEventsByPubkey(pubkey);
        for (const event of events) {
          let rawEvent: NostrEvent;
          try {
            rawEvent = JSON.parse(event.event);
          } catch (e) {
            console.log('failed to parse event', e);
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
    subscription: NDKSubscription
  ): Promise<boolean> {
    const f = ['kinds'];
    const hasAllKeys =
      filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

    let foundEvents = false;

    if (hasAllKeys && filter.kinds) {
      for (const kind of filter.kinds) {
        const events = await this.#getCacheEventsByKind(kind);
        for (const event of events) {
          let rawEvent: NostrEvent;
          try {
            rawEvent = JSON.parse(event.event);
          } catch (e) {
            console.log('failed to parse event', e);
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
    subscription: NDKSubscription
  ): Promise<boolean> {
    const f = ['ids'];
    const hasAllKeys =
      filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

    if (hasAllKeys && filter.ids) {
      for (const id of filter.ids) {
        const event = await this.#getCacheEvent(id);
        if (!event) continue;

        let rawEvent: NostrEvent;
        try {
          rawEvent = JSON.parse(event.event);
        } catch (e) {
          console.log('failed to parse event', e);
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
    subscription: NDKSubscription
  ): Promise<boolean> {
    const f = ['#d', 'authors', 'kinds'];
    const hasAllKeys =
      filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));

    if (hasAllKeys && filter.kinds && filter.authors) {
      for (const kind of filter.kinds) {
        const replaceableKind = kind >= 30000 && kind < 40000;

        if (!replaceableKind) continue;

        for (const author of filter.authors) {
          for (const dTag of filter['#d']) {
            const replaceableId = `${kind}:${author}:${dTag}`;
            const event = await this.#getCacheEvent(replaceableId);
            if (!event) continue;

            let rawEvent: NostrEvent;
            try {
              rawEvent = JSON.parse(event.event);
            } catch (e) {
              console.log('failed to parse event', e);
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
    subscription: NDKSubscription
  ): Promise<boolean> {
    const f = ['authors', 'kinds'];
    const hasAllKeys =
      filterKeys.length === f.length && f.every((k) => filterKeys.includes(k));
    let foundEvents = false;

    if (!hasAllKeys) return false;

    if (filter.kinds && filter.authors) {
      for (const kind of filter.kinds) {
        for (const author of filter.authors) {
          const events = await this.#getCacheEventsByKindAndAuthor(kind, author);

          for (const event of events) {
            let rawEvent: NostrEvent;
            try {
              rawEvent = JSON.parse(event.event);
            } catch (e) {
              console.log('failed to parse event', e);
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
    subscription: NDKSubscription
  ): Promise<boolean> {
    for (const filterKey of filterKeys) {
      const isKind = filterKey === 'kinds';
      const isTag = filterKey.startsWith('#') && filterKey.length === 2;

      if (!isKind && !isTag) return false;
    }

    const events = await this.filterByTag(filterKeys, filter);
    const kinds = filter.kinds as number[];

    for (const event of events) {
      if (!kinds?.includes(event.kind!)) continue;

      subscription.eventReceived(event, undefined, true);
    }

    return false;
  }

  private async filterByTag(
    filterKeys: string[],
    filter: NDKFilter
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
        const eventTags = await this.#getCacheEventTagsByTagValue(tag + value);
        if (!eventTags.length) continue;

        const eventIds = eventTags.map((t) => t.eventId);

        const events = await this.#getCacheEvents(eventIds);
        for (const event of events) {
          let rawEvent;
          try {
            rawEvent = JSON.parse(event.event);

            // Make sure all passed filters match the event
            if (!matchFilter(filter, rawEvent)) continue;
          } catch (e) {
            console.log('failed to parse event', e);
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
      await this.#setCacheProfiles(profiles);
    }

    this.dirtyProfiles.clear();
  }
}
