import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/SaveOutlined';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { ROLE, isSuper } from '../lib/portal';
import Holidays from '../components/Holidays';
import { Notice, Panel, StateChip } from '../components/ui';

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
  kind: 'text' | 'number' | 'email' | 'url' | 'multiline' | 'phone';
  help: string | null;
  value: string;
  secret: boolean;
  /** Whether anybody has set it, as opposed to it reading as its default. */
  set: boolean;
  fallback: string;
  /** A stored secret with its password replaced by dots. Empty otherwise. */
  preview: string;
}

/** What each group is called, and in what order. */
const GROUPS: { id: string; label: string; note: string }[] = [
  {
    id: 'company',
    label: 'Company',
    note: 'Printed on certificates and invoices.',
  },
  {
    id: 'holidays',
    label: 'Holidays',
    note: 'The days the office is shut.',
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
  /*
    A laboratory and its staff are sent the holiday group and nothing else, so
    the tabs are what arrived rather than a fixed list. They read it: writing
    settings is head office's, and the API refuses a PATCH from anybody else —
    a Save button that 403s is worse than no Save button.
  */
  const { user } = useAuth();
  const mayEdit = isSuper(user);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? '';

  const source = useFetch<{ data: Setting[] }>('/settings');
  const settings = source.data?.data ?? [];

  /** What is in the boxes. Seeded from the API and edited from there. */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /**
   * What the mail server said last time the connection was tried.
   *
   * Cleared the moment the URL is edited: a red mark left over from the string
   * before the correction is worse than no mark, because it says the fix did
   * not work when nothing has been tried yet.
   */
  const [smtp, setSmtp] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  /** Opens the connection. Nothing is sent and nothing is stored. */
  const testSmtp = async (url: string) => {
    setTesting(true);
    try {
      const r = await api.post<{ data: { ok: boolean; message: string } }>(
        '/settings/test-smtp',
        // Empty means "test what is stored", which is what the button does on a
        // field left untouched.
        { url },
      );
      setSmtp(r.data);
      return r.data.ok;
    } catch (e) {
      setSmtp({ ok: false, message: messageOf(e) });
      return false;
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (settings.length) {
      setDraft(Object.fromEntries(settings.map((s) => [s.key, s.value])));
    }
    // The list is replaced wholesale on every load, so the identity of the
    // array is the right thing to watch.
  }, [source.data]);

  /*
    Only the groups something was actually sent for — plus Holidays, which is a
    table of its own rather than a set of settings, and so arrives on nobody's
    settings list. Everybody sees it: staff read the calendar they work to.
  */
  const groups = GROUPS.filter(
    (g) => g.id === 'holidays' || settings.some((s) => groupOf(s) === g.id),
  );
  const group = groups.find((g) => g.id === tab) ?? groups[0] ?? GROUPS[0];

  const shown = settings.filter((s) => groupOf(s) === group.id);

  const changed = shown.filter((s) => (draft[s.key] ?? '') !== s.value);

  const save = async () => {
    if (changed.length === 0) return;

    /*
      A new mail connection is tried before it is written. Saving one that does
      not work stores a setting that looks configured and fails on the day
      somebody needs a password reset — which is the one day nobody is watching
      the panel.
    */
    const smtpChange = changed.find((s) => s.key === 'mail.smtp_url');
    if (smtpChange && (draft[smtpChange.key] ?? '').trim()) {
      const ok = await testSmtp(draft[smtpChange.key]);
      if (!ok) return;
    }

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
        onChange={(_, v) => setParams(v === groups[0]?.id ? {} : { tab: v })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {groups.map((g) => (
          <Tab key={g.id} value={g.id} label={g.label} />
        ))}
      </Tabs>

      {group.id === 'holidays' ? (
        <Holidays
          // Staff read; the two employer roles keep a list. Head office's is
          // the shared one, a laboratory's is its own.
          canWrite={(user?.roleId ?? 0) === ROLE.SUPER || user?.roleId === ROLE.LAB}
          headOffice={mayEdit}
        />
      ) : (
      <Panel title={group.label} subtitle={group.note}>
        {source.error && <Notice kind="error">{source.error}</Notice>}

        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
              gap: 2,
              alignItems: 'start',
              // The cell decides the width, as it does in FormPanel.
              '& > *': { width: '100%' },
            }}
          >
            {shown.map((s) => {
              /*
                The standing description sits in the (i) rather than under the
                box. It is the same sentence either way, but under the box it is
                read on every visit whether or not anybody wanted it, and a
                sentence under one field in a three-column grid pushes its
                neighbours out of line. Under the box now: only what has changed
                or gone wrong.
              */
              const info = s.help ? (
                <Tooltip title={s.help} placement="top">
                  <InfoIcon
                    sx={{ fontSize: 18, color: 'text.disabled', cursor: 'help', ml: 0.5 }}
                  />
                </Tooltip>
              ) : null;

              const isSmtp = s.key === 'mail.smtp_url';

              const end =
                isSmtp || info ? (
                  <InputAdornment position="end">
                    {isSmtp && (
                      <>
                        {/*
                          Testing is offered before saving, and on the stored one
                          afterwards: an empty box with the button still live is
                          how somebody checks a connection that was working last
                          month.
                        */}
                        <Button
                          size="small"
                          onClick={() => void testSmtp(draft[s.key] ?? '')}
                          disabled={testing || busy}
                        >
                          {testing ? 'Testing…' : 'Test'}
                        </Button>
                        {/*
                          A stored secret comes back empty — the API never sends
                          one to the browser — and an empty box after saving
                          reads as a save that did not happen. The badge says
                          otherwise, in the field itself.
                        */}
                        {s.set && <StateChip tone="settled" label="Stored" />}
                      </>
                    )}
                    {info}
                  </InputAdornment>
                ) : undefined;

              return (
                <TextField
                  key={s.key}
                  label={s.label}
                  slotProps={{
                    input: {
                      /*
                        A phone number wears its country code rather than being
                        told about it: the +91 is there while you type, so what
                        the box will store is what the box shows.
                      */
                      ...(s.kind === 'phone'
                        ? {
                            startAdornment: (
                              <InputAdornment position="start">
                                <Box component="span" sx={{ color: 'text.secondary' }}>
                                  +91
                                </Box>
                              </InputAdornment>
                            ),
                          }
                        : null),
                      ...(end ? { endAdornment: end } : null),
                    },
                    ...(s.kind === 'phone' ? { htmlInput: { inputMode: 'tel' as const } } : null),
                  }}
                  type={s.kind === 'number' ? 'number' : s.kind === 'email' ? 'email' : 'text'}
                  value={draft[s.key] ?? ''}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [s.key]: e.target.value }));
                    if (isSmtp) setSmtp(null);
                  }}
                  // The red mark the mail server earned, on the field that
                  // caused it rather than in a toast that is gone by the time
                  // somebody looks back at the box.
                  error={isSmtp && smtp?.ok === false}
                  disabled={!mayEdit}
                  multiline={s.kind === 'multiline'}
                  minRows={s.kind !== 'multiline' ? undefined : s.key === 'holidays.list' ? 10 : 2}
                  sx={s.kind === 'multiline' ? { gridColumn: '1 / -1' } : undefined}
                  helperText={
                    /*
                      Only news. What the mail server said last, and whether a
                      secret is stored at all — both are state, and state is
                      worth the line under the box. The description is not: it
                      is the same every visit, and it is on the (i).
                    */
                    isSmtp && smtp
                      ? smtp.message
                      : s.secret
                      ? s.set
                        ? // What is stored, minus the password. The box stays
                          // empty because the password itself never leaves the
                          // server; this says which server and account it names.
                          `Stored: ${s.preview} — type a new one to replace it, or leave blank to keep this.`
                        : 'Not set.'
                      : undefined
                  }
                  placeholder={s.secret && s.set ? '••••••••' : s.fallback || undefined}
                />
              );
            })}
          </Box>

          {/*
            The defaults are said out loud rather than implied by an empty box:
            "blank" means something different for each of these, and somebody
            clearing the session length should know it goes back to two days
            and not to nothing.
          */}
          {shown.some((s) => !s.secret && s.fallback && s.kind !== 'multiline') && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Clear a field to put it back to its default
              {' — '}
              {shown
                .filter((s) => !s.secret && s.fallback && s.kind !== 'multiline')
                .map((s) => `${s.label}: ${s.fallback}`)
                .join(' · ')}
              .
            </Typography>
          )}

          {!mayEdit && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Head office keeps this list. Ask them to change it.
            </Typography>
          )}

          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 2.5, justifyContent: 'flex-end', display: mayEdit ? 'flex' : 'none' }}
          >
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
      )}
    </>
  );
}
