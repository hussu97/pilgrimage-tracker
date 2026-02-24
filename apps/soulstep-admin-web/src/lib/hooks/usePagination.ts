import { useState } from "react";

export interface PaginationState {
  page: number;
  pageSize: number;
}

export interface PaginationActions {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  reset: () => void;
}

export function usePagination(defaultPageSize = 50): PaginationState & PaginationActions {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const setPage = (p: number) => setPageState(p);
  const setPageSize = (s: number) => {
    setPageSizeState(s);
    setPageState(1);
  };
  const reset = () => {
    setPageState(1);
    setPageSizeState(defaultPageSize);
  };

  return { page, pageSize, setPage, setPageSize, reset };
}
