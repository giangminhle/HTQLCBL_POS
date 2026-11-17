import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AuthSession } from '@retailchain/shared';
import { AuthProvider, useAutoRefresh, useOnline, useSession } from './auth';
import { posSessionStatus } from './lib/pos-session';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

/** Routes by session status: an expired token never blocks selling (ADR-001, REQ-POS-05). */
function RequireSession({ children }: { children: ReactNode }) {
  const status = posSessionStatus(useSession(), useOnline());
  if (status === 'none') return <Navigate to="/login" replace />;
  if (status === 'change-password') return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

function AutoRefresh() {
  useAutoRefresh();
  return null;
}

export function PosRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route
          path="/"
          element={
            <RequireSession>
              <HomePage />
            </RequireSession>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}

export function App({ auth }: { auth: AuthSession }) {
  return (
    <AuthProvider auth={auth}>
      <AutoRefresh />
      <BrowserRouter>
        <PosRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
