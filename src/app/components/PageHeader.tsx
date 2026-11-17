import type { ReactNode } from 'react';
import { PAGE_TITLE_ID } from '@app/layout/constants';
import { useDocumentTitle } from '@app/hooks/useDocumentTitle';

interface PageHeaderProps {
  title: string;
  /** Tab title; defaults to `title`. Pass null for the bare app name. */
  documentTitle?: string | null;
  description?: ReactNode;
}

/** Page <h1>; receives focus after client-side navigation (see AppLayout). */
export function PageHeader({ title, documentTitle, description }: PageHeaderProps) {
  useDocumentTitle(documentTitle === undefined ? title : documentTitle);
  return (
    <div className="mb-6">
      <h1
        id={PAGE_TITLE_ID}
        tabIndex={-1}
        className="text-3xl font-bold tracking-tight text-fg outline-none"
      >
        {title}
      </h1>
      {description !== undefined && <p className="mt-2 text-muted">{description}</p>}
    </div>
  );
}
