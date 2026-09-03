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
import ViewIcon from '@mui/icons-material/VisibilityOutlined';
import FollowIcon from '@mui/icons-material/PhoneInTalkOutlined';
import OpenIcon from '@mui/icons-material/PlayCircleOutlined';
import CloseIcon from '@mui/icons-material/CheckCircleOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import SourceField from '../components/SourceField';
import { useToast } from '../components/Toast';
import { BRAND } from '../lib/theme';
import { EnquiryViewDialog, FollowupDialog } from '../components/EnquiryFollowups';
import { hint, today, ConfirmDialog, DateField, FormPanel, IconAction, Pager, Panel, RowActions, SearchField, StateChip, TableFrame, Tile, ToneAction } from '../components/ui';
import type { Paged } from '../lib/api';
import type { Tone } from '../components/ui';

type Kind = 'ask' | 'visit' | 'lead' | 'complaint' | 'laboratory';
type Status = 'new' | 'open' | 'closed';

/**
 * The tabs are the old Laravel sidebar's Enquiry entries — Enquiry from Ask Me,
 * Visitor's Diary, Lead followup, Complain — which were four dead links over no
 * table. One table with a `kind` here: they differ in what they are about, not
 * in what gets recorded.
 *
 * Laboratory is the fifth, and new: somebody asking about opening one. It is a
 * tab rather than a filter because it is a book somebody sits down to work,
 * the same as the four beside it — a filter is for narrowing a list you are
 * already looking at.
 */
const TABS: Array<{ id: Kind | 'all'; label: string; note: string }> = [
  { id: 'all', label: 'All', note: 'Everything that came in, newest and still open first.' },
  { id: 'ask', label: 'Ask me', note: 'Questions from the website and the phone.' },
  { id: 'visit', label: "Visitor's diary", note: 'People who came to the laboratory.' },
  { id: 'lead', label: 'Lead followup', note: 'Work worth chasing.' },
  { id: 'complaint', label: 'Complaints', note: 'Something went wrong and somebody said so.' },
  { id: 'laboratory', label: 'Laboratory', note: 'People asking about opening a laboratory.' },
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
  laboratory: 'Laboratory',
};

/** Just enough of a course to name it in the select. */
interface Course {
  id: number;
  name: string;
}

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
  course_id: number | null;
  course_interested: string | null;
  /** When it came in, as somebody recorded it. Null falls back to created_at. */
  enquiry_date: string | null;
  created_at: string | null;
  /** How many times somebody has tried, and when they last did. */
  followups: number;
  last_followup_at: string | null;
  /** When the next attempt is due, from the newest follow-up. */
  follow_up_on: string | null;
}

interface Summary {
  kinds: Record<Kind, number>;
  statuses: Record<Status, number>;
  waiting: number;
}

const BLANK = {
  id: undefined as number | undefined,
  kind: 'ask' as Kind,
  status: 'new' as Status,
  course_id: '',
  course_interested: '',
  enquiry_date: '',
  follow_up_on: '',
  name: '',
  mobile: '',
  email: '',
  subject: '',
  message: '',
  source: '',
  remark: '',
};

/**
 * The general enquiry book.
 *
 * `fixedKind` pins the screen to one kind and hides the kind tabs and the
 * summary tiles, so it can be embedded as somebody else's tab — which is how
 * laboratory enquiries are reached, from the Enquiry screen's Laboratory tab.
 * Everything else — status, search, paging, follow-ups — works the same
 * either way.
 */
export default function Enquiries({ fixedKind }: { fixedKind?: Kind } = {}) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = fixedKind ?? ((params.get('kind') as Kind | null) ?? 'all');
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
  // Only the pinned form offers a course, so only it asks for the list.
  const courses = useFetch<Paged<Course>>(fixedKind ? '/courses?active=1&per_page=100' : null);
  const rows = source.data?.data ?? [];
  const totals = summary.data?.data;
  const courseList = courses.data?.data ?? [];

  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [deleting, setDeleting] = useState<Enquiry | null>(null);
  const [following, setFollowing] = useState<Enquiry | null>(null);
  const [viewing, setViewing] = useState<Enquiry | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: { kind?: string; status?: string | null; page?: number }) => {
    const q: Record<string, string> = {};
    const k = next.kind ?? (kind === 'all' ? '' : kind);
    const s = next.status === undefined ? (status ?? '') : (next.status ?? '');
    // Embedded, the kind is the host tab's business and stays out of the URL —
    // writing it would put `?kind=laboratory` beside `?tab=laboratory`, two
    // parameters for one fact that can then disagree.
    if (k && !fixedKind) q.kind = k;
    // Whose tab this is, when it is somebody's. Dropped here and the host
    // switches back to its first tab the moment a status is picked.
    const tab = params.get('tab');
    if (tab) q.tab = tab;
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
        status: form.status,
        course_id: form.course_id || null,
        course_interested: form.course_interested,
        enquiry_date: form.enquiry_date,
        follow_up_on: form.follow_up_on,
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
      {!fixedKind && totals && (
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

      {!fixedKind && (
        <Tabs
          value={kind}
          onChange={(_, v) => go({ kind: v === 'all' ? '' : v, page: 1 })}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          {/*
            Laboratory is not offered here. It has a home of its own — the
            Laboratory tab on the Enquiry screen — and a second door to the
            same rows is a second place for somebody to look.
          */}
          {TABS.filter((t) => t.id !== 'laboratory').map((t) => (
            <Tab key={t.id} value={t.id} label={t.label} />
          ))}
        </Tabs>
      )}

      {form && (
        <FormPanel
          // Pinned, this is the same form as the course enquiry one and says
          // so the same way. Unpinned it keeps its own wording, where "New
          // enquiry" would not say which of five kinds is being recorded.
          title={
            fixedKind
              ? form.id
                ? `Edit enquiry — ${form.name}`
                : 'New enquiry'
              : form.id
                ? 'Edit enquiry'
                : 'Record an enquiry'
          }
          onClose={() => setForm(null)}
          onSubmit={save}
          busy={busy}
        >
          {/*
            Pinned to one kind, the form does not ask which. The tab has
            already said — offering the other four is a question with one
            right answer and four ways to file the record where nobody will
            look for it. `form.kind` still carries the value; it is simply not
            somebody's to change here, the same way the course enquiry form
            never asks what kind of enquiry it is.
          */}
          {!fixedKind && (
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
          )}
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
          {/*
            Required on this book only. A franchise enquiry is answered with a
            prospectus and a contract, both of which go by email; the other
            four kinds are answered on the phone, and refusing to record a
            walk-in without an address would lose the enquiry entirely.
          */}
          <TextField
            label="Email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            required={Boolean(fixedKind)}
          />
          <TextField
            label="Subject"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
          />
          {/*
            The course pair, as the course enquiry form has it: the one we run
            when we run it, typed free when we do not. Columns added by
            migration 016.
          */}
          {fixedKind && (
            <TextField
              select
              label="Course interested"
              value={form.course_id}
              onChange={(e) => set('course_id', e.target.value)}
              slotProps={hint('Leave blank and type it below if we do not run it yet.', true)}
            >
              <MenuItem value="">Not on the list</MenuItem>
              {courseList.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {fixedKind && (
            <TextField
              label="Other course"
              value={form.course_interested}
              onChange={(e) => set('course_interested', e.target.value)}
            />
          )}
          {/*
            When it came in, which is not when the row was typed: Friday's
            walk-ins get written up on Monday. The column is new — migration
            015 — because the course enquiry book has carried one all along
            and these two forms are meant to ask the same questions.
          */}
          {fixedKind && (
            <DateField
              label="Enquiry date"
              value={form.enquiry_date}
              onChange={(value) => set('enquiry_date', value)}
            />
          )}
          <SourceField
            label="Enquiry source"
            value={form.source}
            onChange={(v) => set('source', v)}
          />
          {/*
            Status and the next attempt's date, in the same places the course
            enquiry form puts them. The unpinned screen moves status from the
            row instead — Pick this up, Close it — and a select there would be
            two controls for one column.
          */}
          {fixedKind && (
            <TextField
              select
              label="Status"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {(Object.keys(STATE) as Status[]).map((id) => (
                <MenuItem key={id} value={id}>
                  {STATE[id].label}
                </MenuItem>
              ))}
            </TextField>
          )}
          {fixedKind && (
            <DateField
              label="Follow up on"
              value={form.follow_up_on}
              onChange={(value) => set('follow_up_on', value)}
            />
          )}
          {/*
            Not on the pinned form: it has a Remark box already, and two
            multiline boxes side by side is a question about where to type
            that nobody can answer from the labels.
          */}
          {!fixedKind && (
            <TextField
              label="What they said"
              value={form.message}
              onChange={(e) => set('message', e.target.value)}
              multiline
              minRows={2}
              sx={{ gridColumn: '1 / -1' }}
            />
          )}
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
            {/*
              "All" is a real value here, not an empty string. A Select renders
              the chosen item's text only when it has a value: at `value=""` it
              draws an empty box whatever the item says, so the option reading
              "All" showed as nothing at all and the filter looked unset.

              Fixed width rather than a minimum, matching the course enquiry
              screen: in a flex header a minimum is a floor to grow from, and
              the select was taking the row off the search field.
            */}
            <TextField
              select
              label="Status"
              value={status ?? 'all'}
              onChange={(e) => go({ status: e.target.value === 'all' ? null : e.target.value, page: 1 })}
              sx={{ width: 160, flexShrink: 0 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="new">New</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
            </TextField>
            <SearchField
              width={340}
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
              // Pinned, the new record is that kind and is dated today, the
              // same as the course enquiry form: an enquiry is written down
              // when it comes in, so today is right nearly every time and
              // typing it is a step that adds nothing.
              onClick={() =>
                setForm({
                  ...BLANK,
                  kind: fixedKind ?? (kind === 'all' ? 'ask' : kind),
                  enquiry_date: fixedKind ? today() : '',
                })
              }
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
                <TableCell>Follow-up</TableCell>
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
                  {/*
                    What has been tried and what is next, together: on a
                    worklist those two decide whether to call, and reading them
                    in different places means reading the row twice.
                  */}
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 130 }}>
                    {e.followups > 0 ? (
                      <>
                        {e.followups} {e.followups === 1 ? 'attempt' : 'attempts'}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {e.follow_up_on
                            ? `next ${String(e.follow_up_on).slice(0, 10)}`
                            : `last ${String(e.last_followup_at ?? '').slice(0, 10)}`}
                        </Typography>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{e.created_at?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell>
                    <RowActions>
                      {/*
                        Following up is the work this screen exists for, so it
                        leads the row and is the one control that keeps its
                        word. The icons follow it.
                      */}
                      {e.status !== 'closed' && (
                        <ToneAction
                          label="Follow"
                          icon={FollowIcon}
                          tone="waiting"
                          size="small"
                          onClick={() => setFollowing(e)}
                          sx={{
                            bgcolor: BRAND.yellow,
                            color: BRAND.navy,
                            '&:hover': { bgcolor: BRAND.yellowDark },
                          }}
                        />
                      )}
                      <IconAction
                        label="View enquiry and its history"
                        icon={ViewIcon}
                        onClick={() => setViewing(e)}
                      />
                      {e.status !== 'closed' && (
                        <IconAction
                          label={e.status === 'new' ? 'Pick this up' : 'Close it'}
                          icon={e.status === 'new' ? OpenIcon : CloseIcon}
                          overflow
                          onClick={() => move(e, e.status === 'new' ? 'open' : 'closed')}
                        />
                      )}
                      <IconAction
                        label="Edit enquiry"
                        overflow
                        icon={EditIcon}
                        onClick={() =>
                          setForm({
                            id: e.id,
                            kind: e.kind,
                            status: e.status,
                            course_id: e.course_id ? String(e.course_id) : '',
                            course_interested: e.course_interested ?? '',
                            enquiry_date: e.enquiry_date?.slice(0, 10) ?? '',
                            follow_up_on: e.follow_up_on?.slice(0, 10) ?? '',
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

      {following && (
        <FollowupDialog
          enquiry={following}
          onClose={() => setFollowing(null)}
          onSaved={() => {
            source.reload();
            summary.reload();
          }}
        />
      )}

      {viewing && <EnquiryViewDialog enquiry={viewing} onClose={() => setViewing(null)} />}

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
