'use client';

/**
 * AppClientShell — client-side provider wrapper.
 *
 * Next.js layout.tsx is a server component, so all providers that rely on
 * React context / browser APIs must live inside this 'use client' boundary.
 * Children (the active page) are passed in from the layout.
 */

import { type ReactNode, Suspense } from 'react';
import App from '@/app/App';

// Wrap children in a Suspense boundary because useSearchParams() (used by
// some pages via the navigation shim) requires Suspense in Next.js 15.
function SuspenseWrapper({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      {children}
    </Suspense>
  );
}

export function AppClientShell({ children }: { children: ReactNode }) {
  return (
    <App>
      <SuspenseWrapper>{children}</SuspenseWrapper>
    </App>
  );
}
