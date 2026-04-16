'use client';

import type { ReactNode } from 'react';
import Layout from './Layout';

export function MainLayoutClient({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>;
}
