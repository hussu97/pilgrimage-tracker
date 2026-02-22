// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePagination } from "@/lib/hooks/usePagination";

describe("usePagination", () => {
  it("starts with page 1 and default page size", () => {
    const { result } = renderHook(() => usePagination(20));
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(20);
  });

  it("updates page", () => {
    const { result } = renderHook(() => usePagination());
    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.page).toBe(3);
  });

  it("resets page to 1 when page size changes", () => {
    const { result } = renderHook(() => usePagination());
    act(() => {
      result.current.setPage(5);
    });
    act(() => {
      result.current.setPageSize(50);
    });
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(50);
  });

  it("reset returns to initial state", () => {
    const { result } = renderHook(() => usePagination(10));
    act(() => {
      result.current.setPage(4);
      result.current.setPageSize(50);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(10);
  });
});
