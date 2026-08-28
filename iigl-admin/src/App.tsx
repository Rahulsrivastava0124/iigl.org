import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { AuthProvider, useAuth } from './lib/auth';
import { basenameFor, currentPortal } from './lib/portal';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Reports from './pages/Reports';
import Transactions from './pages/Transactions';
import Laboratories from './pages/Laboratories';
import Staff from './pages/Staff';
import Categories from './pages/Categories';
import Attributes from './pages/Attributes';
import Pricing from './pages/Pricing';

/**
 * Administrator-only screens. Other roles are sent back to the dashboard.
 * The API applies the same rule on every request, so this is about not showing
 * someone a screen they cannot use rather than about keeping them out.
 */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.roleId !== 1) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Routed() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={30} />
      </Box>
    );
  }
  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/laboratories" element={<Laboratories />} />
        <Route path="/staff" element={<Staff />} />
        <Route
          path="/categories"
          element={
            <AdminOnly>
              <Categories />
            </AdminOnly>
          }
        />
        <Route
          path="/attributes"
          element={
            <AdminOnly>
              <Attributes />
            </AdminOnly>
          }
        />
        <Route
          path="/pricing"
          element={
            <AdminOnly>
              <Pricing />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  // /super and /team are entry points rather than pages, so the router treats
  // the prefix as a basename and every route below it stays the same.
  const basename = basenameFor(currentPortal());

  return (
    <BrowserRouter basename={basename || undefined}>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </BrowserRouter>
  );
}
