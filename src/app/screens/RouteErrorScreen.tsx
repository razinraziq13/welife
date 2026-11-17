import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@app/components/ui/button';
import { useDocumentTitle } from '@app/hooks/useDocumentTitle';

/** Shown when a screen crashes. Saved data is unaffected; reloading restarts the UI. */
export function RouteErrorScreen() {
  const error = useRouteError();
  useDocumentTitle('Something went wrong');
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-bold text-fg">Something went wrong</h1>
      <p className="text-muted">
        This screen hit an unexpected error. Your saved data on this device has not been changed.
      </p>
      <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-sm text-fg">{detail}</pre>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            window.location.assign('/');
          }}
        >
          Go to Home
        </Button>
      </div>
    </main>
  );
}
