import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import { Notice, Pager } from '../components/ui';
import { LedgerTable, LedgerTotals, type LedgerPage } from '../components/Ledger';

/**
 * The wallet: this account's money, and every movement that made it.
 *
 * Reached from the wallet figures on the dashboard — head office's "Current
 * wallet", a laboratory's "My wallet" — which is where somebody looks when the
 * number is not the one they expected. The answer to that is never a total; it
 * is the list of what went in and out, so the wallet *is* the ledger, with the
 * balance stated above it.
 *
 * It used to be a list of approved commission credits, which answered the
 * question for head office alone and left a laboratory clicking through to a
 * screen it was not allowed to open.
 *
 * Both roles read the same endpoint: `/transactions/ledger` scopes to whoever
 * is asking, so nothing here decides what anyone may see.
 */
export default function Wallet() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  const PER_PAGE = 50;
  const ledger = useFetch<{ data: LedgerPage }>(
    `/transactions/ledger?page=${page}&per_page=${PER_PAGE}`,
  );
  const account = ledger.data?.data;
  const entries = account?.entries ?? [];
  const total = account?.total ?? 0;

  return (
    <>
      <LedgerTotals account={account} />

      {/*
        Pending money is money nobody has agreed to yet: it is on the statement,
        marked, but it has not moved the balance. Said once, here, rather than
        left for somebody to work out from a chip in a row.
      */}
      {(account?.pending_out ?? 0) > 0 && (
        <Notice kind="warn" sx={{ mb: 2 }}>
          {(account?.pending_out ?? 0).toLocaleString('en-IN')} is awaiting approval and has not
          been taken off the balance.
        </Notice>
      )}

      <LedgerTable
        entries={entries}
        loading={ledger.loading}
        error={ledger.error}
        title={isSuper(user) ? 'Head office account' : 'Your account'}
        count={ledger.loading ? 'Loading…' : `${total.toLocaleString()} movements`}
        footer={
          <Pager
            meta={{
              page,
              per_page: PER_PAGE,
              total,
              total_pages: Math.max(1, Math.ceil(total / PER_PAGE)),
            }}
            onPage={setPage}
          />
        }
      />

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Credits are money received, debits money sent on. The balance is the running total after
          each approved movement; declined and pending rows appear so the history is complete but
          leave it unchanged.
        </Typography>
      </Box>
    </>
  );
}
