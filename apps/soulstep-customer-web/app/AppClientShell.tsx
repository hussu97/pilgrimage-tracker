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
import SplashScreen from '@/components/common/SplashScreen';
import type { InitialI18nPayload } from '@/app/providers';

export function AppClientShell({
  children,
  initialI18n,
}: {
  children: ReactNode;
  initialI18n?: InitialI18nPayload;
}) {
  return <App initialI18n={initialI18n}>{children}</App>;
}

export function QueryParamPageShell({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SplashScreen />}>{children}</Suspense>;
}
