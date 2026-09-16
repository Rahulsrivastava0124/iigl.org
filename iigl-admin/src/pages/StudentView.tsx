import { useState, type ComponentType, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Grid,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import IssueIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import EmailIcon from '@mui/icons-material/EmailOutlined';
import PlaceIcon from '@mui/icons-material/PlaceOutlined';
import CalendarIcon from '@mui/icons-material/EventOutlined';
import CoursesIcon from '@mui/icons-material/SchoolOutlined';
import PaidIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import DuesIcon from '@mui/icons-material/PendingActionsOutlined';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { useFetch } from '../lib/useFetch';
import { fileUrl } from '../lib/config';
import { isPdf } from '../components/FilePreview';
import CertificateDialog, { downloadCertificate } from '../components/CertificateDialog';
import { IconAction, Panel, RowActions, StateChip, TableFrame, Tile, TILE_CELL, money } from '../components/ui';
import type { Tone } from '../components/ui';
import type { Paged } from '../lib/api';

interface Student {
  id: number;
  registration_no: string;
  name: string;
  father_name: string | null;
  dob: string | null;
  gender: string | null;
  mobile: string;
  alt_mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  photo: string | null;
  id_proof: string | null;
  qualification_doc: string | null;
  registration_date: string | null;
  course_id: number | null;
  status: string;
  remark: string | null;
}

interface Enrolment {
  id: number;
  student_name: string | null;
  course_name: string | null;
  batch: string | null;
  start_date: string | null;
  end_date: string | null;
  fee: string;
  discount_amount: string;
  discount_reason: string | null;
  final_fee: string;
  gst_amount?: string | null;
  fee_paid: string;
  status: string;
  completed_on: string | null;
  certificate_id: number | null;
  certificate_no: string | null;
  certificate_file: string | null;
}

interface Certificate {
  id: number;
  certificate_no: string;
  student_name: string | null;
  course_name: string | null;
  batch: string | null;
  issued_on: string | null;
  grade: string | null;
  remark: string | null;
  file: string | null;
}

const REGISTRATION: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: 'waiting', label: 'Pending' },
  registered: { tone: 'plain', label: 'Registered' },
  active: { tone: 'settled', label: 'Active' },
};

const ENROLMENT: Record<string, { tone: Tone; label: string }> = {
  upcoming: { tone: 'plain', label: 'Upcoming' },
  ongoing: { tone: 'waiting', label: 'Ongoing' },
  completed: { tone: 'settled', label: 'Completed' },
};

/** `2003-10-24` as `24 Oct 2003`; a dash when there is no date. */
const longDate = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(value.slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Whole years since a date of birth. */
const ageOf = (dob: string | null) => {
  if (!dob) return null;
  const born = new Date(dob.slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) years -= 1;
  return years >= 0 ? years : null;
};

/** Names are typed in any case at the desk; they read in title case. */
const titleCase = (value: string | null | undefined) =>
  value ? value.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/\s+,/g, ',') : null;

/** One label and its value, a row of a details card. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{
        py: 1.25,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ width: { sm: 120 }, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        component="div"
        variant="body2"
        sx={{ fontWeight: empty ? 400 : 500, color: empty ? 'text.disabled' : 'text.primary', overflowWrap: 'anywhere', minWidth: 0 }}
      >
        {empty ? 'Not given' : children}
      </Typography>
    </Stack>
  );
}

/** A titled card of rows. */
function DetailsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title} sx={{ height: '100%' }}>
      <Box sx={{ px: 2, py: 0.5 }}>{children}</Box>
    </Panel>
  );
}

/** A way to reach them, under the name: an icon and a line of text. */
function Contact({ icon: Icon, children }: { icon: ComponentType<SvgIconProps>; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Icon sx={{ fontSize: 18, color: 'text.secondary' }} />
      <Typography component="div" variant="body2" noWrap sx={{ minWidth: 0 }}>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * One student, everything about them on a page: the registration, the papers
 * they brought, every course they have been enrolled on with its fee, and
 * every certificate — downloadable, or issued from here once a course is done.
 */
export default function StudentView() {
  const { id } = useParams();
  const student = useFetch<{ data: Student }>(`/students/${id}`);
  const courses = useFetch<Paged<{ id: number; name: string }>>('/courses?per_page=200');
  const enrolments = useFetch<Paged<Enrolment>>(`/courses/enrolments?student_id=${id}&per_page=100`);
  const certificates = useFetch<Paged<Certificate>>(`/student-certificates?student_id=${id}&per_page=100`);

  const [issuing, setIssuing] = useState<Enrolment | null>(null);
  const [editing, setEditing] = useState<Certificate | null>(null);

  const s = student.data?.data;
  const enrolRows = enrolments.data?.data ?? [];
  const certRows = certificates.data?.data ?? [];

  const reload = () => {
    enrolments.reload();
    certificates.reload();
  };

  const payable = (e: Enrolment) => Number(e.final_fee) + Number(e.gst_amount ?? 0);
  const due = (e: Enrolment) => payable(e) - Number(e.fee_paid);
  const totalPayable = enrolRows.reduce((t, e) => t + payable(e), 0);
  const totalPaid = enrolRows.reduce((t, e) => t + Number(e.fee_paid), 0);

  /** The signed file when one was attached, else the sheet printed on the course artwork. */
  const download = (c: { id: number; file: string | null }) => {
    const url = c.file ? fileUrl(c.file) : null;
    if (url) window.open(url, '_blank', 'noopener');
    else downloadCertificate(c.id);
  };

  if (student.error) {
    return (
      <Panel title="Student">
        <Typography color="error" variant="body2">
          {student.error}
        </Typography>
      </Panel>
    );
  }

  const appliedFor = courses.data?.data.find((c) => c.id === s?.course_id)?.name;
  const cityLine = s ? [titleCase(s.city), s.state].filter(Boolean).join(', ') : '';
  const documents = s
    ? [
        { label: 'Photo', path: s.photo },
        { label: 'ID proof', path: s.id_proof },
        { label: 'Qualification', path: s.qualification_doc },
      ].filter((d): d is { label: string; path: string } => Boolean(d.path))
    : [];
  const totalDue = Math.max(0, totalPayable - totalPaid);
  const age = ageOf(s?.dob ?? null);

  if (!s) {
    return (
      <Panel title="Student">
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Loading…
        </Typography>
      </Panel>
    );
  }

  return (
    <>
      {/* ------------------------------------------------ who they are */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2.5}
          sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}
        >
          <Avatar
            src={fileUrl(s.photo) ?? undefined}
            alt=""
            sx={{ width: 84, height: 84, fontSize: 30, bgcolor: 'primary.main', border: 3, borderColor: 'background.paper', boxShadow: 2 }}
          >
            {s.name.charAt(0).toUpperCase()}
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 700 }}>
                {titleCase(s.name)}
              </Typography>
              <StateChip {...(REGISTRATION[s.status] ?? { tone: 'plain', label: s.status })} />
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
              <Chip size="small" variant="outlined" label={s.registration_no} className="mono" />
              {appliedFor && (
                <Chip size="small" variant="outlined" icon={<CoursesIcon />} label={appliedFor} />
              )}
            </Stack>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 0.75, md: 3 }}
              sx={{ mt: 1.5, minWidth: 0 }}
            >
              <Contact icon={PhoneIcon}>
                <Link href={`tel:${s.mobile}`} underline="hover" color="inherit">
                  {s.mobile}
                </Link>
              </Contact>
              {s.email && (
                <Contact icon={EmailIcon}>
                  <Link href={`mailto:${s.email}`} underline="hover" color="inherit">
                    {s.email}
                  </Link>
                </Contact>
              )}
              {cityLine && <Contact icon={PlaceIcon}>{cityLine}</Contact>}
              {s.registration_date && (
                <Contact icon={CalendarIcon}>Registered {longDate(s.registration_date)}</Contact>
              )}
            </Stack>
          </Box>

          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            component={RouterLink}
            to={`/students/${s.id}/edit`}
            sx={{ flexShrink: 0 }}
          >
            Edit
          </Button>
        </Stack>
      </Paper>

      {/* ------------------------------------------------ where they stand */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={TILE_CELL}>
          <Tile
            label="Courses"
            value={String(enrolRows.length)}
            note={enrolRows.length === 1 ? 'enrolment' : 'enrolments'}
            icon={CoursesIcon}
            fill="brand"
          />
        </Grid>
        <Grid size={TILE_CELL}>
          <Tile label="Fee paid" value={money(totalPaid)} note={`of ${money(totalPayable)}`} icon={PaidIcon} fill="settled" />
        </Grid>
        <Grid size={TILE_CELL}>
          <Tile
            label="Fee due"
            value={money(totalDue)}
            note={totalDue > 0 ? 'still to collect' : 'nothing owed'}
            icon={DuesIcon}
            fill={totalDue > 0 ? 'waiting' : undefined}
          />
        </Grid>
        <Grid size={TILE_CELL}>
          <Tile
            label="Certificates"
            value={String(certRows.length)}
            note={certRows.length === 1 ? 'issued' : 'issued'}
            icon={IssueIcon}
          />
        </Grid>
      </Grid>

      {/* ------------------------------------------------ the record */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <DetailsCard title="Personal details">
            <Row label="Full name">{titleCase(s.name)}</Row>
            <Row label="Father's name">{titleCase(s.father_name)}</Row>
            <Row label="Date of birth">
              {s.dob ? `${longDate(s.dob)}${age !== null ? ` (${age} yrs)` : ''}` : null}
            </Row>
            <Row label="Gender">{titleCase(s.gender)}</Row>
          </DetailsCard>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <DetailsCard title="Contact">
            <Row label="Mobile">{s.mobile}</Row>
            <Row label="Alternate mobile">{s.alt_mobile}</Row>
            <Row label="Email">{s.email}</Row>
            <Row label="Address">
              {s.address || s.city || s.state || s.pincode ? (
                <>
                  {s.address && <Box>{titleCase(s.address)}</Box>}
                  <Box>
                    {[titleCase(s.city), s.state].filter(Boolean).join(', ')}
                    {s.pincode ? ` – ${s.pincode}` : ''}
                  </Box>
                </>
              ) : null}
            </Row>
          </DetailsCard>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <DetailsCard title="Registration">
            <Row label="Registration no">
              <span className="mono">{s.registration_no}</span>
            </Row>
            <Row label="Registered on">{longDate(s.registration_date)}</Row>
            <Row label="Course applied for">{appliedFor}</Row>
            <Row label="Status">
              <StateChip {...(REGISTRATION[s.status] ?? { tone: 'plain', label: s.status })} />
            </Row>
            <Row label="Remark">{s.remark}</Row>
          </DetailsCard>
        </Grid>
      </Grid>

      {/* ------------------------------------------------ the papers they brought */}
      <Panel title="Documents" sx={{ mb: 2 }}>
        {documents.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No documents uploaded. Add the photo, ID proof and qualification from Edit.
          </Typography>
        ) : (
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', p: 2 }}>
            {documents.map((d) => (
              <Link
                key={d.label}
                href={fileUrl(d.path) ?? undefined}
                target="_blank"
                rel="noopener"
                underline="none"
                color="inherit"
                sx={{
                  width: 140,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  transition: 'box-shadow .15s, border-color .15s',
                  '&:hover': { boxShadow: 3, borderColor: 'primary.main' },
                }}
              >
                {isPdf(d.path) ? (
                  <Box sx={{ height: 110, display: 'grid', placeItems: 'center', bgcolor: 'action.hover' }}>
                    <PdfIcon sx={{ fontSize: 40, color: '#d93025' }} />
                  </Box>
                ) : (
                  <Box
                    component="img"
                    src={fileUrl(d.path) ?? undefined}
                    alt={d.label}
                    sx={{ width: '100%', height: 110, objectFit: 'cover', display: 'block', bgcolor: 'action.hover' }}
                  />
                )}
                <Typography variant="body2" sx={{ px: 1.25, py: 0.75, fontWeight: 500 }}>
                  {d.label}
                </Typography>
              </Link>
            ))}
          </Stack>
        )}
      </Panel>

      <Panel
        title="Enrolments"
        count={
          enrolments.data
            ? `${enrolRows.length} ${enrolRows.length === 1 ? 'course' : 'courses'} · ${money(totalPaid)} paid of ${money(totalPayable)}`
            : 'Loading…'
        }
        sx={{ mb: 2 }}
      >
        <TableFrame
          loading={enrolments.loading}
          error={enrolments.error}
          empty={enrolRows.length === 0}
          emptyText="Not enrolled on a course yet."
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Course</TableCell>
                <TableCell>Dates</TableCell>
                <TableCell align="right">Fee</TableCell>
                <TableCell align="right">Discount</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Certificate</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {enrolRows.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 140 }}>
                    {e.course_name ?? '—'}
                    {e.batch && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {e.batch}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {e.start_date?.slice(0, 10) ?? '—'} – {e.end_date?.slice(0, 10) ?? '—'}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(payable(e))}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {Number(e.discount_amount) > 0 ? `− ${money(e.discount_amount)}` : '—'}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(e.fee_paid)}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {due(e) > 0 ? money(due(e)) : '—'}
                  </TableCell>
                  <TableCell>
                    <StateChip {...(ENROLMENT[e.status] ?? { tone: 'plain', label: e.status })} />
                  </TableCell>
                  <TableCell className="mono">{e.certificate_no ?? '—'}</TableCell>
                  <TableCell>
                    <RowActions>
                      {e.certificate_id ? (
                        <IconAction
                          label={`Download certificate ${e.certificate_no ?? ''}`.trim()}
                          icon={DownloadIcon}
                          onClick={() => download({ id: e.certificate_id!, file: e.certificate_file })}
                        />
                      ) : (
                        <IconAction
                          label={e.status === 'completed' ? 'Issue certificate' : 'A certificate is issued once the course is completed'}
                          icon={IssueIcon}
                          disabled={e.status !== 'completed'}
                          onClick={() => setIssuing(e)}
                        />
                      )}
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Panel
        title="Certificates"
        count={certificates.data ? `${certRows.length} issued` : 'Loading…'}
      >
        <TableFrame
          loading={certificates.loading}
          error={certificates.error}
          empty={certRows.length === 0}
          emptyText="No certificate issued yet. One is issued when an enrolment is completed."
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Certificate no</TableCell>
                <TableCell>Course</TableCell>
                <TableCell>Grade</TableCell>
                <TableCell>Issued on</TableCell>
                <TableCell>Remark</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {certRows.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell className="mono">{c.certificate_no}</TableCell>
                  <TableCell>
                    {c.course_name ?? '—'}
                    {c.batch && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {c.batch}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{c.grade ?? '—'}</TableCell>
                  <TableCell>{c.issued_on?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal' }}>{c.remark ?? '—'}</TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction label="Download certificate" icon={DownloadIcon} onClick={() => download(c)} />
                      <IconAction label="Edit certificate" icon={EditIcon} onClick={() => setEditing(c)} />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {issuing && (
        <CertificateDialog enrolment={issuing} onClose={() => setIssuing(null)} onSaved={reload} />
      )}
      {editing && (
        <CertificateDialog certificate={editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </>
  );
}
