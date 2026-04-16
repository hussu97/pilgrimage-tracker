'use client';
import Layout from '@/components/layout/Layout';
import type { ReactNode } from 'react';

export default function MainLayout({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>;
}
