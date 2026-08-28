import { useEffect, useState } from 'react';
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
import BellIcon from '@mui/icons-material/NotificationsNoneOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import ExpandIcon from '@mui/icons-material/ExpandMoreOutlined';
import NextIcon from '@mui/icons-material/NavigateNextOutlined';
import HomeIcon from '@mui/icons-material/HomeOutlined';
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import OrdersIcon from '@mui/icons-material/ReceiptLongOutlined';
import CertificatesIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import TransactionsIcon from '@mui/icons-material/PaymentsOutlined';
import AttendanceIcon from '@mui/icons-material/EventAvailableOutlined';
import LabsIcon from '@mui/icons-material/ScienceOutlined';
import StaffIcon from '@mui/icons-material/BadgeOutlined';
import ProfileIcon from '@mui/icons-material/PersonOutlineOutlined';
import CustomerIcon from '@mui/icons-material/GroupsOutlined';
import CategoriesIcon from '@mui/icons-material/CategoryOutlined';
import PricingIcon from '@mui/icons-material/SellOutlined';
import ContentIcon from '@mui/icons-material/ArticleOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { alpha } from '@mui/material/styles';
import { BRAND } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/useFetch';
import { ROLE_NAMES } from '../lib/portal';
import { api } from '../lib/api';
import { useBreadcrumbs } from '../lib/breadcrumbs';
import { usePermissions } from '../lib/permissions';
import { toneColour } from './ui';

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
  /**
   * Hidden behind the super administrator door.
   *
   * Both doors admit role 1, so the difference is not what the account may do —
   * the API decides that and does not change — but what the door is for. The
   * admin address runs the day: the order queue and the certificates coming off
   * it. The super address is the business above that, so the two operational
   * lists are left off it.
   */
  hideInSuper?: boolean;
}

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
 *     appear in the reference but exist nowhere in IIGL — no table, no route,
 *     no view, in either the old application or this one.
 *
 * Sub-items deep-link into a screen's section rather than duplicating it, so
 * "Category" and "Sub Category" are one screen opened at different tabs.
 */
const ADMIN_GROUPS: Group[] = [
  { label: 'Dashboard', icon: DashboardIcon, items: [{ to: '/', label: 'Dashboard', end: true }] },
  {
    label: 'Orders',
    icon: OrdersIcon,
    hideInSuper: true,
    items: [{ to: '/orders', label: 'Order Management' }],
  },
  {
    label: 'Certificates',
    icon: CertificatesIcon,
    hideInSuper: true,
    items: [{ to: '/reports', label: 'Certificates' }],
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
    label: 'Laboratory',
    icon: LabsIcon,
    items: [{ to: '/laboratories', label: 'View Franchise' }],
  },
  {
    label: 'Employee Management',
    icon: StaffIcon,
    items: [
      { to: '/staff', label: 'Employee List' },
      { to: '/attendance', label: 'Attendance' },
      { to: '/roles', label: 'Roles & Permissions', adminOnly: true },
    ],
  },
  {
    label: 'Account',
    icon: TransactionsIcon,
    items: [
      { to: '/transactions?status=0', label: 'Commission Approval' },
      { to: '/transactions', label: 'Commission History' },
      { to: '/transactions?view=ledger', label: 'Ledger' },
    ],
  },
  {
    label: 'Customer',
    icon: CustomerIcon,
    items: [
      { to: '/customers', label: 'Registered' },
      { to: '/customers?tab=unregistered', label: 'Not Registered' },
      { to: '/customers?tab=verifiers', label: 'Verifiers' },
    ],
  },
  {
    label: 'Website Setup',
    icon: ContentIcon,
    adminOnly: true,
    items: [
      { to: '/content?tab=pages', label: 'Pages' },
      { to: '/content?tab=types', label: 'Report Types' },
      { to: '/content?tab=articles', label: 'Blog' },
      { to: '/content?tab=branches', label: 'Branches' },
      { to: '/content?tab=banners', label: 'Banners' },
    ],
  },
  { label: 'Your profile', icon: ProfileIcon, items: [{ to: '/profile', label: 'Your profile' }] },
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
 *   - **the list comes first.** "Collect New" sits under the order lists rather
 *     than above them, because a person opening Orders is usually looking for
 *     one, and the Add button is on the list itself;
 *   - **Message is not here.** Both its entries, Send Message and Message
 *     History, are `href="#"` in the old application — the feature was never
 *     built, and listing it would promise a screen that has never existed;
 *   - **Wallet is not a separate entry.** The old Wallet screen shows the
 *     balance that now heads the Ledger, so it would be the same figures under
 *     a second name.
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
      { to: '/orders?status=delivered', label: 'Paid & Delivered' },
      { to: '/orders?dues=1', label: 'Dues Order' },
      { to: '/orders/new', label: 'Collect New', needs: 'order-create' },
    ],
  },
  {
    label: 'Report',
    icon: CertificatesIcon,
    items: [
      { to: '/reports', label: 'All Reports List' },
      { to: '/reports/new', label: 'Issue a Certificate', needs: 'report-create' },
    ],
  },
  {
    label: 'Customer',
    icon: CustomerIcon,
    items: [
      { to: '/customers', label: 'Registered' },
      { to: '/customers?tab=unregistered', label: 'Non-Registered' },
    ],
  },
  {
    label: 'Account',
    icon: TransactionsIcon,
    items: [
      { to: '/transactions', label: 'Transfer History' },
      { to: '/transactions?view=ledger', label: 'Ledger' },
    ],
  },
  {
    label: 'Employee',
    icon: StaffIcon,
    labOnly: true,
    items: [
      { to: '/staff', label: 'Employee List' },
      { to: '/attendance', label: 'Attendance' },
    ],
  },
  {
    label: 'Attendance',
    icon: AttendanceIcon,
    items: [{ to: '/attendance', label: 'Attendance', staffOnly: true }],
  },
  { label: 'Your profile', icon: ProfileIcon, items: [{ to: '/profile', label: 'Your profile' }] },
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
  const { can } = usePermissions();
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

  const isAdmin = user?.roleId === 1;
  const isLab = user?.roleId === 2;

  /**
   * An administrator runs the business; a laboratory and its employees run the
   * counter. They are different jobs, so they get different menus rather than
   * one menu with most of it hidden.
   */
  const groups = isAdmin ? ADMIN_GROUPS : FIELD_GROUPS;

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
  const canIssue = (user?.roleId ?? 0) >= 2 && can('report', 'create');

  /**
   * What is waiting on this person: transactions sent to them and still
   * pending. Re-read on every navigation, which is often enough for a queue
   * that moves a few times a day and costs one indexed count.
   */
  const pending = useFetch<{ meta: { total: number } }>(
    '/transactions?status=0&direction=received&per_page=1',
  );
  const waiting = pending.data?.meta.total ?? 0;

  useEffect(() => {
    pending.reload();
  }, [location.pathname]);

  const crumbs = useBreadcrumbs(portal);
  const here = `${location.pathname}${location.search}`;

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
            borderRight: 1,
            borderColor: 'divider',
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
            borderBottom: 1,
            borderColor: 'divider',
            gap: 1.25,
          }}
        >
          <Box component="img" src="/logo.png" alt="" sx={{ height: 34, flexShrink: 0 }} />
          {open && (
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.15, color: 'primary.main' }}
              >
                IIGL
              </Typography>
              <Typography sx={{ fontSize: 12 }} color="text.secondary" noWrap>
                {portal === 'team' ? 'Team' : 'Administration'}
              </Typography>
            </Box>
          )}
        </Toolbar>

        {/*
          The scrollbar took its 16px out of the left of the menu, so every row
          sat off-centre on the rail and short of the right edge when open. A
          thin bar with a stable gutter on both edges keeps the rows centred
          whether or not the menu is long enough to scroll.
        */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            py: 1,
            scrollbarWidth: 'thin',
            scrollbarGutter: 'stable both-edges',
          }}
        >
          {groups
            .filter(
              (g) =>
                (!g.adminOnly || isAdmin) &&
                (!g.labOnly || isLab) &&
                (!g.hideInSuper || portal !== 'super'),
            )
            .map((group) => {
              const Icon = group.icon;

              const items = group.items.filter(
                (item) =>
                  (!item.adminOnly || isAdmin) &&
                  (!item.labOnly || isLab) &&
                  (!item.staffOnly || !isLab) &&
                  (item.needs !== 'order-create' || can('product_collection', 'create')) &&
                  (item.needs !== 'report-create' || canIssue),
              );
              if (items.length === 0) return null;

              /** Whether the current location is this entry. */
              const isHere = (item: Item) =>
                item.end
                  ? here === item.to
                  : here === item.to ||
                    (here.startsWith(item.to.split('?')[0]) &&
                      !item.to.includes('?') &&
                      !items.some((o) => o !== item && o.to.includes('?') && here === o.to));

              const activeItem = items.find(isHere);
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
                color: 'text.primary',
                '&.current': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                  '&:hover': { bgcolor: 'primary.dark' },
                },
                // Expanded, the group heads its own list rather than competing
                // with the entry inside it that is actually open.
                '&.expanded': {
                  bgcolor: 'action.hover',
                  color: 'text.primary',
                  '& .MuiListItemIcon-root': { color: 'text.primary' },
                },
              } as const;

              const rowInside = (
                <>
                  <ListItemIcon
                    sx={{ minWidth: open ? 38 : 0, color: 'inherit', justifyContent: 'center' }}
                  >
                    <Icon sx={{ fontSize: 21 }} />
                  </ListItemIcon>
                  {open && (
                    <>
                      <ListItemText
                        primary={group.label}
                        slotProps={{ primary: { sx: { fontSize: 15, fontWeight: 600 } } }}
                      />
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
                              color: 'text.secondary',
                              position: 'relative',
                              // The entry you are on is in the brand navy, on a
                              // navy ground, with a bar down its left edge. A
                              // neutral grey said "hovered", not "here".
                              '&.current': {
                                bgcolor: 'primary.main',
                                '&:hover': { bgcolor: 'primary.dark' },
                                '& .MuiListItemText-primary': {
                                  color: 'primary.contrastText',
                                  fontWeight: 600,
                                },
                              },
                              // Hover is the tint; the filled navy is reserved
                              // for the entry you are actually on.
                              '&:hover': { bgcolor: alpha(BRAND.navy, 0.06) },
                            }}
                          >
                            <ListItemText
                              primary={item.label}
                              slotProps={{
                                primary: { sx: { fontSize: 14, fontWeight: 'inherit' } },
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
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderBottom: 1,
            borderColor: 'divider',
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
              <Typography sx={{ fontSize: 12 }} color="text.secondary">
                {today}
              </Typography>
            </Box>

            <Box
              component="form"
              onSubmit={search}
              sx={{ flex: 1, maxWidth: 520, mx: 'auto', display: { xs: 'none', md: 'block' } }}
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
                    // still a pill after the menu stopped being one.
                    sx: { borderRadius: RADIUS },
                  },
                  formHelperText: { sx: { position: 'absolute', top: 38, m: 0, fontSize: 11 } },
                }}
              />
            </Box>

            <Box sx={{ flex: { xs: 1, md: 0 } }} />

            {/* The reference layout carries a cart here. A laboratory has no
                basket — the equivalent daily action is issuing a certificate. */}
            {canIssue && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/reports/new')}
                sx={{ whiteSpace: 'nowrap', px: 2 }}
              >
                Add report
              </Button>
            )}

            {/*
              The bell was a control that did nothing. It now counts the one
              thing in this system that actually waits on a person: transactions
              sent to you and not yet approved or declined. An administrator
              sees every pending one, since the API scopes the list by role.
            */}
            <Tooltip
              title={
                waiting === 0
                  ? 'Nothing is waiting on you'
                  : `${waiting} transaction${waiting === 1 ? '' : 's'} awaiting your decision`
              }
            >
              <IconButton
                aria-label={
                  waiting === 0 ? 'Notifications' : `Notifications, ${waiting} waiting`
                }
                onClick={() => navigate('/transactions?status=0')}
              >
                <Badge color={toneColour('waiting')} badgeContent={waiting} max={99}>
                  <BellIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <Stack
              direction="row"
              spacing={1.25}
              onClick={(e) => setMenu(e.currentTarget)}
              sx={{
                alignItems: 'center',
                cursor: 'pointer',
                pl: 1,
                borderLeft: 1,
                borderColor: 'divider',
              }}
            >
              <Avatar sx={{ bgcolor: 'primary.main', width: 38, height: 38, fontSize: 14 }}>
                {initials(user?.fullname ?? '')}
              </Avatar>
              <Box sx={{ display: { xs: 'none', lg: 'block' }, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 }} noWrap>
                  {user?.fullname}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {ROLE_NAMES[user?.roleId ?? 0] ?? 'Account'}
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
              <MenuItem onClick={signOut}>
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
        <Box sx={{ px: { xs: 2, md: 3 }, pt: 2 }}>
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
        </Box>

        <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, pt: 2.5, pb: 8, minWidth: 0 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
