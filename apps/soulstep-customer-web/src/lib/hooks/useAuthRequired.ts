'use client';

import { useAuth } from '@/app/providers';
import { useAuthGate } from '@/components/auth/AuthGateProvider';

export function useAuthRequired() {
  const { user } = useAuth();
  const { openAuthGate } = useAuthGate();
  return {
    requireAuth: (callback: () => void, promptKey?: string) => {
      if (user) callback();
      else openAuthGate(callback, promptKey);
    },
  };
}
