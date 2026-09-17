import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { AuthProvider, useAuth } from './lib/auth';
import { PermissionProvider, usePermissions, type ActionType } from './lib/permissions';
import { basenameFor, currentPortal, isLab, isSuper } from './lib/portal';
import Shell from './components/Shell';
import { ToastProvider } from './components/Toast';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Wallet from './pages/Wallet';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import Transactions from './pages/Transactions';
import Laboratories from './pages/Laboratories';
import LaboratoryCreate from './pages/LaboratoryCreate';
import LaboratoryEdit from './pages/LaboratoryEdit';
import Staff from './pages/Staff';
import Categories from './pages/Categories';
import Attributes from './pages/Attributes';
import AttributeMaster from './pages/AttributeMaster';
import Pricing from './pages/Pricing';
import Roles from './pages/Roles';
import SiteProfile from './pages/SiteProfile';
import RoleEdit from './pages/RoleEdit';
import Attendance from './pages/Attendance';
import Messages from './pages/Messages';
import EmployeeView from './pages/EmployeeView';
import Salary from './pages/Salary';
import Coupons from './pages/Coupons';
import Profile from './pages/Profile';
import Content from './pages/Content';
import NewReport from './pages/NewReport';
import ReportEdit from './pages/ReportEdit';
import NewOrder from './pages/NewOrder';
import Customers from './pages/Customers';
import CustomerOrders from './pages/CustomerOrders';
import RegisteredCustomerForm from './pages/RegisteredCustomerForm';
import Students from './pages/Students';
import StudentCreate from './pages/StudentCreate';
import StudentEdit from './pages/StudentEdit';
import StudentView from './pages/StudentView';
import StudentEnquiries from './pages/StudentEnquiries';
import Courses from './pages/Courses';
import Enquiries from './pages/Enquiries';
import LaboratoryView from './pages/LaboratoryView';
import Master from './pages/Master';
import Settings from './pages/Settings';

/**
 * Administrator-only screens. Other roles are sent back to the dashboard.
 * The API applies the same rule on every request, so this is about not showing
 * someone a screen they cannot use rather than about keeping them out.
 */
/**
 * The transactions screen, for everybody but head office. Its commission
 * approval queue is gone: a pending remittance is decided on its row in the
 * Wallet, so an old link to the queue lands there.
 */
function LabTransactions() {
  const { user } = useAuth();
  if (isSuper(user)) return <Navigate to="/wallet" replace />;
  return <Transactions />;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isSuper(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Head office, or one of its employees who may view at least one of these.
 *
 * Head office's screens that it can hand to its own staff — laboratories,
 * the enquiry books, website setup. The API checks the same permission on
 * every request; this only keeps somebody without it from landing on a page
 * that would load nothing but refusals. Waits for the permissions to load,
 * because redirecting on "not yet known" would throw everybody off the page
 * they reloaded.
 */
function HeadOfficeOr({ actions, children }: { actions: ActionType[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const { staffOf, can, loading } = usePermissions();
  if (isSuper(user)) return <>{children}</>;
  if (loading) return null;
  if (staffOf === 'head_office' && actions.some((a) => can(a, 'view'))) return <>{children}</>;
  return <Navigate to="/" replace />;
}

/**
 * Head office and a laboratory owner, and nobody they employ.
 *
 * Roles are owned: head office's are shared with every laboratory, and a
 * laboratory's own are its alone. Both need the screen — a franchise hires its
 * own front desk and decides what a front desk may do — so both are let in,
 * and the API scopes what each of them sees. Their staff are not: a role is
 * what is done *to* an employee.
 */
function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isSuper(user) && !isLab(user)) return <Navigate to="/" replace />;
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
        {/* The same form, amending. See `NewOrder`. */}
        <Route path="/orders/:id/edit" element={<NewOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        {/* Purchase and sales invoices, one page with two tabs. */}
        <Route path="/invoices" element={<Invoices />} />
        {/* One supplier's own page: what was bought from them, and what has
            been paid. The same screen, opened on a single name. */}
        <Route path="/invoices/supplier/:name" element={<Invoices />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/new" element={<NewReport />} />
        {/* Amending an issued certificate. Its own screen rather than the
            issuing wizard in a second mode: the order and the item are settled
            by then, and only the stone can still change. */}
        <Route path="/reports/:id/edit" element={<ReportEdit />} />
        {/* A laboratory's commission. Head office decides commission on its
            Wallet, so it is sent there rather than to an approval queue. */}
        <Route path="/transactions" element={<LabTransactions />} />
        {/* Both roles have a wallet, and the dashboard's "My wallet" tile sends
            a laboratory here. The endpoint behind it scopes to whoever asks. */}
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/customers" element={<Customers />} />
        {/* One customer's orders and what they came to. Keyed by mobile, which
            is what a customer is here. */}
        {/* A registered customer: the record, and the terms they are given.
            `new` and `:id/edit` sit beside `:mobile` without colliding — the
            router ranks a static segment first, and `:id/edit` is two deep. */}
        <Route path="/customers/new" element={<RegisteredCustomerForm />} />
        <Route path="/customers/:id/edit" element={<RegisteredCustomerForm />} />
        <Route path="/customers/:mobile" element={<CustomerOrders />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/laboratories" element={<Laboratories />} />
        <Route
          path="/laboratories/:id"
          element={
            <HeadOfficeOr actions={['laboratory']}>
              <LaboratoryView />
            </HeadOfficeOr>
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
        {/* What each employee is owed for a month. Scoped by employer, like the
            staff list it reads from. */}
        <Route path="/salary" element={<Salary />} />
        <Route
          path="/student-enquiries"
          element={
            <HeadOfficeOr actions={['website_enquiry']}>
              <StudentEnquiries />
            </HeadOfficeOr>
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
          path="/students/:id"
          element={
            <AdminOnly>
              <StudentView />
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
          path="/enquiries"
          element={
            <HeadOfficeOr actions={['visitor_book']}>
              <Enquiries />
            </HeadOfficeOr>
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
        {/*
          Not AdminOnly. The API sends a laboratory and its staff the holiday
          group and nothing else, and the screen renders what it was sent — so
          the door is open and what is behind it is decided in one place rather
          than two.
        */}
        <Route path="/settings" element={<Settings />} />
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
          path="/attribute-master"
          element={
            <AdminOnly>
              <AttributeMaster />
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
            <HeadOfficeOr actions={['website_home','website_report','website_blog']}>
              <Content />
            </HeadOfficeOr>
          }
        />
        <Route
          path="/roles"
          element={
            <OwnerOnly>
              <Roles />
            </OwnerOnly>
          }
        />
        {/* A website page's own settings: the account's own (head office's, or a
            laboratory's branch page), and head office on a laboratory's. */}
        <Route
          path="/site"
          element={
            <OwnerOnly>
              <SiteProfile />
            </OwnerOnly>
          }
        />
        {/* Head office's own: its social links and its gallery, each a screen. */}
        <Route
          path="/site/social"
          element={
            <AdminOnly>
              <SiteProfile section="social" />
            </AdminOnly>
          }
        />
        <Route
          path="/site/gallery"
          element={
            <AdminOnly>
              <SiteProfile section="gallery" />
            </AdminOnly>
          }
        />
        <Route
          path="/site/:labId"
          element={
            <AdminOnly>
              <SiteProfile />
            </AdminOnly>
          }
        />
        <Route
          path="/roles/:id/edit"
          element={
            <OwnerOnly>
              <RoleEdit />
            </OwnerOnly>
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
