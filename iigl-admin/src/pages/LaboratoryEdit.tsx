import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Grid, Stack, TextField } from '@mui/material';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Panel, hint } from '../components/ui';
import LaboratoryFields, {
  BLANK_LAB,
  labFromRecord,
  labPatch,
  type LabForm,
  type LabRecord,
} from '../components/LaboratoryFields';
import FranchiseeFormActions from '../components/FranchiseeForm';
import SaveIcon from '@mui/icons-material/SaveOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';

/**
 * Edit a laboratory.
 *
 * Same fields as Add, from the same component, so what can be entered can be
 * corrected. This screen adds the two things only an existing account has: its
 * mobile number, which is the sign-in identifier, and its employee ID.
 *
 * The Franchisee Form prints from the header. Somebody who has just fixed a
 * bank account is the person about to reprint the form, and the laboratory's
 * page is a round trip away for something this screen already knows.
 */

export default function LaboratoryEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<LabForm>(BLANK_LAB);
  const [empid, setEmpid] = useState('');
  const [labName, setLabName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<{ data: LabRecord & { empid: string | null } }>(`/users/${id}`);
        const d = res.data;
        setLabName(String(d.fullname ?? ''));
        setEmpid(d.empid ?? '');
        setForm(labFromRecord(d));
      } catch (e) {
        toast.error(messageOf(e));
        navigate('/laboratories');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate, toast]);

  const set = <K extends keyof LabForm>(key: K, value: LabForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // `empid` is not sent. It is issued by the API when the account is
      // created and is a key as well as a label — employments name their
      // employer by it — so it is shown here and changed nowhere.
      await api.patch(`/users/${id}`, { ...labPatch(form), mobile: form.mobile });

      toast.ok(`Laboratory "${form.fullname}" updated.`);
      navigate('/laboratories');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Panel title="Edit Laboratory">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      </Panel>
    );
  }

  return (
    <Panel
      title={`Edit — ${labName}`}
      actions={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} useFlexGap>
          <FranchiseeFormActions labId={Number(id)} compact />
          <Button
            variant="text"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/laboratories')}
          >
            Back to list
          </Button>
        </Stack>
      }
    >
      <Box component="form" onSubmit={submit} sx={{ p: 2 }}>
        <LaboratoryFields
          form={form}
          set={set}
          extra={
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Employee ID"
                value={empid}
                disabled
                slotProps={hint(
                  'Issued automatically when the account was created. Employments name their employer by it, so it is not editable. It prints as the form number.',
                )}
              />
            </Grid>
          }
        />

        <Stack
          direction="row"
          spacing={2}
          sx={{
            mt: 3,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="contained" type="submit" disabled={busy} startIcon={<SaveIcon />}>
            {busy ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/laboratories')}>
            Cancel
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}
