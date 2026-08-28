import { NavLink, Outlet } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import OrdersIcon from '@mui/icons-material/ReceiptLongOutlined';
import CertificatesIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import TransactionsIcon from '@mui/icons-material/PaymentsOutlined';
import LabsIcon from '@mui/icons-material/ScienceOutlined';
import StaffIcon from '@mui/icons-material/BadgeOutlined';
import CategoriesIcon from '@mui/icons-material/CategoryOutlined';
import AttributesIcon from '@mui/icons-material/TuneOutlined';
import PricingIcon from '@mui/icons-material/SellOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { useAuth } from '../lib/auth';
import { ROLE_NAMES } from '../lib/portal';

const WIDTH = 236;

interface Item {
  to: string;
  label: string;
  icon: typeof DashboardIcon;
  end?: boolean;
}

const OPERATIONS: Item[] = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/orders', label: 'Orders', icon: OrdersIcon },
  { to: '/reports', label: 'Certificates', icon: CertificatesIcon },
  { to: '/transactions', label: 'Transactions', icon: TransactionsIcon },
];

const NETWORK: Item[] = [
  { to: '/laboratories', label: 'Laboratories', icon: LabsIcon },
  { to: '/staff', label: 'Staff', icon: StaffIcon },
];

const CATALOGUE: Item[] = [
  { to: '/categories', label: 'Categories', icon: CategoriesIcon },
  { to: '/attributes', label: 'Attributes', icon: AttributesIcon },
  { to: '/pricing', label: 'Pricing', icon: PricingIcon },
];

function GroupLabel({ children }: { children: string }) {
  return (
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ display: 'block', px: 2, pt: 1.75, pb: 0.5 }}
    >
      {children}
    </Typography>
  );
}

function NavItem({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <ListItemButton
      component={NavLink}
      to={item.to}
      end={item.end}
      sx={{
        mx: 1,
        my: '1px',
        borderRadius: 1.5,
        py: 0.6,
        color: 'text.secondary',
        '&.active': {
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
          '&:hover': { bgcolor: 'primary.dark' },
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={item.label}
        slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: 'inherit' } } }}
      />
    </ListItemButton>
  );
}

export default function Shell() {
  const { user, signOut, portal } = useAuth();
  const isAdmin = user?.roleId === 1;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: WIDTH,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
          },
        }}
      >
        <AppBar position="static" elevation={0}>
          <Toolbar sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>IIGL</Typography>
            <Typography variant="overline" sx={{ opacity: 0.75, lineHeight: 1.4 }}>
              {portal === 'team' ? 'Team' : 'Administration'}
            </Typography>
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, overflowY: 'auto', pb: 1 }}>
          <List dense disablePadding sx={{ pt: 1 }}>
            {OPERATIONS.map((i) => (
              <NavItem key={i.to} item={i} />
            ))}
          </List>

          <GroupLabel>Network</GroupLabel>
          <List dense disablePadding>
            {NETWORK.map((i) => (
              <NavItem key={i.to} item={i} />
            ))}
          </List>

          {isAdmin && (
            <>
              <GroupLabel>Catalogue</GroupLabel>
              <List dense disablePadding>
                {CATALOGUE.map((i) => (
                  <NavItem key={i.to} item={i} />
                ))}
              </List>
            </>
          )}
        </Box>

        <Divider />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 1.5 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>
              {user?.fullname}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {ROLE_NAMES[user?.roleId ?? 0] ?? 'Unknown role'}
            </Typography>
          </Box>
          <Button size="small" color="inherit" onClick={signOut} startIcon={<LogoutIcon />}>
            Sign out
          </Button>
        </Stack>
      </Drawer>

      <Box component="main" sx={{ flex: 1, minWidth: 0, px: 4, py: 3.5, pb: 8 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
