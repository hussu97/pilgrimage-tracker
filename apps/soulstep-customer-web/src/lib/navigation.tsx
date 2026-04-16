/**
 * React Router DOM compatibility shim for Next.js App Router.
 *
 * All existing page/component files import from this module instead of
 * 'react-router-dom', so they work with Next.js navigation without
 * individual rewrites.
 *
 * API mapping:
 *   useNavigate()    → useRouter().push / replace / back
 *   useParams()      → next/navigation useParams()
 *   useLocation()    → usePathname() + useSearchParams()
 *   useSearchParams()→ [URLSearchParams] tuple (read-only)
 *   Navigate         → client-side redirect component
 *   Link             → next/link with `to` → `href` prop alias
 */
'use client';

import {
  useRouter,
  useParams as useNextParams,
  usePathname,
  useSearchParams as useNextSearchParams,
} from 'next/navigation';
import NextLink from 'next/link';
import { useEffect, type ComponentProps, type ReactNode } from 'react';

// ─── useNavigate ──────────────────────────────────────────────────────────────

type NavigateFn = {
  (to: string, opts?: { replace?: boolean; state?: unknown }): void;
  (delta: number): void;
};

export function useNavigate(): NavigateFn {
  const router = useRouter();
  return (to: string | number, opts?: { replace?: boolean }) => {
    if (typeof to === 'number') {
      if (to < 0) router.back();
      else router.forward();
      return;
    }
    if (opts?.replace) router.replace(to);
    else router.push(to);
  };
}

// ─── useParams ───────────────────────────────────────────────────────────────

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useNextParams() as unknown as T;
}

// ─── useLocation ─────────────────────────────────────────────────────────────

export function useLocation(): {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
} {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return { pathname, search, hash: '', state: null };
}

// ─── useSearchParams ─────────────────────────────────────────────────────────
// Returns a [URLSearchParams] tuple to match react-router-dom's API (read-only).

export function useSearchParams(): [URLSearchParams] {
  const params = useNextSearchParams();
  return [new URLSearchParams(params.toString())];
}

// ─── Navigate ────────────────────────────────────────────────────────────────

interface NavigateProps {
  to: string;
  replace?: boolean;
  /** Unused — Next.js App Router does not support history state; use query params instead. */
  state?: unknown;
}

/**
 * Imperative redirect component. Performs navigation after mount to avoid
 * calling router methods during render (which Next.js does not allow).
 */
export function Navigate({ to, replace }: NavigateProps): null {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ─── Link ────────────────────────────────────────────────────────────────────
// Maps React Router's `to` prop to Next.js Link's `href`.

type NextLinkProps = ComponentProps<typeof NextLink>;

interface LinkProps extends Omit<NextLinkProps, 'href'> {
  to: string;
  children?: ReactNode;
}

export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <NextLink href={to} {...rest}>
      {children}
    </NextLink>
  );
}
