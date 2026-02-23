// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePolling } from "@/lib/hooks/usePolling";

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call callback when inactive", () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, 1000, false));

    act(() => { vi.advanceTimersByTime(5000); });

    expect(cb).not.toHaveBeenCalled();
  });

  it("calls callback on interval when active", () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, 1000, true));

    act(() => { vi.advanceTimersByTime(3000); });

    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("stops calling callback when active becomes false", () => {
    const cb = vi.fn();
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => usePolling(cb, 1000, active),
      { initialProps: { active: true } }
    );

    act(() => { vi.advanceTimersByTime(2000); });
    expect(cb).toHaveBeenCalledTimes(2);

    rerender({ active: false });

    act(() => { vi.advanceTimersByTime(3000); });
    // No additional calls after deactivation
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("resumes calling when active becomes true again", () => {
    const cb = vi.fn();
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => usePolling(cb, 1000, active),
      { initialProps: { active: false } }
    );

    act(() => { vi.advanceTimersByTime(2000); });
    expect(cb).toHaveBeenCalledTimes(0);

    rerender({ active: true });

    act(() => { vi.advanceTimersByTime(2000); });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("uses the latest callback without restarting the interval", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => usePolling(cb, 1000, true),
      { initialProps: { cb: cb1 } }
    );

    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(0);

    rerender({ cb: cb2 });

    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb1).toHaveBeenCalledTimes(1); // not called again
    expect(cb2).toHaveBeenCalledTimes(1); // new callback used
  });

  it("respects custom interval duration", () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, 500, true));

    act(() => { vi.advanceTimersByTime(2000); });

    expect(cb).toHaveBeenCalledTimes(4);
  });
});
