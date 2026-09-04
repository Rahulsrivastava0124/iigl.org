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

/**
 * How wide a card is: four to a row on a wide screen, two on a tablet, one on
 * a phone. The groups are counts of four and eight, so four to a row is the
 * width that leaves no card stranded at the end of a row.
 */
const CELL = { xs: 12, sm: 6, md: 3 } as const;

/**
 * The today row is five cards, so it gets its own width: five across on a wide
 * screen, and the same two and one as everything else below that. Grid's
 * twelve columns do not divide by five, so the size is given as a fraction of
 * the container rather than in columns.
 */
const TODAY_CELL = { xs: 12, sm: 6, md: 'grow' } as const;

/**
 * Dashboard cards are tinted rather than outlined, and the colour says what
 * kind of figure it is: navy for one that only counts, a state colour where
 * the number is itself a state. Money owed goes red only while it is owed, so
 * a settled account reads green rather than staying alarming at zero.
 */
const owed = (amount: number): Tone => (amount > 0 ? 'refused' : 'settled');

const n = (v: number) => v.toLocaleString();

export default function Dashboard() {
  const { data, loading, error } = useFetch<{ data: DashboardSummary }>('/dashboard/summary');
  const trend = useFetch<{ data: TrendMonth[] }>('/dashboard/trend');
  const s = data?.data;

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
          {/*
            Two dashboards, not one scoped two ways.

            A laboratory's figures are different quantities from head office's —
            cards rather than orders, its own ledger rather than the whole
            system's — so the reply carries a `lab` block only for a laboratory,
            and its presence is what chooses the screen.
          */}
          {s.lab ? <LaboratoryTiles s={s} lab={s.lab} /> : <HeadOfficeTiles s={s} />}

          {/*
            The charts keep a panel of their own. A tile is a figure and the
            group heading is enough to hold a row of them together; a chart has
            axes and a plot area, and needs an edge to sit inside.
          */}
          <Box sx={{ mt: 4 }}>
            <Panel title="Last twelve months">
              <Grid container spacing={2} sx={{ p: 2 }}>
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

/** Head office: the whole system, grouped by what the figures are about. */
function HeadOfficeTiles({ s }: { s: DashboardSummary }) {
  return (
    <>
      {/*
        Today first, and filled rather than tinted.

        Everything below it is a running total — figures that move slowly and
        are read when somebody goes looking for them. Today's are the ones worth
        seeing on arrival, so they open the screen, and the solid fill is what
        separates them from the tinted cards underneath rather than leaving them
        to be found among them.

        Five to a row rather than the four everything else uses: this is one row
        of its own, and it is the row the Laravel dashboard had.
      */}
      <Typography variant="h2" sx={{ mt: 0, mb: 1 }}>
        Today
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today collect"
            value={n(s.orders.today)}
            fill="brand"
            solid
            icon={TodayIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's sale"
            value={money(s.money.sale_today)}
            fill="brand"
            solid
            icon={SaleIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's paid"
            value={money(s.money.paid_today)}
            fill="settled"
            solid
            icon={PaidIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's dues"
            value={money(s.money.dues_today)}
            fill={owed(s.money.dues_today)}
            solid
            icon={DuesIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's active"
            value={n(s.orders.active_today)}
            fill="waiting"
            solid
            icon={ActiveIcon}
          />
        </Grid>
      </Grid>

      <Typography variant="h2" sx={{ mt: 0, mb: 1 }}>
        Account
      </Typography>
      <Grid container spacing={2}>
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
          <Tile label="Smart report" value={n(s.cards.smart)} fill="brand" icon={SmartCardIcon} />
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
          <Tile label="Active order" value={n(s.orders.active)} fill="waiting" icon={ActiveIcon} />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Total sale" value={money(s.money.sale)} fill="brand" icon={SaleIcon} />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Paid amount" value={money(s.money.paid)} fill="settled" icon={PaidIcon} />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Dues amount"
            value={money(s.money.dues)}
            fill={owed(s.money.dues)}
            icon={DuesIcon}
          />
        </Grid>
        {/*
          Certificates issued, all of them. It used to sit under Today, where it
          was the only figure in the group that was not today's.
        */}
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

      <Typography variant="h2" sx={{ mt: 2.5, mb: 1 }}>
        Wallet
      </Typography>
      <Grid container spacing={2}>
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

      <Typography variant="h2" sx={{ mt: 2.5, mb: 1 }}>
        People
      </Typography>
      <Grid container spacing={2}>
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
          <Tile label="Total employee" value={n(s.people.employees)} fill="brand" icon={StaffIcon} />
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
    </>
  );
}

/**
 * A laboratory's own dashboard, carried over from `Lab/dashboard.blade.php`.
 *
 * Every tile keeps the label and the colour it had there, in the same order,
 * because the people reading it read the row by its colour before they read the
 * labels. The one departure is the order of the two groups: today's figures
 * come first here, as they now do for head office, rather than sitting below
 * twelve running totals.
 */
function LaboratoryTiles({
  s,
  lab,
}: {
  s: DashboardSummary;
  lab: NonNullable<DashboardSummary['lab']>;
}) {
  // As the blade computed it: everything billed, less everything the staff have
  // taken in. Floored, because collecting more than has been billed is a credit
  // rather than a debt.
  const dues = Math.max(0, s.money.sale - lab.collected);

  return (
    <>
      <Typography variant="h2" sx={{ mt: 0, mb: 1 }}>
        Today's my performance
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today collect"
            value={n(lab.today.cards_ordered)}
            note="cards"
            fill="brand"
            solid
            icon={TodayIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's sale"
            value={money(lab.today.sale)}
            fill="brand"
            solid
            icon={SaleIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's paid"
            value={money(lab.today.paid)}
            fill="settled"
            solid
            icon={PaidIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's dues"
            value={money(lab.today.dues)}
            fill={owed(lab.today.dues)}
            solid
            icon={DuesIcon}
          />
        </Grid>
        <Grid size={TODAY_CELL}>
          <Tile
            label="Today's active"
            value={n(s.orders.active_today)}
            fill="waiting"
            solid
            icon={ActiveIcon}
          />
        </Grid>
      </Grid>

      <Typography variant="h2" sx={{ mt: 0, mb: 1 }}>
        Account
      </Typography>
      <Grid container spacing={2}>
        <Grid size={CELL}>
          <Tile
            label="Total collected"
            value={n(lab.cards_ordered)}
            note="cards"
            fill="brand"
            icon={OrdersIcon}
          />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Complete tested"
            value={n(lab.cards_generated)}
            fill="settled"
            icon={DeliveredIcon}
          />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Smart report"
            value={n(lab.smart_generated)}
            fill="brand"
            icon={SmartCardIcon}
          />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Classic report"
            value={n(lab.classic_generated)}
            fill="brand"
            icon={ClassicCardIcon}
          />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Active orders"
            value={n(s.orders.active)}
            fill="waiting"
            icon={ActiveIcon}
            to="/orders?status=preparing"
          />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Total sale" value={money(s.money.sale)} fill="brand" icon={SaleIcon} />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Paid amount" value={money(lab.collected)} fill="settled" icon={PaidIcon} />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Dues amount" value={money(dues)} fill={owed(dues)} icon={DuesIcon} />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Total employee" value={n(s.people.employees)} fill="brand" icon={StaffIcon} />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Employee wallet"
            value={money(lab.employee_wallet)}
            note="held by staff"
            fill="brand"
            icon={WalletIcon}
          />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="My wallet"
            value={money(lab.my_wallet)}
            fill="brand"
            icon={WalletIcon}
            to="/wallet"
          />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Admin commission"
            value={money(lab.admin_commission)}
            fill={owed(lab.admin_commission)}
            icon={CommissionIcon}
          />
        </Grid>
      </Grid>
    </>
  );
}
