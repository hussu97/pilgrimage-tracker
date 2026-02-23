/**
 * UpdateContext — global state for soft/hard update prompts.
 *
 * - Hard update: triggered by a 426 response from authFetch or an explicit
 *   call to triggerForceUpdate(). Shows a full-screen blocking modal.
 * - Soft update: triggered on startup via GET /api/v1/app-version comparison.
 *   Shows a dismissable banner on HomeScreen.
 */
import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface UpdateContextValue {
  forceUpdate: boolean;
  softUpdate: boolean;
  storeUrl: string;
  triggerForceUpdate: (storeUrl: string) => void;
  triggerSoftUpdate: (storeUrl: string) => void;
  dismissSoftUpdate: () => void;
}

const UpdateContext = createContext<UpdateContextValue>({
  forceUpdate: false,
  softUpdate: false,
  storeUrl: '',
  triggerForceUpdate: () => {},
  triggerSoftUpdate: () => {},
  dismissSoftUpdate: () => {},
});

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [forceUpdate, setForceUpdate] = useState(false);
  const [softUpdate, setSoftUpdate] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');

  const triggerForceUpdate = useCallback((url: string) => {
    setStoreUrl(url);
    setForceUpdate(true);
  }, []);

  const triggerSoftUpdate = useCallback((url: string) => {
    setStoreUrl(url);
    setSoftUpdate(true);
  }, []);

  const dismissSoftUpdate = useCallback(() => {
    setSoftUpdate(false);
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        forceUpdate,
        softUpdate,
        storeUrl,
        triggerForceUpdate,
        triggerSoftUpdate,
        dismissSoftUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateContextValue {
  return useContext(UpdateContext);
}
