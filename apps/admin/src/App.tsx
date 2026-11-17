import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AuthSession } from '@retailchain/shared';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { rolesFor } from './menu';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BalancesPage } from './pages/BalancesPage';
import { BranchesPage } from './pages/BranchesPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { GoodsReceiptsPage } from './pages/GoodsReceiptsPage';
import { HelloPage } from './pages/HelloPage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { PriceListsPage } from './pages/PriceListsPage';
import { ProductsPage } from './pages/ProductsPage';
import { StockCountsPage } from './pages/StockCountsPage';
import { StockTransfersPage } from './pages/StockTransfersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { UsersPage } from './pages/UsersPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App({ auth }: { auth: AuthSession }) {
  return (
    <AuthProvider auth={auth}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<HelloPage api={auth.api} appName="Trang quản trị RetailChain" />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
              <Route
                path="branches"
                element={
                  <RequireAuth roles={rolesFor('/branches')}>
                    <BranchesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="categories"
                element={
                  <RequireAuth roles={rolesFor('/categories')}>
                    <CategoriesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="products"
                element={
                  <RequireAuth roles={rolesFor('/products')}>
                    <ProductsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="products/import"
                element={
                  <RequireAuth roles={rolesFor('/products/import')}>
                    <ImportPage />
                  </RequireAuth>
                }
              />
              <Route
                path="price-lists"
                element={
                  <RequireAuth roles={rolesFor('/price-lists')}>
                    <PriceListsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="inventory/balances"
                element={
                  <RequireAuth roles={rolesFor('/inventory/balances')}>
                    <BalancesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="inventory/receipts"
                element={
                  <RequireAuth roles={rolesFor('/inventory/receipts')}>
                    <GoodsReceiptsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="inventory/transfers"
                element={
                  <RequireAuth roles={rolesFor('/inventory/transfers')}>
                    <StockTransfersPage />
                  </RequireAuth>
                }
              />
              <Route
                path="inventory/counts"
                element={
                  <RequireAuth roles={rolesFor('/inventory/counts')}>
                    <StockCountsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="suppliers"
                element={
                  <RequireAuth roles={rolesFor('/suppliers')}>
                    <SuppliersPage />
                  </RequireAuth>
                }
              />
              <Route
                path="users"
                element={
                  <RequireAuth roles={rolesFor('/users')}>
                    <UsersPage />
                  </RequireAuth>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <RequireAuth roles={rolesFor('/audit-logs')}>
                    <AuditLogsPage />
                  </RequireAuth>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}
