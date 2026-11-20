import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@app/layout/AppLayout';
import { StartScreen } from '@app/screens/StartScreen';
import { NotFoundScreen } from '@app/screens/NotFoundScreen';
import { RouteErrorScreen } from '@app/screens/RouteErrorScreen';
import { PlayLayout } from '@app/play/PlayLayout';
import { LifeTab } from '@app/play/tabs/LifeTab';

/**
 * Screens other than the start screen and the Life tab load on demand (smaller first download;
 * the service worker still precaches every chunk for offline play).
 *
 * Routes are added only when their screen is fully functional (no placeholder screens).
 */
export const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      errorElement: <RouteErrorScreen />,
      children: [
        { index: true, element: <StartScreen /> },
        {
          path: 'new',
          lazy: () =>
            import('@app/screens/NewLifeScreen').then((m) => ({ Component: m.NewLifeScreen })),
        },
        {
          path: 'settings',
          lazy: () =>
            import('@app/screens/SettingsScreen').then((m) => ({ Component: m.SettingsScreen })),
        },
        {
          path: 'editor',
          lazy: () =>
            import('@app/screens/EditorScreen').then((m) => ({ Component: m.EditorScreen })),
        },
        {
          path: 'gallery',
          lazy: () =>
            import('@app/screens/GalleryScreen').then((m) => ({ Component: m.GalleryScreen })),
        },
        {
          path: 'play/:saveId',
          element: <PlayLayout />,
          children: [
            { index: true, element: <Navigate to="life" replace /> },
            { path: 'life', element: <LifeTab /> },
            {
              path: 'activities',
              lazy: () =>
                import('@app/play/screens/ActivitiesHubScreen').then((m) => ({
                  Component: m.ActivitiesHubScreen,
                })),
            },
            {
              path: 'career',
              lazy: () =>
                import('@app/play/tabs/CareerTab').then((m) => ({ Component: m.CareerTab })),
            },
            {
              path: 'finance',
              lazy: () =>
                import('@app/play/tabs/FinanceTab').then((m) => ({ Component: m.FinanceTab })),
            },
            {
              path: 'finance/investments/:category?/:asset?',
              lazy: () =>
                import('@app/play/screens/InvestmentsScreen').then((m) => ({
                  Component: m.InvestmentsScreen,
                })),
            },
            {
              path: 'social',
              lazy: () =>
                import('@app/play/tabs/SocialTab').then((m) => ({ Component: m.SocialTab })),
            },
            {
              path: 'shopping',
              lazy: () =>
                import('@app/play/tabs/ShoppingTab').then((m) => ({ Component: m.ShoppingTab })),
            },
            {
              path: 'more',
              lazy: () => import('@app/play/tabs/MoreTab').then((m) => ({ Component: m.MoreTab })),
            },
            {
              path: 'character',
              lazy: () =>
                import('@app/play/screens/CharacterScreen').then((m) => ({
                  Component: m.CharacterScreen,
                })),
            },
            {
              path: 'timeline',
              lazy: () =>
                import('@app/play/screens/TimelineScreen').then((m) => ({
                  Component: m.TimelineScreen,
                })),
            },
            {
              path: 'notifications',
              lazy: () =>
                import('@app/play/screens/NotificationsScreen').then((m) => ({
                  Component: m.NotificationsScreen,
                })),
            },
            {
              path: 'rules',
              lazy: () =>
                import('@app/play/screens/RulesScreen').then((m) => ({ Component: m.RulesScreen })),
            },
            {
              path: 'people/:personId',
              lazy: () =>
                import('@app/play/screens/PersonScreen').then((m) => ({
                  Component: m.PersonScreen,
                })),
            },
            {
              path: 'family',
              lazy: () =>
                import('@app/play/screens/FamilyTreeScreen').then((m) => ({
                  Component: m.FamilyTreeScreen,
                })),
            },
            {
              path: 'calendar',
              lazy: () =>
                import('@app/play/screens/CalendarScreen').then((m) => ({
                  Component: m.CalendarScreen,
                })),
            },
            {
              path: 'business',
              lazy: () =>
                import('@app/play/screens/BusinessScreen').then((m) => ({
                  Component: m.BusinessScreen,
                })),
            },
            {
              path: 'business/:businessId',
              lazy: () =>
                import('@app/play/screens/BusinessScreen').then((m) => ({
                  Component: m.BusinessDetailScreen,
                })),
            },
            {
              path: 'property',
              lazy: () =>
                import('@app/play/screens/PropertyScreen').then((m) => ({
                  Component: m.PropertyScreen,
                })),
            },
            {
              path: 'world',
              lazy: () =>
                import('./play/screens/CivicScreens').then((m) => ({ Component: m.WorldScreen })),
            },
            {
              path: 'legacy',
              lazy: () =>
                import('@app/play/screens/LegacyScreen').then((m) => ({
                  Component: m.LegacyScreen,
                })),
            },
            {
              path: 'media',
              lazy: () =>
                import('@app/play/screens/MediaScreen').then((m) => ({ Component: m.MediaScreen })),
            },
            {
              path: 'achievements',
              lazy: () =>
                import('@app/play/screens/AchievementsScreen').then((m) => ({
                  Component: m.AchievementsScreen,
                })),
            },
            {
              path: 'biography/:personId',
              lazy: () =>
                import('@app/play/screens/AchievementsScreen').then((m) => ({
                  Component: m.BiographyScreen,
                })),
            },
            {
              path: 'health',
              lazy: () =>
                import('./play/screens/CivicScreens').then((m) => ({ Component: m.HealthScreen })),
            },
            {
              path: 'legal',
              lazy: () =>
                import('./play/screens/CivicScreens').then((m) => ({ Component: m.LegalScreen })),
            },
            {
              path: 'religion',
              lazy: () =>
                import('./play/screens/CivicScreens').then((m) => ({
                  Component: m.ReligionScreen,
                })),
            },
            {
              path: 'military',
              lazy: () =>
                import('./play/screens/CivicScreens').then((m) => ({
                  Component: m.MilitaryScreen,
                })),
            },
            {
              path: 'politics',
              lazy: () =>
                import('./play/screens/CivicScreens').then((m) => ({
                  Component: m.PoliticsScreen,
                })),
            },
          ],
        },
        { path: '*', element: <NotFoundScreen /> },
      ],
    },
  ],
  // The app may be served below a path (GitHub Pages: /welife/).
  { basename: import.meta.env.BASE_URL },
);
