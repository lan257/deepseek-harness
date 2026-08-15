/**
 * Browser-local read state for the notification center: the set of
 * notification ids the user has already seen. Persisted in localStorage so
 * the unread badge survives reloads; capped so the key cannot grow without
 * bound. Storage failures degrade to a per-load empty set (the badge then
 * shows everything unread until the tab is opened).
 */

const STORAGE_KEY = 'dsh:notifications:read'
/** Keep this many ids in storage (older ids are dropped, re-reading them as unread). */
const READ_CAP = 200

/** Read the persisted read-id set (best effort; an unreadable store reads empty). */
export function loadReadIds(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Persist the read-id set (best effort; a full or blocked store is ignored). */
export function saveReadIds(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-READ_CAP)))
  } catch {
    // Storage unavailable (private mode / quota): the badge just resets per load.
  }
}
