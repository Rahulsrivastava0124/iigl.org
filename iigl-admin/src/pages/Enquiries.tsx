import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import OpenIcon from '@mui/icons-material/PlayCircleOutlined';
import CloseIcon from '@mui/icons-material/CheckCircleOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  ConfirmDialog,
  FormPanel,
  IconAction,
  Pager,
  Panel,
  RowActions,
  SearchField,
  StateChip,
  TableFrame,
  Tile,
} from '../components/ui';
import type { Paged } from '../lib/api';
import type { Tone } from '../components/ui';

type Kind = 'ask' | 'visit' | 'lead' | 'complaint';
type Status = 'new' | 'open' | 'closed';

/**
 * The tabs are the old Laravel sidebar's Enquiry entries — Enquiry from Ask Me,
 * Visitor's Diary, Lead followup, Complain — which were four dead links over no
 * table. One table with a `kind` here: they differ in what they are about, not
 * in what gets recorded.
 */
const TABS: Array<{ id: Kind | 'all'; label: string; note: string }> = [
  { id: 'all', label: 'All', note: 'Everything that came in, newest and still open first.' },
  { id: 'ask', label: 'Ask me', note: 'Questions from the website and the phone.' },
  { id: 'visit', label: "Visitor's diary", note: 'People who came to the laboratory.' },
  { id: 'lead', label: 'Lead followup', note: 'Work worth chasing.' },
  { id: 'complaint', label: 'Complaints', note: 'Something went wrong and somebody said so.' },
];

/**
 * New is the tone that asks for attention; open is in hand; closed is done.
 *
 * `refused` is deliberately not used here — red is what the panel says for a
 * declined transaction or a deleted record, and an enquiry nobody has picked up
 * yet is waiting, not refused.
 */
const STATE: Record<Status, { tone: Tone; label: string }> = {
  new: { tone: 'waiting', label: 'New' },
  open: { tone: 'plain', label: 'Open' },
  closed: { tone: 'settled', label: 'Closed' },
};

const KIND_LABEL: Record<Kind, string> = {
  ask: 'Ask me',
  visit: 'Visit',
  lead: 'Lead',
  complaint: 'Complaint',
};

interface Enquiry {
  id: number;
  kind: Kind;
  name: string;
  mobile: string;
  email: string | null;
  subject: string | null;
  message: string | null;
  source: string | null;
  status: Status;
  remark: string | null;
  created_at: string | null;
}

interface Summary {
  kinds: Record<Kind, number>;
  statuses: Record<Status, number>;
  waiting: number;
}

const BLANK = {
  id: undefined as number | undefined,
  kind: 'ask' as Kind,
  name: '',
  mobile: '',
  email: '',
  subject: '',
  message: '',
  source: '',
  remark: '',
};

export default function Enquiries() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as Kind | null) ?? 'all';
  const status = params.get('status') as Status | null;
  const page = Number(params.get('page') ?? 1);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (kind !== 'all') query.set('kind', kind);
  if (status) query.set('status', status);
  if (term.trim()) query.set('q', term.trim());

  const source = useFetch<Paged<Enquiry>>(`/enquiries?${query}`);
  const summary = useFetch<{ data: Summary }>('/enquiries/summary');
  const rows = source.data?.data ?? [];
  const totals = summary.data?.data;

  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [deleting, setDeleting] = useState<Enquiry | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: { kind?: string; status?: string | null; page?: number }) => {
    const q: Record<string, string> = {};
    const k = next.kind ?? (kind === 'all' ? '' : kind);
    const s = next.status === undefined ? (status ?? '') : (next.status ?? '');
    if (k) q.kind = k;
    if (s) q.status = s;
    if (next.page && next.page > 1) q.page = String(next.page);
    setParams(q);
  };

  const set = (key: keyof typeof BLANK, v: string) =>
    setForm((f) => (f ? { ...f, [key]: v } : f));

  const reload = () => {
    source.reload();
    summary.reload();
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = {
        kind: form.kind,
        name: form.name,
        mobile: form.mobile,
        email: form.email,
        subject: form.subject,
        message: form.message,
        source: form.source,
        remark: form.remark,
      };
      if (form.id) {
        await api.patch(`/enquiries/${form.id}`, body);
        toast.ok('Enquiry updated.');
      } else {
        await api.post('/enquiries', body);
        toast.ok(`Enquiry from ${form.name} recorded.`);
      }
      setForm(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const move = async (e: Enquiry, next: Status) => {
    try {
      await api.patch(`/enquiries/${e.id}`, { status: next });
      toast.ok(next === 'closed' ? `Closed the enquiry from ${e.name}.` : `Picked up ${e.name}.`);
      reload();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/enquiries/${deleting.id}`);
      toast.ok('Enquiry deleted.');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const current = TABS.find((t) => t.id === kind) ?? TABS[0];

  return (
    <>
      {totals && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <Tile
            label="Waiting on you"
            value={String(totals.waiting)}
            note="new and open"
            tone={totals.waiting > 0 ? 'waiting' : 'settled'}
          />
          <Tile label="New" value={String(totals.statuses.new)} />
          <Tile label="Open" value={String(totals.statuses.open)} />
          <Tile label="Closed" value={String(totals.statuses.closed)} />
          <Tile label="Complaints" value={String(totals.kinds.complaint)} />
        </div>
      )}

      <Tabs
        value={kind}
        onChange={(_, v) => go({ kind: v === 'all' ? '' : v, page: 1 })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} />
        ))}
      </Tabs>

      {form && (
        <FormPanel
          title={form.id ? 'Edit enquiry' : 'Record an enquiry'}
          onClose={() => setForm(null)}
          onSubmit={save}
          busy={busy}
        >
          <TextField
            select
            label="Kind"
            value={form.kind}
            onChange={(e) => set('kind', e.target.value)}
          >
            {TABS.filter((t) => t.id !== 'all').map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
          <TextField
            label="Mobile number"
            value={form.mobile}
            onChange={(e) => set('mobile', e.target.value)}
            required
          />
          <TextField label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <TextField
            label="Subject"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
          />
          <TextField
            label="Came in by"
            value={form.source}
            onChange={(e) => set('source', e.target.value)}
            helperText="Website, phone, walk-in."
          />
          <TextField
            label="What they said"
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            multiline
            minRows={2}
            sx={{ gridColumn: '1 / -1' }}
          />
          <TextField
            label="Remark"
            value={form.remark}
            onChange={(e) => set('remark', e.target.value)}
            multiline
            minRows={2}
            sx={{ gridColumn: '1 / -1' }}
          />
        </FormPanel>
      )}

      <Panel
        title="Enquiries"
        count={source.data ? `${source.data.meta.total.toLocaleString()} enquiries` : 'Loading…'}
        footer={<Pager meta={source.data?.meta} onPage={(n) => go({ page: n })} />}
        actions={
          <>
            <TextField
              select
              label="Status"
              value={status ?? ''}
              onChange={(e) => go({ status: e.target.value || null, page: 1 })}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="new">New</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
            </TextField>
            <SearchField
              placeholder="Name, mobile, subject…"
              value={search}
              onChange={(v) => {
                setSearch(v);
                go({ page: 1 });
              }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setForm({ ...BLANK, kind: kind === 'all' ? 'ask' : kind })}
            >
              Record an enquiry
            </Button>
          </>
        }
      >
        <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>SN.</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Received</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((e, index) => (
                <TableRow key={e.id} hover>
                  <TableCell className="mono">{index + 1}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>{e.name}</TableCell>
                  <TableCell className="mono">{e.mobile}</TableCell>
                  <TableCell>{KIND_LABEL[e.kind] ?? e.kind}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 200 }}>
                    {e.subject ?? e.message?.slice(0, 60) ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StateChip {...(STATE[e.status] ?? { tone: 'plain', label: e.status })} />
                  </TableCell>
                  <TableCell>{e.created_at?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell>
                    <RowActions>
                      {e.status !== 'closed' && (
                        <IconAction
                          label={e.status === 'new' ? 'Pick this up' : 'Close it'}
                          icon={e.status === 'new' ? OpenIcon : CloseIcon}
                          onClick={() => move(e, e.status === 'new' ? 'open' : 'closed')}
                        />
                      )}
                      <IconAction
                        label="Edit enquiry"
                        icon={EditIcon}
                        onClick={() =>
                          setForm({
                            id: e.id,
                            kind: e.kind,
                            name: e.name,
                            mobile: e.mobile,
                            email: e.email ?? '',
                            subject: e.subject ?? '',
                            message: e.message ?? '',
                            source: e.source ?? '',
                            remark: e.remark ?? '',
                          })
                        }
                      />
                      <IconAction
                        label="Delete enquiry"
                        icon={DeleteIcon}
                        danger
                        onClick={() => setDeleting(e)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {current.note} The website's own contact form does not post here yet — an unauthenticated
        write endpoint needs a rate limit and a captcha decision first, so these are entered by hand
        for now.
      </Typography>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Enquiry"
        message={<>Are you sure you want to delete the enquiry from <strong>{deleting?.name}</strong>?</>}
        warning="This action cannot be undone."
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        confirmLabel="Delete"
        confirmIcon={DeleteIcon}
        busy={busy}
      />
    </>
  );
}
