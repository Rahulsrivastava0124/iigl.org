import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import IssueIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  Dialog,
  IconAction,
  Pager,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
} from '../components/ui';
import type { Paged } from '../lib/api';

interface Certificate {
  id: number;
  certificate_no: string;
  student_id: number;
  student_course_id: number;
  student_name: string | null;
  registration_no: string | null;
  course_name: string | null;
  batch: string | null;
  issued_on: string | null;
  grade: string | null;
  remark: string | null;
}

interface Pending {
  id: number;
  student_id: number;
  student_name: string | null;
  registration_no: string | null;
  course_name: string | null;
  batch: string | null;
  completed_on: string | null;
  result: string | null;
}

/**
 * Stage five: the certificate a student takes away.
 *
 * Not the gemstone certificates under Operations — those are the laboratory's
 * reports on stones. These are course certificates, numbered `IIGL-C-YYYY-NNNN`
 * so that the two cannot be confused when they are read side by side.
 *
 * Issued against a completed enrolment, which is why the screen opens with what
 * is waiting: a finished course with nobody's certificate against it is the
 * only thing here that needs doing.
 */
export default function StudentCertificates() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());

  const source = useFetch<Paged<Certificate>>(`/student-certificates?${query}`);
  const pending = useFetch<{ data: Pending[] }>('/student-certificates/pending');
  const rows = source.data?.data ?? [];
  const waiting = pending.data?.data ?? [];

  const [issuing, setIssuing] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [form, setForm] = useState({ issued_on: '', grade: '', remark: '' });
  const [busy, setBusy] = useState(false);

  const reload = () => {
    source.reload();
    pending.reload();
  };

  const issue = async () => {
    if (!issuing) return;
    setBusy(true);
    try {
      const res = await api.post<{ data: { certificate_no: string } }>('/student-certificates', {
        student_course_id: issuing.id,
        issued_on: form.issued_on,
        grade: form.grade,
        remark: form.remark,
      });
      toast.ok(`${res.data.certificate_no} issued to ${issuing.student_name}.`);
      setIssuing(null);
      setForm({ issued_on: '', grade: '', remark: '' });
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/student-certificates/${editing.id}`, form);
      toast.ok(`${editing.certificate_no} updated.`);
      setEditing(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Certificate) => {
    try {
      await api.del(`/student-certificates/${c.id}`);
      toast.ok(`${c.certificate_no} deleted.`);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  /*
   * Two short fields side by side, the long one across both.
   *
   * A date and a one-letter grade do not each need the width of the dialog,
   * and stacking them made a form of three lines out of what reads as two.
   * One column on a phone, where there is no width to share.
   */
  const fields = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
        gap: 2,
        alignItems: 'start',
      }}
    >
      <TextField
        label="Issued on"
        type="date"
        value={form.issued_on}
        onChange={(e) => setForm((f) => ({ ...f, issued_on: e.target.value }))}
        slotProps={{ inputLabel: { shrink: true } }}
        helperText="Today, unless you say otherwise."
      />
      <TextField
        select
        label="Grade"
        value={form.grade}
        onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
        helperText="Optional."
      >
        <MenuItem value="">Not graded</MenuItem>
        {['A+', 'A', 'B', 'C', 'Pass'].map((g) => (
          <MenuItem key={g} value={g}>
            {g}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Remark"
        value={form.remark}
        onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
        multiline
        minRows={2}
        sx={{ gridColumn: '1 / -1' }}
      />
    </Box>
  );

  return (
    <>
      {waiting.length > 0 && (
        <Panel
          title="Waiting for a certificate"
          count={`${waiting.length} finished ${waiting.length === 1 ? 'course' : 'courses'}`}
        >
          <TableFrame loading={pending.loading} error={pending.error} empty={false}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Course</TableCell>
                  <TableCell>Batch</TableCell>
                  <TableCell>Finished</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {waiting.map((w) => (
                  <TableRow key={w.id} hover>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                      {w.student_name}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {w.registration_no}
                      </Typography>
                    </TableCell>
                    <TableCell>{w.course_name}</TableCell>
                    <TableCell>{w.batch ?? '—'}</TableCell>
                    <TableCell>{w.completed_on?.slice(0, 10) ?? '—'}</TableCell>
                    <TableCell>
                      <RowActions>
                        <IconAction
                          label="Issue a certificate"
                          icon={IssueIcon}
                          onClick={() => {
                            setIssuing(w);
                            setForm({ issued_on: '', grade: '', remark: '' });
                          }}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Panel>
      )}

      <Panel
        title="Course certificates"
        count={source.data ? `${source.data.meta.total} issued` : 'Loading…'}
        footer={
          <Pager
            meta={source.data?.meta}
            onPage={(n) => setParams(n > 1 ? { page: String(n) } : {})}
          />
        }
        actions={
          <SearchField
            placeholder="Certificate no, student, course…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setParams({});
            }}
          />
        }
      >
        <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Certificate no</TableCell>
                <TableCell>Student</TableCell>
                <TableCell>Course</TableCell>
                <TableCell>Grade</TableCell>
                <TableCell>Issued</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell className="mono">{c.certificate_no}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                    {c.student_name}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {c.registration_no}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {c.course_name}
                    {c.batch && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {c.batch}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{c.grade ?? '—'}</TableCell>
                  <TableCell>{c.issued_on?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit certificate"
                        icon={EditIcon}
                        onClick={() => {
                          setEditing(c);
                          setForm({
                            issued_on: c.issued_on?.slice(0, 10) ?? '',
                            grade: c.grade ?? '',
                            remark: c.remark ?? '',
                          });
                        }}
                      />
                      <IconAction
                        label="Delete certificate"
                        icon={DeleteIcon}
                        danger
                        onClick={() => remove(c)}
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
        These are course certificates, numbered IIGL-C-YYYY-NNNN — not the gemstone certificates
        under Operations. One is issued per completed enrolment, so a student who takes two courses
        earns two, and the number cannot be edited once it is on a document somebody is holding.
      </Typography>

      {issuing && (
        <Dialog
          title={`Certificate — ${issuing.student_name}`}
          onClose={() => setIssuing(null)}
          onSubmit={issue}
          submitLabel="Issue"
          busy={busy}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            {issuing.course_name}
            {issuing.batch ? `, ${issuing.batch}` : ''} — finished{' '}
            {issuing.completed_on?.slice(0, 10) ?? 'recently'}. The number is issued on save.
          </Typography>
          {fields}
        </Dialog>
      )}

      {editing && (
        <Dialog
          title={editing.certificate_no}
          onClose={() => setEditing(null)}
          onSubmit={save}
          busy={busy}
        >
          {fields}
        </Dialog>
      )}
    </>
  );
}
