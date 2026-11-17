import { useEffect } from 'react';

/** Sets the browser tab title, e.g. "Settings · WeLife". */
export function useDocumentTitle(pageTitle: string | null): void {
  useEffect(() => {
    document.title = pageTitle === null ? 'WeLife' : `${pageTitle} · WeLife`;
  }, [pageTitle]);
}
