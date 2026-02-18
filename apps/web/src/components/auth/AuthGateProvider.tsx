import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/app/providers';
import AuthModal from './AuthModal';

interface AuthGateContextValue {
  openAuthGate: (callback: () => void, promptKey?: string) => void;
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [promptKey, setPromptKey] = useState<string | undefined>();
  const pendingCallback = useRef<(() => void) | null>(null);
  const wasWaitingForAuth = useRef(false);

  // When user becomes truthy after waiting for auth, call the pending callback
  useEffect(() => {
    if (user && wasWaitingForAuth.current) {
      wasWaitingForAuth.current = false;
      const cb = pendingCallback.current;
      pendingCallback.current = null;
      setIsOpen(false);
      if (cb) cb();
    }
  }, [user]);

  const openAuthGate = useCallback((callback: () => void, key?: string) => {
    if (user) {
      callback();
      return;
    }
    pendingCallback.current = callback;
    wasWaitingForAuth.current = true;
    setPromptKey(key);
    setIsOpen(true);
  }, [user]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    wasWaitingForAuth.current = false;
    pendingCallback.current = null;
  }, []);

  return (
    <AuthGateContext.Provider value={{ openAuthGate }}>
      {children}
      <AuthModal
        isOpen={isOpen}
        onClose={handleClose}
        promptKey={promptKey}
      />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate(): AuthGateContextValue {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error('useAuthGate must be used within AuthGateProvider');
  return ctx;
}
