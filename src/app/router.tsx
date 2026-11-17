import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@app/layout/AppLayout';
import { StartScreen } from '@app/screens/StartScreen';
import { NewLifeScreen } from '@app/screens/NewLifeScreen';
import { SettingsScreen } from '@app/screens/SettingsScreen';
import { NotFoundScreen } from '@app/screens/NotFoundScreen';
import { RouteErrorScreen } from '@app/screens/RouteErrorScreen';
import { PlayLayout } from '@app/play/PlayLayout';
import { LifeTab } from '@app/play/tabs/LifeTab';
import { CareerTab, FinanceTab, MoreTab, SocialTab } from '@app/play/tabs/OtherTabs';
import { CharacterScreen } from '@app/play/screens/CharacterScreen';
import { TimelineScreen } from '@app/play/screens/TimelineScreen';
import { NotificationsScreen } from '@app/play/screens/NotificationsScreen';
import { RulesScreen } from '@app/play/screens/RulesScreen';

/** Routes are added only when their screen is fully functional (no placeholder screens). */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, element: <StartScreen /> },
      { path: 'new', element: <NewLifeScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      {
        path: 'play/:saveId',
        element: <PlayLayout />,
        children: [
          { index: true, element: <Navigate to="life" replace /> },
          { path: 'life', element: <LifeTab /> },
          { path: 'career', element: <CareerTab /> },
          { path: 'finance', element: <FinanceTab /> },
          { path: 'social', element: <SocialTab /> },
          { path: 'more', element: <MoreTab /> },
          { path: 'character', element: <CharacterScreen /> },
          { path: 'timeline', element: <TimelineScreen /> },
          { path: 'notifications', element: <NotificationsScreen /> },
          { path: 'rules', element: <RulesScreen /> },
        ],
      },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
