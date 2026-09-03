import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { AuthProvider, useAuth } from './lib/auth';
import { PermissionProvider } from './lib/permissions';
import { basenameFor, currentPortal, isSuper } from './lib/portal';
import Shell from './components/Shell';
import { ToastProvider } from './components/Toast';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Wallet from './pages/Wallet';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Reports from './pages/Reports';
import Transactions from './pages/Transactions';
import Laboratories from './pages/Laboratories';
import LaboratoryCreate from './pages/LaboratoryCreate';
import LaboratoryEdit from './pages/LaboratoryEdit';
import Staff from './pages/Staff';
import Categories from './pages/Categories';
import Attributes from './pages/Attributes';
import Pricing from './pages/Pricing';
import Roles from './pages/Roles';
import RoleEdit from './pages/RoleEdit';
import Attendance from './pages/Attendance';
import EmployeeView from './pages/EmployeeView';
import Coupons from './pages/Coupons';
import Profile from './pages/Profile';
import Content from './pages/Content';
import NewReport from './pages/NewReport';
import NewOrder from './pages/NewOrder';
import Customers from './pages/Customers';
import Students from './pages/Students';
import StudentCreate from './pages/StudentCreate';
import StudentEdit from './pages/StudentEdit';
import StudentEnquiries from './pages/StudentEnquiries';
import Courses from './pages/Courses';
import StudentCertificates from './pages/StudentCertificates';
import Enquiries from './pages/Enquiries';
import LaboratoryView from './pages/LaboratoryView';
import Master from './pages/Master';
import Settings from './pages/Settings';

/**
 * Administrator-only screens. Other roles are sent back to the dashboard.
 * The API applies the same rule on every request, so this is about not showing
 * someone a screen they cannot use rather than about keeping them out.
 */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isSuper(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Routed() {
  const { user, loading, offline } = useAuth();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={30} />
      </Box>
    );
  }
  /*
    The API did not answer, so we cannot tell whether anybody is signed in.
    Showing the sign-in form here would send somebody to type a password
    against a server that cannot check it — and, when the API comes back after
    a restart, it reads as having been signed out for no reason. Say what has
    actually happened instead, and offer the one thing that helps.
  */
  if (offline) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
          <Typography variant="h2" sx={{ mb: 1 }}>
            The server is not responding
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, fontSize: 14 }}>
            You have not been signed out. The panel could not reach the API, so it
            cannot tell who you are. Check that the API is running, then try again.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Box>
      </Box>
    );
  }

  // Signed out, the panel is three pages: sign in, asking for a reset link, and
  // the page that link opens. All three have to be reachable by someone who
  // cannot sign in, which is the whole point of them.
  if (!user) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <PermissionProvider>
      <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/new" element={<NewReport />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route
          path="/wallet"
          element={
            <AdminOnly>
              <Wallet />
            </AdminOnly>
          }
        />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/laboratories" element={<Laboratories />} />
        <Route
          path="/laboratories/:id"
          element={
            <AdminOnly>
              <LaboratoryView />
            </AdminOnly>
          }
        />
        <Route
          path="/laboratories/create"
          element={
            <AdminOnly>
              <LaboratoryCreate />
            </AdminOnly>
          }
        />
        <Route
          path="/laboratories/:id/edit"
          element={
            <AdminOnly>
              <LaboratoryEdit />
            </AdminOnly>
          }
        />
        <Route path="/staff" element={<Staff />} />
        <Route path="/staff/:id" element={<EmployeeView />} />
        <Route
          path="/student-enquiries"
          element={
            <AdminOnly>
              <StudentEnquiries />
            </AdminOnly>
          }
        />
        <Route
          path="/students"
          element={
            <AdminOnly>
              <Students />
            </AdminOnly>
          }
        />
        <Route
          path="/students/create"
          element={
            <AdminOnly>
              <StudentCreate />
            </AdminOnly>
          }
        />
        <Route
          path="/students/:id/edit"
          element={
            <AdminOnly>
              <StudentEdit />
            </AdminOnly>
          }
        />
        <Route
          path="/courses"
          element={
            <AdminOnly>
              <Courses />
            </AdminOnly>
          }
        />
        <Route
          path="/student-certificates"
          element={
            <AdminOnly>
              <StudentCertificates />
            </AdminOnly>
          }
        />
        <Route
          path="/enquiries"
          element={
            <AdminOnly>
              <Enquiries />
            </AdminOnly>
          }
        />
        {/*
          A page per list. `/master` alone lands on the first one rather than
          on an empty shell — the menu links to the five directly, but a typed
          or bookmarked bare path should still arrive somewhere.
        */}
        <Route path="/master" element={<Navigate to="/master/gst" replace />} />
        <Route
          path="/master/:list"
          element={
            <AdminOnly>
              <Master />
            </AdminOnly>
          }
        />
        <Route
          path="/settings"
          element={
            <AdminOnly>
              <Settings />
            </AdminOnly>
          }
        />
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
          path="/coupons"
          element={
            <AdminOnly>
              <Coupons />
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
        <Route
          path="/content"
          element={
            <AdminOnly>
              <Content />
            </AdminOnly>
          }
        />
        <Route
          path="/roles"
          element={
            <AdminOnly>
              <Roles />
            </AdminOnly>
          }
        />
        <Route
          path="/roles/:id/edit"
          element={
            <AdminOnly>
              <RoleEdit />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Routes>
    </PermissionProvider>
  );
}

export default function App() {
  // /super and /team are entry points rather than pages, so the router treats
  // the prefix as a basename and every route below it stays the same.
  const basename = basenameFor(currentPortal());

  return (
    <BrowserRouter basename={basename || undefined}>
      <AuthProvider>
        <ToastProvider>
          <Routed />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
