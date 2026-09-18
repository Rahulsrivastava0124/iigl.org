/**
 * The dashboard's answers, kept for a short while.
 *
 * `/dashboard/summary` is about fifty queries. Each one is small — the whole
 * result is a screenful of counts — but the database is not on this machine,
 * so what the request waits on is fifty round trips rather than fifty pieces of
 * work. Against production data that is seconds, on the first screen everybody
 * opens, and every one of those seconds is spent computing an answer that was
 * already computed for the person who opened it a moment ago.
 *
 * So the answer is held. Not the queries — the finished JSON, per caller and
 * per endpoint, for a minute.
 *
 * ## Why a minute, and why in the process
 *
 * A dashboard is a reading, not a ledger. The counts move when somebody takes
 * an order at a counter, and nobody is watching the tile at that instant; a
 * figure up to a minute old is what a dashboard has always been. Anything that
 * must be exact when it is read — an order's own page, a statement, a wallet —
 * does not come through here.
 *
 * In the process, because there is one process and no Redis in this deployment.
 * That has a consequence worth stating: run two API containers and each keeps
 * its own, so two people can see figures a minute apart from each other. For a
 * dashboard that is acceptable; for anything where it would not be, do not put
 * it here.
 *
 * ## Per caller
 *
 * The key carries who asked — one entry per account. Head office sees the
 * network, a laboratory sees itself, and an employee sees their own orders and
 * their own wallet in the `mine` block, so no two of them have the same correct
 * answer. One body served to two callers would be a scope bug, which is the way
 * caches usually leak; `scopeKey` below says why it is keyed as tightly as it
 * is, and `npm run check:dashboard` fails if two callers ever share one.
 *
 * ## Staleness that matters
 *
 * Taking an order, settling one, writing a certificate and approving a
 * transaction all move these tiles. Rather than name those routes, `app.ts`
 * drops the whole map after **any** successful write under `/api` — so the
 * change somebody just made is on the screen they land back on, and the next
 * endpoint anybody adds invalidates correctly without its author knowing this
 * file exists. The one kind of staleness a person actually notices is their own
 * work not appearing.
 */

/** How long an entry is served for. */
const TTL_MS = 60_000;

/**
 * A ceiling, so a long-running process cannot grow this without bound.
 *
 * One entry per account per endpoint is forty-two in this deployment, so the
 * limit is never reached in practice; it is here because "in practice" is not a
 * property of the code. Oldest first, which for entries that all live a minute
 * is near enough to least-recently-used.
 */
const MAX_ENTRIES = 200;

interface Entry {
  /** The finished response body, as it will be sent. */
  value: unknown;
  /** When it stops being served. */
  expires: number;
}

const entries = new Map<string, Entry>();

/** Who is asking. Two callers who should see different figures key differently. */
export interface CacheScope {
  roleId: number | null;
  labId: number | null;
  id: number;
}

/**
 * The key for an endpoint and a caller. One entry per account.
 *
 * Keying on the laboratory looks better — every member of one laboratory would
 * share an entry — and it is wrong. `/dashboard/summary` carries a `mine`
 * block, which is one employee's own orders and their own wallet, and a `lab`
 * block that a laboratory account gets and its staff do not. Two people of one
 * laboratory therefore have two different correct answers, and a shared entry
 * hands the first one to whoever asks second: an employee reading somebody
 * else's takings as their own.
 *
 * So: per account. Twenty-one active accounts and two endpoints in this
 * deployment, which is nowhere near `MAX_ENTRIES`, and the saving that matters
 * is the same one anyway — a dashboard is re-read far more often by the person
 * looking at it than it is by a second person.
 *
 * The role and the laboratory ride along so that a change to either — somebody
 * promoted, somebody moved between laboratories — cannot be served the figures
 * from before it.
 */
export function scopeKey(endpoint: string, who: CacheScope): string {
  return `${endpoint}:u${who.id}:r${who.roleId ?? 'none'}:l${who.labId ?? 'none'}`;
}

/** The cached body for this key, or undefined when there is none or it has expired. */
export function cached<T>(key: string): T | undefined {
  const hit = entries.get(key);
  if (!hit) return undefined;

  if (hit.expires <= Date.now()) {
    entries.delete(key);
    return undefined;
  }

  return hit.value as T;
}

/** Holds a finished body under a key. Returns it, so a caller can `return remember(k, body)`. */
export function remember<T>(key: string, value: T): T {
  if (entries.size >= MAX_ENTRIES) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }

  entries.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

/**
 * Drops everything.
 *
 * Called when something that moves the tiles is written. Everything rather than
 * one laboratory's entry: an order belongs to a laboratory but also to head
 * office's totals, so a targeted drop would have to know both, and getting that
 * wrong leaves a figure that is wrong for a minute with no sign of it. The
 * whole map is a few dozen entries and rebuilding one is one slow request.
 */
export function invalidateDashboard(): void {
  entries.clear();
}

/** For the timing check: how many entries are held. */
export const cacheSize = () => entries.size;
