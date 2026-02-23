import { useCallback, useEffect, useRef } from "react";

/**
 * Calls `callback` on an interval while `active` is true.
 * Stops automatically when `active` becomes false.
 * The callback ref is kept up-to-date so stale closures are never an issue.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  active: boolean
): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const tick = useCallback(() => {
    void savedCallback.current();
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, tick]);
}
