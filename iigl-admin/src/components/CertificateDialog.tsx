import { useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import { api } from '../lib/api';
import { apiUrl } from '../lib/config';
import { messageOf } from '../lib/auth';
import { useToast } from './Toast';
import { ConfirmDialog, DateField, Dialog } from './ui';

export const GRADES = ['A+', 'A', 'B', 'C', 'Pass'];

/** A completed enrolment a certificate is issued against. */
export interface CertificateEnrolment {
  /** `student_courses.id`. */
  id: number;
  student_name: string | null;
  course_name: string | null;
  batch?: string | null;
  completed_on?: string | null;
}

/** A certificate already issued, being corrected. */
export interface IssuedCertificate {
  id: number;
  certificate_no: string;
  student_name: string | null;
  issued_on: string | null;
  grade: string | null;
  remark: string | null;
}

/**
 * The certificate as a PDF, printed on the course's artwork. Opened in a tab,
 * where the browser's viewer saves or prints it.
 */
export const downloadCertificate = (id: number) =>
  window.open(apiUrl(`/student-certificates/${id}/print`), '_blank', 'noopener');

/**
 * Issuing a course certificate, or correcting one: the date, the grade and a
 * remark.
 *
 * The grade is printed on a document the student keeps, so it is confirmed
 * before it is saved. Once saved, the dialog offers the certificate to download
 * rather than closing on a toast and leaving it to be found in a list.
 */
export default function CertificateDialog({
  enrolment,
  certificate,
  onClose,
  onSaved,
}: {
  /** Issue a new certificate against this enrolment. */
  enrolment?: CertificateEnrolment;
  /** Or edit this one. */
  certificate?: IssuedCertificate;
  onClose: () => void;
  /** After the save, while the dialog stays open on the download. */
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    issued_on: certificate?.issued_on?.slice(0, 10) ?? '',
    grade: certificate?.grade ?? '',
    remark: certificate?.remark ?? '',
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: number; certificate_no: string } | null>(null);

  const who = enrolment?.student_name ?? certificate?.student_name ?? 'the student';

  const save = async () => {
    setBusy(true);
    try {
      if (certificate) {
        await api.patch(`/student-certificates/${certificate.id}`, form);
        toast.ok(`${certificate.certificate_no} updated.`);
        setDone({ id: certificate.id, certificate_no: certificate.certificate_no });
      } else if (enrolment) {
        const res = await api.post<{ data: { id: number; certificate_no: string } }>('/student-certificates', {
          student_course_id: enrolment.id,
          ...form,
        });
        toast.ok(`${res.data.certificate_no} issued to ${who}.`);
        setDone({ id: res.data.id, certificate_no: res.data.certificate_no });
      }
      setConfirming(false);
      onSaved();
    } catch (e) {
      toast.error(messageOf(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Dialog
        title={done.certificate_no}
        onClose={onClose}
        onSubmit={() => downloadCertificate(done.id)}
        submitLabel="Download certificate"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <DownloadIcon color="primary" />
          <Typography variant="body2">
            {certificate ? 'Certificate updated' : 'Certificate issued'} for <strong>{who}</strong>
            {form.grade ? (
              <>
                {' '}
                with grade <strong>{form.grade}</strong>
              </>
            ) : null}
            . Download it to print or hand over.
          </Typography>
        </Box>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        title={certificate ? certificate.certificate_no : `Certificate — ${who}`}
        onClose={onClose}
        onSubmit={() => setConfirming(true)}
        submitLabel={certificate ? 'Save' : 'Issue'}
        busy={busy}
      >
        {enrolment && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            {enrolment.course_name}
            {enrolment.batch ? `, ${enrolment.batch}` : ''} — finished{' '}
            {enrolment.completed_on?.slice(0, 10) ?? 'recently'}. The number is issued on save.
          </Typography>
        )}
        {/* Two short fields side by side, the remark across both; one column on a phone. */}
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
            helperText="Optional. Printed on the certificate."
          >
            <MenuItem value="">Not graded</MenuItem>
            {GRADES.map((g) => (
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
      </Dialog>

      <ConfirmDialog
        open={confirming}
        danger={false}
        title="Confirm grade"
        message={
          form.grade ? (
            <>
              {certificate ? 'Save' : 'Issue'} the certificate for <strong>{who}</strong> with grade{' '}
              <strong>{form.grade}</strong>?
            </>
          ) : (
            <>
              {certificate ? 'Save' : 'Issue'} the certificate for <strong>{who}</strong> with{' '}
              <strong>no grade</strong>?
            </>
          )
        }
        warning="The grade is printed on the certificate the student keeps."
        onClose={() => setConfirming(false)}
        onConfirm={save}
        confirmLabel={certificate ? 'Save' : 'Issue'}
        busy={busy}
      />
    </>
  );
}
