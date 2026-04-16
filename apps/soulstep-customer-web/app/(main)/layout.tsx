import type { ReactNode } from 'react';
import { MainLayoutClient } from '@/components/layout/MainLayoutClient';

export default function MainLayout({ children }: { children: ReactNode }) {
  return <MainLayoutClient>{children}</MainLayoutClient>;
}
