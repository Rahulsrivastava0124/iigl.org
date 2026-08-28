import { Box, CircularProgress, Grid } from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { Notice, PageHead, Panel, Tile, money } from '../components/ui';
import type { DashboardSummary } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdmin } from '../lib/portal';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useFetch<{ data: DashboardSummary }>('/dashboard/summary');
  const s = data?.data;

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle={isAdmin(user) ? 'Every laboratory.' : 'Your laboratory only.'}
      />

      {error && <Notice kind="error">{error}</Notice>}
      {loading && (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={26} />
        </Box>
      )}

      {s && (
        <>
          <Panel title="Orders">
            <Grid container spacing={1.5} sx={{ p: 2 }}>
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
          </Panel>

          <Box sx={{ mt: 3 }}>
            <Panel title="Money">
              <Grid container spacing={1.5} sx={{ p: 2 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Tile label="Billed" value={money(s.money.sale)} note="total" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Tile label="Collected" value={money(s.money.paid)} note="total" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Tile
                  label="Outstanding"
                  value={money(s.money.dues)}
                  note="dues"
                  tone={s.money.dues > 0 ? 'waiting' : 'settled'}
                />
            </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Tile label="Billed today" value={money(s.money.sale_today)} />
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
