import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Chip,
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
import PrintIcon from '@mui/icons-material/PrintOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { apiUrl } from '../lib/config';
import { messageOf } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  DateField,
  Dialog,
  IconAction,
  DEFAULT_PER_PAGE, Pager,
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
  /** Rows per page. Component state, not a URL parameter: it is how somebody
   * likes to read a list, not which list they are looking at. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  /** Set when opened from a registration: that one student's certificates. */
  const studentId = params.get('student_id');
  /** Paging and searching keep the student filter rather than dropping it. */
  const keep = (extra: Record<string, string> = {}) =>
    setParams({ ...(studentId ? { student_id: studentId } : {}), ...extra });

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (term.trim()) query.set('q', term.trim());
  if (studentId) query.set('student_id', studentId);

  const source = useFetch<Paged<Certificate>>(`/student-certificates?${query}`);
  const pending = useFetch<{ data: Pending[] }>('/student-certificates/pending');
  const rows = source.data?.data ?? [];
  const waiting = (pending.data?.data ?? []).filter(
    (w) => !studentId || String(w.student_id) === studentId,
  );
  const who = rows[0]?.student_name ?? waiting[0]?.student_name ?? 'One student';

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
      <DateField
        label="Issued on"
        value={form.issued_on}
        onChange={(value) => setForm((f) => ({ ...f, issued_on: value }))}
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
            onPage={(n) => keep(n > 1 ? { page: String(n) } : {})}
            onPerPage={(n) => {
              setPerPage(n);
              keep();
            }}
          />
        }
        actions={
          <>
            {studentId && <Chip label={`${who} only`} onDelete={() => setParams({})} />}
            <SearchField
              placeholder="Certificate no, student, course…"
              value={search}
              onChange={(v) => {
                setSearch(v);
                keep();
              }}
            />
          </>
        }
      >
        <TableFrame
          loading={source.loading}
          error={source.error}
          empty={rows.length === 0}
          emptyText={
            studentId
              ? 'No certificate issued to this student yet. One is issued when an enrolment is completed.'
              : undefined
          }
        >
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
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>{c.student_name}</TableCell>
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
                      {/*
                        Opened rather than fetched: the response is a PDF, and a
                        plain navigation lets the browser's own viewer print it,
                        which is the one place a print dialog belongs. The
                        session cookie rides along because the API is the same
                        site as the panel.

                        A course with no design uploaded answers 404 with a
                        sentence saying so, which the viewer shows. That is the
                        intended path: the fix is an upload on the course.
                      */}
                      <IconAction
                        label="Print certificate"
                        icon={PrintIcon}
                        onClick={() =>
                          window.open(
                            apiUrl(`/student-certificates/${c.id}/print`),
                            '_blank',
                            'noopener',
                          )
                        }
                      />
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
