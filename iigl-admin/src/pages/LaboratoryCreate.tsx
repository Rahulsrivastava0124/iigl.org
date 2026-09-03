import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Grid, Stack } from '@mui/material';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Panel, PasswordField } from '../components/ui';
import LaboratoryFields, {
  BLANK_LAB,
  labPatch,
  type LabForm,
} from '../components/LaboratoryFields';
import { ROLE } from '../lib/portal';
import SaveIcon from '@mui/icons-material/SaveOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';

/**
 * Add a laboratory.
 *
 * The fields are the printed Franchisee Form's, in its order, and they live in
 * one component shared with Edit — see `LaboratoryFields`. This screen adds
 * only what creation needs: a password.
 *
 * Two requests, because the account is created by name, mobile and role and
 * everything else is a detail on the record that follows.
 */

export default function LaboratoryCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<LabForm>(BLANK_LAB);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof LabForm>(key: K, value: LabForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ data: { id: number } }>('/users', {
        fullname: form.fullname,
        mobile: form.mobile,
        password,
        role_id: ROLE.LAB,
      });

      // Everything the form holds beyond the account itself. Sent through the
      // same builder Edit uses, so a field added to the form saves from both
      // screens or from neither — it cannot save from one and be lost by the
      // other, which is how the photograph went missing.
      await api.patch(`/users/${res.data.id}`, labPatch(form));

      toast.ok(`Laboratory "${form.fullname}" created.`);
      navigate('/laboratories');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Add New Laboratory"
      actions={
        <Button
          variant="text"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/laboratories')}
        >
          Back to list
        </Button>
      }
    >
      <Box component="form" onSubmit={submit} sx={{ p: 2 }}>
        <LaboratoryFields
          form={form}
          set={set}
          extra={
            <Grid size={{ xs: 12, md: 4 }}>
              <PasswordField
                label="Password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                slotProps={{ htmlInput: { minLength: 8 } }}
                required
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
            {busy ? 'Creating…' : 'Create Laboratory'}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/laboratories')}>
            Cancel
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}
