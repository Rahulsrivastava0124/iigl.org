import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/SaveOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Notice, Panel } from '../components/ui';

/**
 * Settings.
 *
 * The values that used to be constants in the API or lines in its `.env`.
 *
 * **Empty means the default.** Every setting has one — exactly what the code
 * did before this screen existed — so clearing a field puts the behaviour back
 * rather than storing an empty string. The form says what each default is, so
 * "leave it blank" is a decision somebody can make on purpose.
 *
 * The API decides what the settings are and what they are called; this screen
 * renders whatever it is handed and groups by the part of the key before the
 * dot. A setting added on the server appears here without a change to it.
 */

interface Setting {
  key: string;
  group: string;
  label: string;
  kind: 'text' | 'number' | 'email' | 'url' | 'multiline';
  help: string | null;
  value: string;
  secret: boolean;
  /** Whether anybody has set it, as opposed to it reading as its default. */
  set: boolean;
  fallback: string;
}

/** What each group is called, and in what order. */
const GROUPS: { id: string; label: string; note: string }[] = [
  {
    id: 'company',
    label: 'Company',
    note: 'Printed on certificates and invoices.',
  },
  {
    id: 'certificate',
    label: 'Certificate',
    note:
      'Applies to certificates issued from now on. Ones already printed keep the number they carry.',
  },
  {
    id: 'session',
    label: 'Session and mail',
    note: 'How long a sign-in lasts, and where mail comes from.',
  },
];

/** `session` and `mail` share a tab: they are both "how the panel reaches you". */
const groupOf = (s: Setting) => (s.group === 'mail' ? 'session' : s.group);

export default function Settings() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? GROUPS[0].id;
  const group = GROUPS.find((g) => g.id === tab) ?? GROUPS[0];

  const source = useFetch<{ data: Setting[] }>('/settings');
  const settings = source.data?.data ?? [];

  /** What is in the boxes. Seeded from the API and edited from there. */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.length) {
      setDraft(Object.fromEntries(settings.map((s) => [s.key, s.value])));
    }
    // The list is replaced wholesale on every load, so the identity of the
    // array is the right thing to watch.
  }, [source.data]);

  const shown = settings.filter((s) => groupOf(s) === group.id);
  const changed = shown.filter((s) => (draft[s.key] ?? '') !== s.value);

  const save = async () => {
    if (changed.length === 0) return;
    setBusy(true);
    try {
      await api.patch(
        '/settings',
        Object.fromEntries(changed.map((s) => [s.key, draft[s.key] ?? ''])),
      );
      toast.ok(changed.length === 1 ? 'Setting saved.' : `${changed.length} settings saved.`);
      source.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tabs
        value={group.id}
        onChange={(_, v) => setParams(v === GROUPS[0].id ? {} : { tab: v })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {GROUPS.map((g) => (
          <Tab key={g.id} value={g.id} label={g.label} />
        ))}
      </Tabs>

      <Panel title={group.label} subtitle={group.note}>
        {source.error && <Notice kind="error">{source.error}</Notice>}

        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            {shown.map((s) => (
              <TextField
                key={s.key}
                label={s.label}
                type={s.kind === 'number' ? 'number' : s.kind === 'email' ? 'email' : 'text'}
                value={draft[s.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                multiline={s.kind === 'multiline'}
                minRows={s.kind === 'multiline' ? 2 : undefined}
                sx={s.kind === 'multiline' ? { gridColumn: '1 / -1' } : undefined}
                helperText={
                  s.secret
                    ? s.set
                      ? 'Stored. Type a new one to replace it; leave blank to keep it.'
                      : (s.help ?? 'Not set.')
                    : (s.help ?? undefined)
                }
                placeholder={s.secret && s.set ? '••••••••' : s.fallback || undefined}
              />
            ))}
          </Box>

          {/*
            The defaults are said out loud rather than implied by an empty box:
            "blank" means something different for each of these, and somebody
            clearing the session length should know it goes back to two days
            and not to nothing.
          */}
          {shown.some((s) => !s.secret && s.fallback) && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Clear a field to put it back to its default
              {' — '}
              {shown
                .filter((s) => !s.secret && s.fallback)
                .map((s) => `${s.label}: ${s.fallback}`)
                .join(' · ')}
              .
            </Typography>
          )}

          <Stack direction="row" spacing={1} sx={{ mt: 2.5, justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={save}
              disabled={busy || changed.length === 0}
            >
              {busy ? 'Saving…' : changed.length ? `Save ${changed.length}` : 'Save'}
            </Button>
          </Stack>
        </Box>
      </Panel>
    </>
  );
}
