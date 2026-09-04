import { useEffect, useState } from 'react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { countOf, type Permission } from '../lib/permissionMenu';
import PermissionGrid, { cleared } from './PermissionGrid';
import { useToast } from './Toast';

export default function RolePermissionsDialog({
  roleId,
  roleName,
  readOnly = false,
  note,
  onClose,
  onSaved,
}: {
  roleId: number;
  roleName: string;
  /**
   * Somebody else's role: head office's, seen from a laboratory. Shown in full
   * — knowing what a shared role allows is the reason to open it — but nothing
   * on it can be changed, because the name and the matrix are shared with every
   * other laboratory. The API refuses the write either way; this is so the
   * dialog does not offer a Save that cannot work.
   */
  readOnly?: boolean;
  note?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();

  const [name, setName] = useState(roleName);
  const [rows, setRows] = useState<Permission[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded into local state and edited there. Every checkbox used to be its own
  // request, so a half-finished grant was already live and Cancel meant
  // nothing; with a Save button the dialog has to hold the changes until then.
  useEffect(() => {
    let live = true;
    api
      .get<{ data: Permission[] }>(`/roles/${roleId}/permissions`)
      .then((r) => live && setRows(r.data))
      .catch((e) => live && setError(messageOf(e)));
    return () => {
      live = false;
    };
  }, [roleId]);

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      if (!readOnly && name.trim() && name.trim() !== roleName) {
        await api.patch(`/roles/${roleId}`, { name: name.trim() });
      }
      // One request per action type: the API replaces all four flags for one
      // action at a time, and there is no bulk endpoint to replace them with.
      for (const r of rows) {
        await api.put(`/roles/${roleId}/permissions`, {
          action_type: r.action_type,
          view: r.view,
          create: r.create,
          update: r.update,
          delete: r.delete,
        });
      }
      toast.ok(`${name.trim() || roleName} saved.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const total = countOf(rows ?? []);

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '1.05rem',
          fontWeight: 600,
        }}
      >
        {readOnly ? 'Role' : 'Edit Role'}
        <IconButton onClick={onClose} size="small" sx={{ color: 'inherit' }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        {note && (
          <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
            {note}
          </Typography>
        )}

        <TextField
          label="Role name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          required
          sx={{ mb: 3 }}
        />

        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
            Permissions{' '}
            <Typography
              component="span"
              color="text.secondary"
              className="tabular"
              sx={{ fontSize: 13.5 }}
            >
              ({total.granted}/{total.total})
            </Typography>
          </Typography>
          {!readOnly && (
            <Button
              color="error"
              onClick={() => rows && setRows(cleared(rows))}
              disabled={!rows || busy}
            >
              Clear all
            </Button>
          )}
        </Stack>

        {!rows ? (
          <Stack sx={{ alignItems: 'center', py: 5 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : (
          <PermissionGrid
            rows={rows}
            onChange={setRows}
            open={open}
            onToggleGroup={(title) => setOpen({ ...open, [title]: !open[title] })}
            disabled={busy || readOnly}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit" variant="outlined" disabled={busy}>
          {readOnly ? 'Close' : 'Cancel'}
        </Button>
        {!readOnly && (
          <Button onClick={save} variant="contained" disabled={busy || !rows || !name.trim()}>
            {busy ? 'Saving…' : 'Save role'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
