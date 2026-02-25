import { useEffect } from 'react';

const APP = 'SoulStep';

export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} | ${APP}` : APP;
    return () => {
      document.title = APP;
    };
  }, [title]);
}
