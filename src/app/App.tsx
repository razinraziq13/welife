import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from '@app/router';
import { ServiceWorkerManager } from '@app/pwa/ServiceWorkerManager';
import { useAppStore } from '@app/stores/appStore';
import { useAppearance } from '@app/theme/useAppearance';

export function App() {
  const settings = useAppStore((s) => s.settings);
  const connect = useAppStore((s) => s.connect);

  useAppearance(settings);

  useEffect(() => {
    void connect();
  }, [connect]);

  return (
    <>
      <RouterProvider router={router} />
      <ServiceWorkerManager />
    </>
  );
}
