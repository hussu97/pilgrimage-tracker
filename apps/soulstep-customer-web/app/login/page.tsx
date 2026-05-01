import Login from '@/app/pages/Login';
import { QueryParamPageShell } from '../AppClientShell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <QueryParamPageShell>
      <Login />
    </QueryParamPageShell>
  );
}
