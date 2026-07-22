import { TtlMap } from "./ttl-map";

const registeredMaps: TtlMap<unknown>[] = [];

export function registerForCleanup(map: TtlMap<unknown>) {
  registeredMaps.push(map);
}

// .unref() so this timer alone doesn't keep a process alive (relevant
// for one-off scripts/tests, and harmless in a long-running server).
const cleanupTimer = setInterval(() => {
  for (const map of registeredMaps) map.sweep();
}, 5 * 60 * 1000);
cleanupTimer.unref?.();
