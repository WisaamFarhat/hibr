/**
 * A tiny in-memory key-value store where every entry expires after a
 * fixed TTL. Backs every "pending state between requests" store in
 * this app (lib/pending-uploads.ts, lib/translation-cache.ts,
 * lib/sent-email-markers.ts) so the expiry logic itself — the part
 * most likely to have an off-by-one or leak bug — is written and
 * tested in exactly one place.
 *
 * MVP CHOICE, same caveat repeated wherever this is used: this only
 * coordinates correctly within a single server instance. Multi-instance
 * deployments (e.g. Vercel scaling out under load) would need a real
 * shared store (Redis, etc.) instead — see README "Known limitation."
 */
export class TtlMap<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();

  constructor(private ttlMs: number) {}

  set(key: string, value: V) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get(key: string): V | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string) {
    this.store.delete(key);
  }

  /** Removes all expired entries. Called periodically by the shared cleanup timer in lib/cleanup-timer.ts. */
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}
