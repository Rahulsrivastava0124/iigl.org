import { useState } from 'react';
import {
  Checkbox,
  Chip,
  Grid,
  ListItemText,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useFetch } from '../lib/useFetch';
import { DateField, Dialog } from './ui';
import { useToast } from './Toast';

/**
 * Writing a message.
 *
 * Two shapes, decided by who is signed in rather than by a mode the caller
 * picks:
 *
 *   staff       one recipient, the person who employs them. No picker: they
 *               have exactly one, and a box for it would be a box to get wrong.
 *               The dialog names them instead.
 *
 *   an employer several. Head office writes to laboratories and to their
 *               people; a laboratory to its own staff. One row is written per
 *               recipient, so each is answered — or not — on its own.
 *
 * The list comes from `/messages/recipients`, which is the same rule the API
 * enforces on the way in. Nothing here decides who may be written to.
 */

interface Recipient {
  id: number;
  fullname: string;
  empid: string | null;
  role_id: number | null;
  employer_name: string | null;
}

/**
 * The things staff actually write about, with the words already in the box.
 *
 * Both are requests — they expect somebody to do something — and both are about
 * a day, which is why the date sits beside them. A blank message is still there
 * for everything else.
 */
const TEMPLATES = {
  leave: {
    label: 'Leave request',
    kind: 'request' as const,
    body: 'I would like leave on this day.',
  },
  punch: {
    label: 'Punch error',
    kind: 'request' as const,
    body: 'My punch for this day is wrong — please correct it.',
  },
  blank: { label: 'Something else', kind: 'message' as const, body: '' },
};

type Template = keyof typeof TEMPLATES;

/**
 * The "everybody" row's value.
 *
 * A real value rather than an empty string: it travels through the Select's own
 * change handler like any other, which is the only place that can decide what
 * is chosen without being overwritten a moment later.
 */
const ALL = '__all__';

export default function MessageCompose({
  /** Pre-selected recipients — the row somebody pressed Message on. */
  to = [],
  /**
   * Which half of the address book to show.
   *
   * Head office may write to both laboratories and their staff, and the two are
   * different acts done from different screens: a notice to the network, or a
   * word with one employee. The screen that opened this says which, so the list
   * is not one long roll of everybody.
   */
  audience,
  /** Offer the leave/punch templates. Staff writing upward, in practice. */
  templates = false,
  onClose,
  onSent,
}: {
  to?: number[];
  audience?: 'laboratories' | 'staff';
  templates?: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const toast = useToast();
  const people = useFetch<{ data: Recipient[] }>('/messages/recipients');
  const all = people.data?.data ?? [];
  const list =
    audience === 'laboratories'
      ? all.filter((p) => p.role_id === 2)
      : audience === 'staff'
        ? all.filter((p) => p.role_id !== 2)
        : all;

  /*
    Whether they choose at all. One possible recipient is not a choice — it is
    who this account answers to — so the picker is only drawn when there is
    something to pick between.
  */
  const chooses = list.length > 1 || to.length > 0;

  const [chosen, setChosen] = useState<number[]>(to);
  const [template, setTemplate] = useState<Template>('blank');
  const [kind, setKind] = useState<'request' | 'message'>('message');
  const [body, setBody] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);

  const nameOf = (id: number) => list.find((p) => p.id === id)?.fullname ?? `#${id}`;

  const send = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ data: { sent: number } }>('/messages', {
        kind,
        /*
          Which template this was written from, so a leave request is
          recognisable as one afterwards.

          The body is prose and the person writing is free to rewrite it, so it
          cannot be read back — and the Employee list has to say whether
          somebody is on leave today. Sent only for a request that came from a
          template; "Something else" says nothing about what it is, and
          claiming otherwise would put people on leave who never asked.
        */
        ...(kind === 'request' && template !== 'blank' ? { topic: template } : {}),
        body: body.trim(),
        about_date: about || null,
        ...(chooses ? { to: chosen } : {}),
      });
      const sent = res.data.sent ?? 1;
      toast.ok(sent === 1 ? 'Sent.' : `Sent to ${sent} people.`);
      onSent?.();
      onClose();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const only = !chooses ? list[0] : undefined;

  return (
    <Dialog
      title={only ? `Write to ${only.fullname}` : 'Write a message'}
      onClose={onClose}
      onSubmit={send}
      submitLabel={chosen.length > 1 ? `Send to ${chosen.length}` : 'Send'}
      busy={busy}
      disabled={body.trim() === '' || (chooses ? chosen.length === 0 : list.length === 0)}
    >
      {!people.loading && list.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          There is nobody for this account to write to.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {templates && (
            <Grid size={12}>
              {/* The two things anybody writes about, with the words already
                  there. It sets the kind as well: both are requests. */}
              <TextField
                select
                label="What about"
                value={template}
                onChange={(e) => {
                  const next = e.target.value as Template;
                  setTemplate(next);
                  setKind(TEMPLATES[next].kind);
                  // Only into an untouched box: nobody's typing is thrown away
                  // because they changed their mind about the heading.
                  if (body.trim() === '' || body === TEMPLATES[template].body) {
                    setBody(TEMPLATES[next].body);
                  }
                }}
              >
                {(Object.keys(TEMPLATES) as Template[]).map((k) => (
                  <MenuItem key={k} value={k}>
                    {TEMPLATES[k].label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}

          {chooses && (
            <Grid size={12}>
              {/*
                One box for one person and for twenty. A separate "send to
                everybody" control would be a second way to do the same thing,
                and the one that gets forgotten when the rules change.
              */}
              <TextField
                select
                label="To"
                required
                value={chosen.map(String)}
                onChange={(e) => {
                  const given = e.target.value as unknown as string[] | string;
                  const ids = typeof given === 'string' ? given.split(',') : given;

                  /*
                    Everybody, handled here rather than on the row.

                    It was an `onClick` on the row with `preventDefault`, which
                    does not stop the Select: its own change fires straight
                    afterwards with just that row's value and overwrites the
                    whole list. The sentinel comes through this handler like any
                    other value, so there is one place deciding what is chosen.
                  */
                  if (ids.includes(ALL)) {
                    setChosen(chosen.length === list.length ? [] : list.map((p) => p.id));
                    return;
                  }
                  setChosen(ids.filter(Boolean).map(Number));
                }}
                slotProps={{
                  select: {
                    multiple: true,
                    renderValue: (selected) => {
                      const ids = (selected as string[]).filter((v) => v !== ALL);
                      // Twelve chips is not a summary. Past a handful it says
                      // the number instead, which is what anybody checks.
                      if (ids.length > 4) {
                        return `${ids.length} of ${list.length} selected`;
                      }
                      return (
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ids.map((id) => (
                            <Chip key={id} size="small" label={nameOf(Number(id))} />
                          ))}
                        </span>
                      );
                    },
                  },
                }}
              >
                {/*
                  Everybody, in one press. A list of forty is not a list anybody
                  ticks forty times, and the alternative — a separate "send to
                  all" button — is a second control doing one thing.
                */}
                <MenuItem value={ALL} sx={{ fontWeight: 600 }}>
                  <Checkbox
                    size="small"
                    checked={list.length > 0 && chosen.length === list.length}
                    indeterminate={chosen.length > 0 && chosen.length < list.length}
                    sx={{ p: 0.5, mr: 1 }}
                  />
                  <ListItemText
                    primary={
                      audience === 'laboratories' ? 'All laboratories' : 'Everybody on this list'
                    }
                    slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: 600 } } }}
                  />
                </MenuItem>

                {list.map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    <Checkbox size="small" checked={chosen.includes(p.id)} sx={{ p: 0.5, mr: 1 }} />
                    <ListItemText
                      primary={p.fullname}
                      secondary={
                        p.employer_name
                          ? `${p.empid ?? ''} · ${p.employer_name}`
                          : (p.empid ?? undefined)
                      }
                      slotProps={{
                        primary: { sx: { fontSize: 13.5 } },
                        secondary: { sx: { fontSize: 12 } },
                      }}
                    />
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Kind"
              value={kind}
              // Changing this by hand unsets the template: a "Leave request"
              // turned into a plain message is no longer a leave request, and
              // sending the topic anyway would mark a day off that nobody
              // asked for.
              onChange={(e) => {
                setKind(e.target.value as 'request' | 'message');
                setTemplate('blank');
              }}
            >
              <MenuItem value="message">Message — just to tell them</MenuItem>
              <MenuItem value="request">Request — something to be done</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            {/* The day it is about, when it is about one — a missed punch-out,
                a day off. It lets the reader open that day rather than hunt. */}
            <DateField label="About which day" value={about} onChange={setAbout} />
          </Grid>
          <Grid size={12}>
            <TextField
              label="What you want to say"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              multiline
              minRows={4}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
          </Grid>
        </Grid>
      )}
    </Dialog>
  );
}
