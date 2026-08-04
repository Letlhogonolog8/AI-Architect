import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { createQueryClient } from './query-client';
import { AppRouter } from './router';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Application root.
 *
 * The QueryClient is created in state rather than at module scope so that it is
 * one instance per app mount — a module-level client is shared across React 19
 * Strict Mode's double mount and across tests, which leaks cache between them.
 */
export function App() {
  const [queryClient] = useState(createQueryClient);
  const initialise = useAuthStore((state) => state.initialise);

  useEffect(() => {
    // Revalidates the persisted session against the API before the router
    // decides whether to show the login screen.
    void initialise();
  }, [initialise]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>

        <Toaster
          theme="dark"
          position="bottom-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: 'glass-strong rounded-card text-ink-primary',
              description: 'text-ink-tertiary',
            },
          }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
