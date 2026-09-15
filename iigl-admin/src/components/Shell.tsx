import { useState } from 'react';
import { Link as RouterLink, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import ExpandIcon from '@mui/icons-material/ExpandMoreOutlined';
import NextIcon from '@mui/icons-material/NavigateNextOutlined';
import HomeIcon from '@mui/icons-material/HomeOutlined';
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import OrdersIcon from '@mui/icons-material/ReceiptLongOutlined';
import CertificatesIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import TransactionsIcon from '@mui/icons-material/PaymentsOutlined';
import LabsIcon from '@mui/icons-material/ScienceOutlined';
import StaffIcon from '@mui/icons-material/BadgeOutlined';
import ProfileIcon from '@mui/icons-material/PersonOutlineOutlined';
import CustomerIcon from '@mui/icons-material/GroupsOutlined';
import CategoriesIcon from '@mui/icons-material/CategoryOutlined';
import MasterIcon from '@mui/icons-material/ListAltOutlined';
import PricingIcon from '@mui/icons-material/SellOutlined';
import ContentIcon from '@mui/icons-material/ArticleOutlined';
import StudentIcon from '@mui/icons-material/SchoolOutlined';
import EnquiryIcon from '@mui/icons-material/SupportAgentOutlined';
import AttendanceIcon from '@mui/icons-material/CalendarMonthOutlined';
import MessagesIcon from '@mui/icons-material/ForumOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { alpha } from '@mui/material/styles';
import { BRAND, TONE } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { CrumbSlotContext } from '../lib/crumbActions';
import { ROLE, ROLE_NAMES } from '../lib/portal';
import { api } from '../lib/api';
import { useFetch, useLiveRefresh } from '../lib/useFetch';
import { fileUrl } from '../lib/config';
import { useBreadcrumbs } from '../lib/breadcrumbs';
import { StatementReminder } from './Statements';
import NotificationBell from './NotificationBell';
import PunchClock from './PunchClock';
import { usePermissions, type ActionType } from '../lib/permissions';

const WIDTH = 276;
const RAIL = 76;

/**
 * One height for both headers.
 *
 * The logo block and the topbar are two separate toolbars either side of the
 * drawer's edge, and they read as one bar only while they are exactly the same
 * height. The topbar holds a search field, so its content, not a minimum, was
 * deciding the height and the two drifted apart.
 */
const HEADER_H = 68;

/** The menu corner: 8px, the same small corner the panels use. */
const RADIUS = 1;

interface Item {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
  /** Only for a laboratory; its employees do not see it. */
  labOnly?: boolean;
  /** Only for an employee; a laboratory sees it in its own group. */
  staffOnly?: boolean;
  /** A permission the matrix has to grant before the entry is shown. */
  needs?: 'order-create' | 'report-create';
  /**
   * The permission whose View opens this screen. An employee sees the entry
   * only when granted it; head office and laboratories always pass. On head
   * office's menu it is also what lets head office's own staff see an entry at
   * all — an entry without one stays Super Admin's.
   */
  perm?: ActionType;
  /** Carries the count of unread messages beside it. */
  badge?: 'messages';
}

/**
 * A menu entry.
 *
 * The icon belongs to the group, not to its children: a group is one subject —
 * Report Master, Account — and repeating an icon down its list only crowds the
 * text. A group with a single item is a plain link and carries no chevron; a
 * chevron that opens nothing is a lie about there being more.
 */
interface Group {
  label: string;
  icon: typeof DashboardIcon;
  items: Item[];
  adminOnly?: boolean;
  labOnly?: boolean;
}

/*
 * There is no Orders group on this menu, deliberately.
 *
 * An order is taken at a counter, and head office has no counter: it cannot
 * collect one, and the queue of orders in progress is a laboratory's work to
 * run, not the business's to watch. So the order queue is a laboratory menu
 * (`FIELD_GROUPS`) and is left off this one.
 *
 * It is **not** a permission change. Head office may still read every
 * laboratory's orders — `GET /api/orders` is unscoped for role 1, and the row
 * in the repo's docs/ROLES.md still holds — and `/orders` is still a route: the certificate and
 * customer search in the header lands on it, and a dashboard tile or a link
 * opens it. What changed is that the sidebar no longer offers it as somewhere
 * to go.
 */

/**
 * The administrator menu.
 *
 * Grouped as the reference sidebar groups it, with two departures:
 *
 *   - **the list comes first, and creating happens on it.** The reference has
 *     "Create Standard Price" above "Standard Price List". A person opening a
 *     menu is almost always going to look at something, and every list here
 *     carries its own Add button, so a separate Create entry is a second door
 *     to the same room;
 *   - **nothing is listed that has nothing behind it.** Student and Enquiry
 *     were in that position until they were built: the Laravel sidebar carried
 *     both menus with every entry an `href="#"`, over no table and no
 *     controller. They are listed now because migrations/003 gave them one
 *     each, and the entries below open real screens.
 *
 * Sub-items deep-link into a screen's section rather than duplicating it, so
 * "Category" and "Sub Category" are one screen opened at different tabs.
 */
const ADMIN_GROUPS: Group[] = [
  { label: 'Dashboard', icon: DashboardIcon, items: [{ to: '/', label: 'Dashboard', end: true }] },
  {
    // Straight after the Dashboard: the money is what head office checks first.
    label: 'Account',
    icon: TransactionsIcon,
    items: [
      { to: '/wallet', label: 'Wallet' },
      // What head office does with commission is decide it, which is this
      // queue. There is no Transaction History beside it: head office's own
      // movements are the Wallet — the same rows, with the balance they
      // produced — and a franchise's are its own, read per laboratory on the
      // laboratory's page. A history that showed either was one screen too
      // many or somebody else's money.
      { to: '/transactions?status=0', label: 'Commission Approval' },
    ],
  },
  {
    label: 'Laboratory',
    icon: LabsIcon,
    items: [{ to: '/laboratories', label: 'View Franchise', perm: 'laboratory' }],
  },
  {
    label: 'Report Master',
    icon: CategoriesIcon,
    adminOnly: true,
    items: [
      { to: '/categories', label: 'Categories' },
      { to: '/categories?tab=sub', label: 'Sub Categories' },
      { to: '/attributes', label: 'Attributes' },
      { to: '/attributes?tab=values', label: 'Attribute Values' },
    ],
  },
  {
    label: 'Price Setup',
    icon: PricingIcon,
    adminOnly: true,
    items: [
      { to: '/pricing', label: 'Standard Prices' },
      { to: '/pricing?scope=laboratory', label: 'Laboratory Prices' },
    ],
  },
  {
    label: 'Employee Management',
    icon: StaffIcon,
    items: [
      { to: '/staff', label: 'Employee List' },
      { to: '/salary', label: 'Salary' },
      // Roles sit with the people who hold them. They had a group of their own
      // — "Admin Employee", one entry, the same icon — which read as a second
      // employee menu rather than as part of this one.
      { to: '/roles', label: 'Roles & Permissions', adminOnly: true },
    ],
  },
  {
    // Head office's conversations with its laboratories and with staff, on a
    // page of their own rather than beside an attendance calendar.
    label: 'Messages',
    icon: MessagesIcon,
    items: [{ to: '/messages', label: 'Messages', end: true, badge: 'messages' }],
  },
  {
    label: 'Customer',
    icon: CustomerIcon,
    items: [
      { to: '/customers?tab=all', label: 'All Customers', adminOnly: true, perm: 'customer' },
      { to: '/customers', label: 'Registered', perm: 'customer' },
      { to: '/customers?tab=unregistered', label: 'Not Registered', perm: 'customer' },
    ],
  },
  {
    // The pipeline, in the order a student passes through it:
    // enquiry -> registration -> course -> certificate, with the discount
    // sitting on the course fee rather than being a stage of its own.
    label: 'Student',
    icon: StudentIcon,
    adminOnly: true,
    // In the order a student passes through them: they ask, they register,
    // they are enrolled, and the course, the certificate and the money off it
    // follow. The list is read top to bottom by people learning the panel, so
    // it should be the sequence rather than the order the screens were built.
    items: [
      { to: '/student-enquiries', label: 'Enquiry', perm: 'website_enquiry' },
      { to: '/students', label: 'Registration' },
      { to: '/courses?tab=enrolments', label: 'Enrolments' },
      { to: '/courses', label: 'Course' },
      { to: '/student-certificates', label: 'Certificates' },
      // A coupon is money off a course fee. The reduction itself is applied on
      // the enrolment, under Student › Enrolments, which is where the fee is —
      // there is no separate Discount screen any more.
      { to: '/coupons', label: 'Discount Coupons' },
    ],
  },
  {
    label: 'Enquiry',
    icon: EnquiryIcon,
    adminOnly: true,
    items: [
      { to: '/enquiries?kind=ask', label: 'Ask Me', perm: 'visitor_book' },
      { to: '/enquiries?kind=visit', label: "Visitor's Diary", perm: 'visitor_book' },
      { to: '/enquiries?kind=lead', label: 'Contact Us', perm: 'visitor_book' },
      { to: '/enquiries?kind=complaint', label: 'Complaints', perm: 'visitor_book' },
    ],
  },
  {
    // The short lists every form reads, a page each. Down here with Settings
    // rather than up among the daily work: these are opened when something
    // needs adding to a list, which is a few times a month.
    label: 'Master',
    icon: MasterIcon,
    adminOnly: true,
    items: [
      // The value lists the Add Value form is filled from. A master list rather
      // than a screen of daily work, which is what this group is for.
      { to: '/attribute-master', label: 'Attributes Master' },
      { to: '/master/gst', label: 'GST' },
      { to: '/master/enquiry-types', label: 'Enquiry Type' },
      { to: '/master/countries', label: 'Country' },
      { to: '/master/states', label: 'State' },
      { to: '/master/districts', label: 'District' },
    ],
  },
  {
    label: 'Website Setup',
    icon: ContentIcon,
    adminOnly: true,
    // In the order the website shows them, top of the home page down: the
    // banner, the report categories, the branches, then the blog and the
    // standalone pages linked from the footer.
    items: [
      { to: '/content?tab=banners', label: 'Banners', perm: 'website_home' },
      { to: '/content?tab=types', label: 'Report Types', perm: 'website_report' },
      { to: '/content?tab=customers', label: 'Customers', perm: 'website_home' },
      { to: '/content?tab=branches', label: 'Branches', perm: 'website_home' },
      { to: '/content?tab=reviews', label: 'Reviews', perm: 'website_home' },
      { to: '/content?tab=certificates', label: 'Certificates', perm: 'website_home' },
      // The Education page's.
      { to: '/content?tab=gallery', label: 'Course Gallery', perm: 'website_home' },
      { to: '/content?tab=testimonials', label: 'Testimonials', perm: 'website_home' },
      { to: '/content?tab=articles', label: 'Blog', perm: 'website_blog' },
      // Head office's own: the footer's social links, and its picture gallery.
      { to: '/site/social', label: 'Social Media' },
      { to: '/site/gallery', label: 'Gallery' },
    ],
  },
  {
    // Last, and on its own: settings are opened rarely and on purpose, and
    // what they change — billing, numbering, who mail comes from — is not
    // something to sit a mis-click away from the daily work.
    label: 'Settings',
    icon: SettingsIcon,
    adminOnly: true,
    items: [
      { to: '/settings', label: 'Company', end: true },
      { to: '/settings?tab=holidays', label: 'Holidays' },
      { to: '/settings?tab=session', label: 'Session & Mail' },
    ],
  },
];


/**
 * The laboratory menu, shared by a laboratory and its employees.
 *
 * This is the counter, not the head office: it is the work of one laboratory —
 * take an order, issue the certificates, settle the account — and every list is
 * already scoped to that laboratory by the API.
 *
 * Departures from the old employee sidebar, for the same reasons the
 * administrator menu departs from its reference:
 *
 *   - **Collect New is not in this menu.** It is the yellow button in the bar,
 *     which is on every screen rather than three clicks inside one group — a
 *     person opening Orders is usually looking for an order, not starting one,
 *     and the same grant governs both so there was never a case where the menu
 *     said one thing and the bar another;
 *   - **Message is not here.** Both its entries, Send Message and Message
 *     History, are `href="#"` in the old application — the feature was never
 *     built, and listing it would promise a screen that has never existed;
 *   - **there is no separate Ledger entry.** Wallet is the running account —
 *     the same balance over the same movements, read from the same
 *     `/transactions/ledger` — so a Ledger beside it was one screen under two
 *     names.
 *
 * `Report New` in the old sidebar sits under Customer and opens the certificate
 * list split by card type. It is the certificate list, so that is where it is.
 */
const FIELD_GROUPS: Group[] = [
  { label: 'Dashboard', icon: DashboardIcon, items: [{ to: '/', label: 'Dashboard', end: true }] },
  {
    label: 'Orders',
    icon: OrdersIcon,
    items: [
      { to: '/orders?status=preparing', label: 'In Progress' },
      { to: '/orders?status=delivered', label: 'Delivered' },
      { to: '/orders?dues=1', label: 'Dues Order' },
    ],
  },
  {
    label: 'Report',
    icon: CertificatesIcon,
    // No "Issue a Certificate" entry. A certificate belongs to an order item —
    // the wizard's first two steps are choosing them — so it is written from
    // the order that is waiting for it, where the arrow on the row goes. A menu
    // entry started the same job with nothing chosen.
    items: [{ to: '/reports', label: 'All Reports List', perm: 'report' }],
  },
  {
    label: 'Customer',
    icon: CustomerIcon,
    items: [
      { to: '/customers', label: 'Registered', perm: 'customer' },
      { to: '/customers?tab=unregistered', label: 'Non-Registered', perm: 'customer' },
    ],
  },
  {
    label: 'Account',
    icon: TransactionsIcon,
    items: [
      // No Transfer History. What it was opened for was the Approve and
      // Decline on money sent to this account, and that is a tab on Wallet
      // now, beside the account it moves. The screen itself still exists for
      // the links that open it filtered, such as Commission History below.
      { to: '/wallet', label: 'Wallet' },
      // What this laboratory has remitted to head office, and where each
      // remittance stands. It is the same screen as the transfer history with
      // the commission rows kept, because "have they taken my payment yet" is
      // the question a franchise opens this menu to answer.
      { to: '/transactions?type=commision', label: 'Commission History', labOnly: true },
    ],
  },
  {
    /*
      Their own working day: the month they punched.

      Staff only. A laboratory has no working day to punch — it is the employer,
      not an employee — and what it actually needs is one of its people's
      attendance, which is on that person's page, with the calendar it can
      correct. A screen called Attendance in the employer's own menu offered it
      its own empty month.

      No grant. It was behind `attendance.view`, and a laboratory's new role
      starts with no grants at all — so its holder could punch in from the bar,
      where the clock asks nobody, and then had nowhere to read back what they
      had punched. A person who may clock in may see their own month; that is
      one fact, not two decisions. Somebody *else's* month is a different
      screen, guarded by `assertEmploys` at the API.
    */
    label: 'Attendance',
    icon: AttendanceIcon,
    items: [
      // Staff chat with their employer on this page, so the unread count sits here.
      { to: '/attendance', label: 'Attendance', end: true, staffOnly: true, badge: 'messages' },
    ],
  },
  {
    // The laboratory's messages, with head office and with its staff. Its staff
    // have no page of their own: their chat is on Attendance, beside the month.
    label: 'Messages',
    icon: MessagesIcon,
    labOnly: true,
    items: [{ to: '/messages', label: 'Messages', end: true, badge: 'messages' }],
  },
  {
    label: 'Employee',
    icon: StaffIcon,
    labOnly: true,
    items: [
      { to: '/staff', label: 'Employee List' },
      { to: '/salary', label: 'Salary' },
      // A franchise decides what its own front desk may do. The roles it makes
      // are its own — no other laboratory sees them — and head office's shared
      // roles show here read-only. Its staff do not see this: `labOnly` is the
      // laboratory account itself, and a role is something done to an employee
      // rather than by one.
      { to: '/roles', label: 'Roles & Permissions' },
    ],
  },
  {
    // The one setting that is not head office's alone. A laboratory reads the
    // holiday calendar rather than writing it — the screen says so, and the
    // API sends it nothing else.
    label: 'Settings',
    icon: SettingsIcon,
    items: [
      { to: '/settings?tab=holidays', label: 'Holidays' },
      // The laboratory's own page on the website — banner, content, gallery and
      // social links. The laboratory account only; its staff do not edit it.
      { to: '/site', label: 'Website', end: true, labOnly: true },
    ],
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export default function Shell() {
  const { user, signOut, portal } = useAuth();
  const { can, staffOf } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(true);
  // The group holding the current page starts open; the rest start closed, so
  // the menu opens at a readable length rather than a wall of entries.
  /**
   * One group open at a time.
   *
   * The menu is nine groups deep; with several open at once the entry you came
   * for scrolls off the bottom. `null` means "none chosen yet", which is not
   * the same as "all closed" — until someone picks a group, the one holding the
   * current page is the open one.
   */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | HTMLElement>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Head office runs the business; a laboratory (role 2) is its own admin and
  // runs a counter. The menu follows that split, not a rank.
  const isSuper = user?.roleId === ROLE.SUPER;
  const isLab = user?.roleId === ROLE.ADMIN;
  /*
    Everybody else: a laboratory's staff, whatever role it made for them.
    Defined by exclusion because the roles below a laboratory are not a fixed
    list — a franchise invents its own, and `role_id` may be NULL.
  */
  const isStaff = Boolean(user) && !isSuper && !isLab;

  /**
   * An administrator runs the business; a laboratory and its employees run the
   * counter. They are different jobs, so they get different menus rather than
   * one menu with most of it hidden.
   */
  /*
    Head office's own employees work head office's screens, not a counter: they
    get head office's menu, cut down to the entries they have been granted, and
    their own Attendance page, where they punch and write to head office.
  */
  const headOfficeStaff = staffOf === 'head_office';
  const groups = isSuper
    ? ADMIN_GROUPS
    : headOfficeStaff
      ? [...ADMIN_GROUPS, ...FIELD_GROUPS.filter((g) => g.label === 'Attendance')]
      : FIELD_GROUPS;

  /**
   * Whether an entry is on this person's menu.
   *
   * Head office's staff: only entries a permission opens, when granted — plus
   * the dashboard and their own attendance. Everybody else: the role rules,
   * then the permission where the entry names one (head office and laboratories
   * always hold it).
   */
  const shows = (item: Item) =>
    headOfficeStaff
      ? item.to === '/' || Boolean(item.staffOnly) || Boolean(item.perm && can(item.perm, 'view'))
      : (!item.adminOnly || isSuper) &&
        (!item.labOnly || isLab) &&
        (!item.staffOnly || !isLab) &&
        (item.needs !== 'order-create' || canCollect) &&
        (item.needs !== 'report-create' || canIssue) &&
        (!item.perm || can(item.perm, 'view'));

  /**
   * Issuing a certificate belongs to a laboratory and its staff, not to an
   * administrator.
   *
   * The API agrees and always did: a certificate is written against the
   * issuer's laboratory, and an administrator has none — role 1 is not a
   * laboratory and has no employment row — so createReport refuses with
   * "Your account is not linked to a laboratory". Offering the button to an
   * administrator was offering a control that could never succeed.
   *
   * The role decides whether the concept applies; the matrix decides whether
   * this particular person may. Both have to say yes.
   */
  // Head office is 0 and has no laboratory to issue against, so this is a test
  // of "works at a laboratory", not of rank.
  // A certificate is written against the issuer's laboratory, and head office
  // has none — so this asks "works at a laboratory", not "is senior".
  const canIssue = (user?.roleId ?? -1) >= ROLE.ADMIN && can('report', 'create');
  /** May take an order at the counter — the header button and the menu entry. */
  const canCollect = (user?.roleId ?? -1) >= ROLE.ADMIN && can('product_collection', 'create');

  const crumbs = useBreadcrumbs(portal);

  const here = `${location.pathname}${location.search}`;

  /*
    Unread messages: written to this account and not yet read or answered. The
    count lives on the Messages entry in the sidebar, where the conversation is,
    rather than behind the bell. Refreshed by the same live refresh as the lists
    — every 30 seconds, on coming back to the tab, and after any save, which is
    what clears it the moment a conversation is opened.
  */
  const unread = useFetch<{ meta: { total: number } }>('/messages?open=1&per_page=1');
  useLiveRefresh(unread.reload);
  const unreadCount = unread.data?.meta.total ?? 0;

  // The node at the right-hand end of the trail, handed to the page below so it
  // can put its own control on that line. State rather than a ref because the
  // page renders into it, and a ref would not tell it when the node arrived.
  const [crumbSlot, setCrumbSlot] = useState<HTMLDivElement | null>(null);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /**
   * Twelve digits is a certificate number, so it opens that certificate.
   * Anything else is treated as a customer and filters the order list.
   */
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearchError(null);

    if (/^\d{12}$/.test(q)) {
      setSearching(true);
      try {
        const r = await api.get<{ data: { id: number } }>(`/public/verify/${q}`);
        navigate(`/reports?highlight=${r.data.id}`);
        setQuery('');
      } catch {
        setSearchError(`No certificate numbered ${q}.`);
      } finally {
        setSearching(false);
      }
      return;
    }

    navigate(`/orders?q=${encodeURIComponent(q)}`);
    setQuery('');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* ------------------------------------------------------------ sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: open ? WIDTH : RAIL,
          flexShrink: 0,
          transition: 'width .2s',
          '& .MuiDrawer-paper': {
            width: open ? WIDTH : RAIL,
            boxSizing: 'border-box',
            // The menu is a navy panel, so its edge is a darker navy rather
            // than the page's grey divider — a light rule on a dark ground
            // reads as a seam.
            bgcolor: BRAND.navy,
            color: '#fff',
            borderRight: 1,
            borderColor: BRAND.navyDark,
            overflowX: 'hidden',
            transition: 'width .2s',
          },
        }}
      >
        <Toolbar
          sx={{
            // Collapsed, the mark centres on the rail with the icons below it.
            px: open ? 2.5 : 0,
            justifyContent: open ? 'flex-start' : 'center',
            minHeight: HEADER_H,
            height: HEADER_H,
            // The logo keeps its own white ground: the mark is drawn in navy
            // and gold, and a navy ground eats half of it. The change of
            // colour is the boundary, so there is no rule underneath.
            bgcolor: '#fff',
            gap: 1.25,
          }}
        >
          <Box
            component={RouterLink}
            to="/"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <Box component="img" src="/logo.png" alt="IIGL" sx={{ height: 44, flexShrink: 0 }} />
            {open && (
              <Typography
                sx={{ fontWeight: 700, fontSize: 20, lineHeight: 1.15, color: BRAND.navy }}
              >
                IIGL
              </Typography>
            )}
          </Box>
        </Toolbar>

        {/*
          The menu still scrolls; its scrollbar is just not drawn. A bar down
          the navy panel was a light stripe against the one thing this edge of
          the screen is for, and the gutter it needed took its width out of
          every row. Hidden, the rows keep the full width and stay centred on
          the rail. Wheel, trackpad, touch and keyboard are untouched — only the
          painted bar goes.
        */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            py: 1,
            // Firefox, then old Edge, then everything on Blink and WebKit.
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {groups
            .filter(
              (g) =>
                // Head office's staff: a group shows when any entry in it does.
                headOfficeStaff ||
                ((!g.adminOnly || isSuper) && (!g.labOnly || isLab)),
            )
            .map((group) => {
              const Icon = group.icon;

              const items = group.items.filter(shows);
              if (items.length === 0) return null;

              /** Whether this entry could be the page you are on. */
              const matches = (item: Item) =>
                item.end
                  ? here === item.to
                  : here === item.to ||
                    (here.startsWith(item.to.split('?')[0]) &&
                      !item.to.includes('?') &&
                      !items.some((o) => o !== item && o.to.includes('?') && here === o.to));

              /*
                One entry is current, never two.

                A prefix match makes `/reports` claim `/reports/new` as well as
                its own page, so on the certificate form both rows in the group
                lit up white and the sidebar said you were in two places at
                once. The longest match wins: `/reports/new` is the more
                specific answer to where you are, and `/reports` goes back to
                being the list it names.
              */
              const activeItem = items
                .filter(matches)
                .sort((a, b) => b.to.length - a.to.length)[0];

              const isHere = (item: Item) => item === activeItem;
              // A group with one entry is that entry: a chevron that opens
              // nothing would promise more than is there.
              const single = items.length === 1;
              // Untouched, a group is open when the page you are on is inside
              // it: arriving at Sub Categories should show you where you are.
              const expanded =
                openGroup === null ? Boolean(activeItem) : openGroup === group.label;

              const rowSx = {
                mx: 1.25,
                my: '3px',
                borderRadius: RADIUS,
                py: 1.05,
                px: open ? 1.5 : 0,
                justifyContent: open ? 'flex-start' : 'center',
                // Not pure white: the resting rows sit back so the one white
                // row reads as the place you are, rather than as one of ten
                // things all shouting the same brightness.
                color: alpha('#fff', 0.82),
                '&:hover': { bgcolor: alpha('#fff', 0.08), color: '#fff' },
                // The page you are on inverts the panel — white ground, navy
                // text. On a navy menu that is the strongest mark available
                // and needs no border or bar to help it.
                '&.current': {
                  bgcolor: '#fff',
                  color: BRAND.navy,
                  '& .MuiListItemIcon-root': { color: BRAND.navy },
                  '&:hover': { bgcolor: alpha('#fff', 0.9), color: BRAND.navy },
                },
                // Expanded, the group heads its own list rather than competing
                // with the entry inside it that is actually open.
                '&.expanded': {
                  bgcolor: alpha('#fff', 0.1),
                  color: '#fff',
                  '& .MuiListItemIcon-root': { color: '#fff' },
                },
              } as const;

              const count = items.some((i) => i.badge === 'messages') ? unreadCount : 0;

              const rowInside = (
                <>
                  <ListItemIcon
                    sx={{ minWidth: open ? 38 : 0, color: 'inherit', justifyContent: 'center' }}
                  >
                    {/* Collapsed, the count has nowhere to go but the icon. */}
                    <Badge
                      badgeContent={count}
                      color="success"
                      invisible={open || count === 0}
                      max={99}
                    >
                      <Icon sx={{ fontSize: 21 }} />
                    </Badge>
                  </ListItemIcon>
                  {open && (
                    <>
                      <ListItemText
                        primary={group.label}
                        slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: 500 } } }}
                      />
                      {count > 0 && (
                        <Box
                          component="span"
                          sx={{
                            minWidth: 20,
                            height: 20,
                            px: 0.75,
                            borderRadius: 10,
                            bgcolor: '#25d366',
                            color: '#fff',
                            fontSize: 11.5,
                            fontWeight: 700,
                            display: 'grid',
                            placeItems: 'center',
                            ml: 1,
                          }}
                        >
                          {count > 99 ? '99+' : count}
                        </Box>
                      )}
                      {!single && (
                        <ExpandIcon
                          sx={{
                            fontSize: 20,
                            color: 'inherit',
                            opacity: 0.75,
                            transform: expanded ? 'none' : 'rotate(-90deg)',
                            transition: 'transform .15s',
                          }}
                        />
                      )}
                    </>
                  )}
                </>
              );

              return (
                <Box key={group.label}>
                  <Tooltip
                    title={open ? '' : group.label}
                    placement="right"
                    disableHoverListener={open}
                  >
                    {single || !open ? (
                      <ListItemButton
                        component={NavLink}
                        to={items[0].to}
                        end={items[0].end}
                        className={activeItem ? 'current' : undefined}
                        sx={rowSx}
                      >
                        {rowInside}
                      </ListItemButton>
                    ) : (
                      <ListItemButton
                        onClick={() =>
                          setOpenGroup((current) =>
                            (current === null ? Boolean(activeItem) : current === group.label)
                              ? ''
                              : group.label,
                          )
                        }
                        className={
                          expanded ? 'expanded' : activeItem ? 'current' : undefined
                        }
                        sx={rowSx}
                      >
                        {rowInside}
                      </ListItemButton>
                    )}
                  </Tooltip>

                  {!single && open && (
                    <Collapse in={expanded} timeout="auto">
                      <List dense disablePadding sx={{ pb: 0.5 }}>
                        {items.map((item) => (
                          <ListItemButton
                            key={item.to}
                            component={NavLink}
                            to={item.to}
                            end={item.end}
                            className={isHere(item) ? 'current' : undefined}
                            sx={{
                              mx: 1.25,
                              my: 0,
                              // Aligned under the group label, not under its icon.
                              pl: 4.75,
                              pr: 1.5,
                              py: 0.6,
                              borderRadius: RADIUS,
                              // A step back from the group above it, so the
                              // list reads as belonging to its heading.
                              color: alpha('#fff', 0.7),
                              position: 'relative',
                              // The entry you are on inverts, exactly as the
                              // group rows do: white ground, navy text.
                              '&.current': {
                                bgcolor: '#fff',
                                '&:hover': { bgcolor: alpha('#fff', 0.9) },
                                '& .MuiListItemText-primary': {
                                  color: BRAND.navy,
                                  fontWeight: 600,
                                },
                              },
                              // Hover is the tint; the white fill is reserved
                              // for the entry you are actually on.
                              '&:hover': { bgcolor: alpha('#fff', 0.08), color: '#fff' },
                            }}
                          >
                            <ListItemText
                              primary={item.label}
                              slotProps={{
                                primary: { sx: { fontSize: 13.5, fontWeight: 'inherit' } },
                              }}
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    </Collapse>
                  )}
                </Box>
              );
            })}
        </Box>
      </Drawer>

      {/* --------------------------------------------------- header and page */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          elevation={0}
          // One navy band across the top of the page, continuous with the
          // menu beside it. Everything in it therefore has to be styled for a
          // dark ground: the theme's text.secondary and contained-primary are
          // both navy, which on navy is invisible.
          sx={{
            bgcolor: BRAND.navy,
            color: '#fff',
            borderBottom: 1,
            borderColor: BRAND.navyDark,
            // An IconButton with no colour prop is `action.active` — near
            // black, which on this ground is a button nobody can see. Set once
            // on the bar so a new one cannot be added and forgotten.
            '& .MuiIconButton-root': {
              color: '#fff',
              '&:hover': { bgcolor: alpha('#fff', 0.12) },
            },
          }}
        >
          <Toolbar sx={{ gap: 2, minHeight: HEADER_H, height: HEADER_H, px: { xs: 2, md: 3 } }}>
            <IconButton onClick={() => setOpen((o) => !o)} edge="start" aria-label="Toggle menu">
              <MenuIcon />
            </IconButton>

            <Box sx={{ minWidth: 0, display: { xs: 'none', sm: 'block' } }}>
              <Typography sx={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.2 }} noWrap>
                Welcome, {user?.fullname}
              </Typography>
              <Typography sx={{ fontSize: 12, color: alpha('#fff', 0.7) }}>{today}</Typography>
            </Box>

            {/*
              The middle of the bar, and who gets it.

              For head office and a laboratory it is the search — a certificate
              number or a customer, across the laboratory. Staff have their own
              work in front of them and the lists to page; what the bar owes
              them is the day's clock, so that takes the room the field had, in
              the same place.
            */}
            {isStaff && (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  minWidth: 0,
                }}
              >
                <PunchClock />
              </Box>
            )}

            <Box
              component="form"
              onSubmit={search}
              sx={{
                flex: 1,
                maxWidth: 520,
                mx: 'auto',
                display: isStaff ? 'none' : { xs: 'none', md: 'block' },
              }}
            >
              <TextField
                placeholder="Search a certificate number, or a customer…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchError(null);
                }}
                error={Boolean(searchError)}
                helperText={searchError}
                disabled={searching}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    // The same corner as everything else; the search field was
                    // still a pill after the menu stopped being one. White on
                    // the navy bar, with navy text: a field you type into
                    // should look like paper whatever it is sitting on.
                    sx: {
                      borderRadius: RADIUS,
                      bgcolor: '#fff',
                      color: BRAND.navy,
                      // Lighter than the text it shares the box with, so the
                      // prompt does not read as something already typed.
                      '& input::placeholder': { color: alpha(BRAND.navy, 0.55), opacity: 1 },
                      '& .MuiInputAdornment-root .MuiSvgIcon-root': {
                        color: alpha(BRAND.navy, 0.55),
                      },
                      // The white fill is the edge. An outline as well would
                      // draw a grey line around a white box on navy.
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: BRAND.gold,
                        borderWidth: 2,
                      },
                    },
                  },
                  formHelperText: {
                    sx: { position: 'absolute', top: 38, m: 0, fontSize: 11, color: '#ffb4ab' },
                  },
                }}
              />
            </Box>

            {/* The gap that pushes the controls right on a narrow screen,
                where the field in the middle is hidden. */}
            <Box sx={{ flex: { xs: 1, md: 0 } }} />

            {/*
              The reference layout carries a cart here. A laboratory has no
              basket — the equivalent daily action is taking an order at the
              counter, which is where the work starts. It used to open the
              certificate form instead, which is the step after.

              Shown only to somebody who may actually collect one, on the
              `product_collection` create grant.

              It sits immediately left of the bell for every role, so the one
              thing anybody starts from is in the same place whoever is signed
              in — staff have the clock in the middle, not instead of this.

              This is now the only way in: the Orders group used to carry a
              Collect New beside its three lists, and one action in two places
              is two things to keep in step for no gain.
            */}
            {canCollect && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/orders/new')}
                /*
                  The yellow, not the white it was.

                  Navy on navy is not a button, so this bar's controls have to
                  invert — but white is also what the avatar, the bell and every
                  icon up here already are, and the one thing somebody comes to
                  this panel to *start* was indistinguishable from the furniture
                  around it. The yellow is the brightest colour the palette has
                  and nothing else in the bar uses it.

                  Navy text, not white: yellow this bright carries nothing
                  legible in white. Same pairing as Follow on the enquiry lists,
                  which is the only other filled yellow control here.
                */
                sx={{
                  whiteSpace: 'nowrap',
                  px: 2,
                  bgcolor: BRAND.yellow,
                  color: BRAND.navy,
                  fontWeight: 600,
                  '&:hover': { bgcolor: BRAND.yellowDark },
                }}
              >
                Collect New
              </Button>
            )}

            {/*
              The bell counts the one thing in this system that actually waits
              on a person — money sent to them and not yet approved or declined
              — and opens the box that lists it. See `NotificationBell`.
            */}
            <NotificationBell />

            <Stack
              direction="row"
              spacing={1.25}
              onClick={(e) => setMenu(e.currentTarget)}
              sx={{
                alignItems: 'center',
                cursor: 'pointer',
                pl: 1,
                borderLeft: 1,
                borderColor: alpha('#fff', 0.2),
              }}
            >
              {/*
                The photograph when there is one, initials when there is not.
                Avatar falls back to its children on a missing or broken src by
                itself, which is what an account whose file was uploaded by the
                old application and since deleted needs.
              */}
              <Avatar
                src={fileUrl(user?.photo) ?? undefined}
                alt=""
                sx={{
                  bgcolor: '#fff',
                  color: BRAND.navy,
                  fontWeight: 600,
                  width: 38,
                  height: 38,
                  fontSize: 14,
                }}
              >
                {initials(user?.fullname ?? '')}
              </Avatar>
              {/*
                Two lines about one person, so they sit as one block. The
                caption's default 1.66 line height put a blank line's worth of
                air between a name and the role it belongs to.
              */}
              <Box sx={{ display: { xs: 'none', lg: 'block' }, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.15 }} noWrap>
                  {user?.fullname}
                </Typography>
                <Typography
                  sx={{ fontSize: 11.5, lineHeight: 1.25, color: alpha('#fff', 0.7) }}
                  noWrap
                >
                  {user?.roleId == null ? 'No role' : (ROLE_NAMES[user.roleId] ?? 'Account')}
                </Typography>
              </Box>
            </Stack>

            <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
              <MenuItem
                onClick={() => {
                  setMenu(null);
                  navigate('/profile');
                }}
              >
                <ListItemIcon>
                  <ProfileIcon fontSize="small" />
                </ListItemIcon>
                Your profile
              </MenuItem>
              <Divider />
              {/*
                Sign out is filled rather than listed. It is the one item in
                this menu that ends the session, and a row of identical text
                makes leaving as easy to hit by accident as opening a profile.
                Red for the same reason a delete is red — the colour is the
                warning, and it is the panel's own refused tone rather than a
                new one.
              */}
              <MenuItem
                onClick={signOut}
                sx={{
                  mx: 1,
                  my: 0.5,
                  borderRadius: 1,
                  color: 'common.white',
                  background: `linear-gradient(180deg, ${TONE.refused.main} 0%, #7d2134 100%)`,
                  '& .MuiListItemIcon-root': { color: 'common.white' },
                  '&:hover': {
                    background: `linear-gradient(180deg, #7d2134 0%, ${TONE.refused.main} 100%)`,
                  },
                }}
              >
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Sign out
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        {/*
          The Material UI breadcrumb, used the way its documentation defines it:
          a labelled <nav>, an icon separator rather than a typed character, a
          Link per ancestor and a plain Typography for the page you are on —
          which is not a link, because it goes nowhere.
        */}
        {/*
          One crumb is not a trail. The dashboard is the root, so its trail is
          the single word "Dashboard" — a heading pretending to be navigation,
          taking a band of the page to say what the sidebar already highlights.
          The bar appears as soon as there is somewhere to go back to.
        */}
        {crumbs.length > 1 && (
        <Box
          sx={{
            px: { xs: 2, md: 3 },
            pt: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            minHeight: 34,
          }}
        >
          <Breadcrumbs
            aria-label="breadcrumb"
            separator={<NextIcon fontSize="inherit" sx={{ color: 'text.disabled' }} />}
            sx={{ fontSize: 13.5, '& .MuiBreadcrumbs-separator': { mx: 0.75 } }}
          >
            {crumbs.map((crumb, i) =>
              crumb.to ? (
                <Link
                  key={crumb.to}
                  component={RouterLink}
                  to={crumb.to}
                  underline="hover"
                  color="inherit"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {i === 0 && <HomeIcon fontSize="inherit" />}
                  {crumb.label}
                </Link>
              ) : (
                <Typography
                  key={crumb.label}
                  variant="inherit"
                  aria-current="page"
                  sx={{ fontWeight: 600, color: 'text.primary' }}
                >
                  {crumb.label}
                </Typography>
              ),
            )}
          </Breadcrumbs>
          {/* Filled by the page through `CrumbActions`, empty on the rest. */}
          <Box ref={setCrumbSlot} sx={{ display: 'flex', alignItems: 'center', gap: 1 }} />
        </Box>
        )}

        <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, pt: 2.5, pb: 8, minWidth: 0 }}>
          <CrumbSlotContext.Provider value={crumbSlot}>
            {/* A laboratory's commission reminder, or the lock, above every page. */}
            <StatementReminder />
            <Outlet />
          </CrumbSlotContext.Provider>
        </Box>
      </Box>
    </Box>
  );
}
