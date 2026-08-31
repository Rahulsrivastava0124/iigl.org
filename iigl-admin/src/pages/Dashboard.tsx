import { Box, CircularProgress, Grid, Typography } from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { Notice, Panel, Tile, money } from '../components/ui';
import TrendChart from '../components/TrendChart';
import { BRAND } from '../lib/theme';
import type { Tone } from '../components/ui';
import type { DashboardSummary, TrendMonth } from '../lib/api';
import OrdersIcon from '@mui/icons-material/ReceiptLongOutlined';
import DeliveredIcon from '@mui/icons-material/TaskAltOutlined';
import SmartCardIcon from '@mui/icons-material/CreditCardOutlined';
import ClassicCardIcon from '@mui/icons-material/DescriptionOutlined';
import ActiveIcon from '@mui/icons-material/HourglassBottomOutlined';
import SaleIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import PaidIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import DuesIcon from '@mui/icons-material/PendingActionsOutlined';
import WalletIcon from '@mui/icons-material/SavingsOutlined';
import CommissionIcon from '@mui/icons-material/PercentOutlined';
import ApprovalIcon from '@mui/icons-material/FactCheckOutlined';
import LabIcon from '@mui/icons-material/StorefrontOutlined';
import StaffIcon from '@mui/icons-material/BadgeOutlined';
import RegisteredIcon from '@mui/icons-material/HowToRegOutlined';
import CustomerIcon from '@mui/icons-material/PersonOutlineOutlined';
import TodayIcon from '@mui/icons-material/TodayOutlined';
import CertificateIcon from '@mui/icons-material/WorkspacePremiumOutlined';

/** Four to a row on a wide screen, two on a phone: the shape of every group. */
const CELL = { xs: 6, sm: 6, md: 3 } as const;

/**
 * Dashboard cards are tinted rather than outlined, and the colour says what
 * kind of figure it is: navy for one that only counts, a state colour where
 * the number is itself a state. Money owed goes red only while it is owed, so
 * a settled account reads green rather than staying alarming at zero.
 */
const owed = (amount: number): Tone => (amount > 0 ? 'refused' : 'settled');

export default function Dashboard() {
  const { data, loading, error } = useFetch<{ data: DashboardSummary }>('/dashboard/summary');
  const trend = useFetch<{ data: TrendMonth[] }>('/dashboard/trend');
  const s = data?.data;
  const n = (v: number) => v.toLocaleString();

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={26} />
        </Box>
      )}

      {s && (
        <>
          <Panel title="Account">
            <Grid container spacing={1} sx={{ p: 1.5 }}>
              <Grid size={CELL}>
                <Tile
                  label="Total collected"
                  value={n(s.orders.total)}
                  note="orders"
                  fill="brand"
                  icon={OrdersIcon}
                />
              </Grid>
              <Grid size={CELL}>
                <Tile
                  label="Completed tested"
                  value={n(s.orders.delivered)}
                  fill="settled"
                  icon={DeliveredIcon}
                />
              </Grid>
              <Grid size={CELL}>
                <Tile
                  label="Smart report"
                  value={n(s.cards.smart)}
                  fill="brand"
                  icon={SmartCardIcon}
                />
              </Grid>
              <Grid size={CELL}>
                <Tile
                  label="Classic report"
                  value={n(s.cards.classic)}
                  fill="brand"
                  icon={ClassicCardIcon}
                />
              </Grid>
              <Grid size={CELL}>
                <Tile
                  label="Active order"
                  value={n(s.orders.active)}
                  fill="waiting"
                  icon={ActiveIcon}
                />
              </Grid>
              <Grid size={CELL}>
                <Tile label="Total sale" value={money(s.money.sale)} fill="brand" icon={SaleIcon} />
              </Grid>
              <Grid size={CELL}>
                <Tile
                  label="Paid amount"
                  value={money(s.money.paid)}
                  fill="settled"
                  icon={PaidIcon}
                />
              </Grid>
              <Grid size={CELL}>
                <Tile
                  label="Dues amount"
                  value={money(s.money.dues)}
                  fill={owed(s.money.dues)}
                  icon={DuesIcon}
                />
              </Grid>
            </Grid>
          </Panel>

          <Box sx={{ mt: 2 }}>
            <Panel title="Wallet">
              <Grid container spacing={1} sx={{ p: 1.5 }}>
                <Grid size={CELL}>
                  <Tile
                    label="Current wallet"
                    value={money(s.wallet.balance)}
                    fill="brand"
                    icon={WalletIcon}
                    to="/wallet"
                  />
                </Grid>
                <Grid size={CELL}>
                  <Tile
                    label="Total commission"
                    value={money(s.wallet.commission_accrued)}
                    note="accrued"
                    fill="brand"
                    icon={CommissionIcon}
                  />
                </Grid>
                <Grid size={CELL}>
                  <Tile
                    label="Dues amount"
                    value={money(s.wallet.commission_dues)}
                    fill={owed(s.wallet.commission_dues)}
                    icon={DuesIcon}
                  />
                </Grid>
                <Grid size={CELL}>
                  <Tile
                    label="On approval"
                    value={money(s.wallet.on_approval)}
                    fill={s.wallet.on_approval > 0 ? 'waiting' : 'plain'}
                    icon={ApprovalIcon}
                  />
                </Grid>
              </Grid>
            </Panel>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Panel title="People">
              <Grid container spacing={1} sx={{ p: 1.5 }}>
                {s.people.laboratories !== null && (
                  <Grid size={CELL}>
                    <Tile
                      label="Total franchise"
                      value={n(s.people.laboratories)}
                      fill="brand"
                      icon={LabIcon}
                    />
                  </Grid>
                )}
                <Grid size={CELL}>
                  <Tile
                    label="Total employee"
                    value={n(s.people.employees)}
                    fill="brand"
                    icon={StaffIcon}
                  />
                </Grid>
                <Grid size={CELL}>
                  <Tile
                    label="Registered customer"
                    value={n(s.people.customers_registered)}
                    note="with GST"
                    fill="settled"
                    icon={RegisteredIcon}
                  />
                </Grid>
                <Grid size={CELL}>
                  <Tile
                    label="Non-registered customer"
                    value={n(s.people.customers_unregistered)}
                    fill="plain"
                    icon={CustomerIcon}
                  />
                </Grid>
              </Grid>
            </Panel>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Panel title="Today">
              <Grid container spacing={1} sx={{ p: 1.5 }}>
                <Grid size={CELL}>
                  <Tile
                    label="Orders taken"
                    value={n(s.orders.today)}
                    fill="brand"
                    icon={TodayIcon}
                  />
                </Grid>
                <Grid size={CELL}>
                  <Tile
                    label="Billed"
                    value={money(s.money.sale_today)}
                    fill="brand"
                    icon={SaleIcon}
                  />
                </Grid>
                <Grid size={CELL}>
                  <Tile
                    label="Certificates"
                    value={n(s.reports.total)}
                    note="all time"
                    fill="brand"
                    icon={CertificateIcon}
                  />
                </Grid>
              </Grid>
            </Panel>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Panel title="Last twelve months">
              <Grid container spacing={1} sx={{ p: 1.5 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Orders taken
                  </Typography>
                  <TrendChart
                    points={(trend.data?.data ?? []).map((m) => ({
                      label: m.label,
                      value: m.orders,
                    }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Certificates issued
                  </Typography>
                  <TrendChart
                    points={(trend.data?.data ?? []).map((m) => ({
                      label: m.label,
                      value: m.reports,
                    }))}
                    colour={BRAND.gold}
                  />
                </Grid>
              </Grid>
            </Panel>
          </Box>

          {s.money.paid > s.money.sale && (
            <Notice kind="warn" sx={{ mt: 3, mb: 0 }}>
              Collected exceeds billed by {money(s.money.paid - s.money.sale)}. Most orders carry no
              billed total in the legacy data, so this figure is understated rather than the
              collection being wrong. It resolves as orders are settled through this system.
            </Notice>
          )}
        </>
      )}
    </>
  );
}
