import { Alert, Box, CircularProgress, Grid, Paper, Typography } from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { PageHead, money } from '../components/ui';
import type { DashboardSummary } from '../lib/api';
import { useAuth } from '../lib/auth';

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography className="tabular" sx={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
        {value}
        {note && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
            {note}
          </Typography>
        )}
      </Typography>
    </Paper>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useFetch<{ data: DashboardSummary }>('/dashboard/summary');
  const s = data?.data;

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle={user?.roleId === 1 ? 'Every laboratory.' : 'Your laboratory only.'}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={26} />
        </Box>
      )}

      {s && (
        <>
          <Typography variant="h2" sx={{ mb: 1.5 }}>
            Orders
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Tile label="Total" value={s.orders.total.toLocaleString()} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Tile label="In progress" value={s.orders.active.toLocaleString()} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Tile label="Delivered" value={s.orders.delivered.toLocaleString()} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Tile label="Taken today" value={s.orders.today.toLocaleString()} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Tile label="Certificates" value={s.reports.total.toLocaleString()} />
            </Grid>
          </Grid>

          <Typography variant="h2" sx={{ mb: 1.5 }}>
            Money
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Tile label="Billed" value={money(s.money.sale)} note="total" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Tile label="Collected" value={money(s.money.paid)} note="total" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Tile label="Outstanding" value={money(s.money.dues)} note="dues" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Tile label="Billed today" value={money(s.money.sale_today)} />
            </Grid>
          </Grid>

          {s.money.paid > s.money.sale && (
            <Alert severity="warning" sx={{ mt: 3 }}>
              Collected exceeds billed by {money(s.money.paid - s.money.sale)}. Most orders carry no
              billed total in the legacy data, so this figure is understated rather than the
              collection being wrong. It resolves as orders are settled through this system.
            </Alert>
          )}
        </>
      )}
    </>
  );
}
