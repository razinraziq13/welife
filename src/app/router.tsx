import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@app/layout/AppLayout';
import { StartScreen } from '@app/screens/StartScreen';
import { SettingsScreen } from '@app/screens/SettingsScreen';
import { NotFoundScreen } from '@app/screens/NotFoundScreen';
import { RouteErrorScreen } from '@app/screens/RouteErrorScreen';

/**
 * Routes are added only when their screen is fully functional (no placeholder screens).
 * The five gameplay tabs (Life, Career, Finance, Social, More) arrive with Milestone 2.
 */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, element: <StartScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
