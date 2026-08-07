import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import '@patternfly/react-core/dist/styles/base.css'
import './styles/brand-tokens.css'
import { GlobalErrorBridge } from './app/GlobalErrorBridge'
import { ApiError } from './api/transport'
import { AuthProvider } from './auth/AuthProvider'
import { I18nProvider } from './i18n/I18nProvider'
import { NotificationProvider } from './notifications/NotificationProvider'
import { router } from './routes/router'
// SettingsProvider owns refresh-interval and console preferences
// (localStorage 'console-settings'); the poll hooks read the interval from it.
import { SettingsProvider } from './settings/SettingsProvider'
// ThemeProvider owns the pf-v6-theme-dark class on <html> (dark by default,
// per docs/COMPONENTS.md ground rule 2) — nothing here touches it.
import { ThemeProvider } from './theme/ThemeProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failureCount, error) => {
        // Never retry a 4xx (401/403 included): a client error — auth,
        // forbidden, bad request — won't heal by retrying, so surface it
        // immediately. Other failures (5xx, network) get a single retry;
        // piling on attempts only amplifies load while the engine is already
        // in distress, and polled queries get their real retry on the next tick.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false
        }
        return failureCount < 1
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        {/* I18nProvider sits below SettingsProvider (reads the locale setting)
            and above the router so every page can call useIntl. */}
        <I18nProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <NotificationProvider>
                <GlobalErrorBridge />
                <RouterProvider router={router} />
              </NotificationProvider>
            </AuthProvider>
          </QueryClientProvider>
        </I18nProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
)
