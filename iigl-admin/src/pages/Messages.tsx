import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Stack, Tab, Tabs } from '@mui/material';
import GroupIcon from '@mui/icons-material/GroupsOutlined';
import MessageCompose from '../components/MessageCompose';
import ChatInbox from '../components/ChatInbox';
import { useAuth } from '../lib/auth';
import { isLab, isSuper } from '../lib/portal';

/**
 * Messages, as chats.
 *
 *   laboratory   with head office, and with its own staff
 *   head office  with its laboratories, and with staff
 *
 * Kept apart by tab because they are different business — a notice to the
 * network is not a leave request from a front desk.
 *
 * Head office's two tabs and a laboratory's Employees tab each hold many people,
 * so they list them on the left with the chat beside them. A laboratory's line
 * to head office is one conversation, so it is the chat alone.
 *
 * Only head office and laboratories open this page; staff talk to their
 * employer from Attendance.
 */
export default function Messages() {
  const { user } = useAuth();
  const office = isSuper(user);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'staff' ? 'staff' : 'first';
  /*
    Writing the same message to several people at once — a notice to every
    laboratory, say. A chat is one person at a time, so this stays as its own
    dialog beside the tabs.
  */
  const [broadcast, setBroadcast] = useState(false);

  /*
    An employee's messages: one chat, with the person who employs them. They
    cannot write to anybody else — the API sends an employee's message to
    their employer and no one else — so there is no tab and no list.
  */
  if (!office && !isLab(user)) {
    return (
      <ChatInbox
        key="employer"
        party="employer"
        multi={false}
        title="Messages"
        emptyText="Nobody employs this account, so there is nobody to write to."
      />
    );
  }

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Tabs value={tab} onChange={(_, v) => setParams(v === 'staff' ? { tab: 'staff' } : {})}>
          <Tab value="first" label={office ? 'Laboratories' : 'Super Admin'} />
          <Tab value="staff" label="Employees" />
        </Tabs>
        {(office || tab === 'staff') && (
          <Button size="small" startIcon={<GroupIcon />} onClick={() => setBroadcast(true)}>
            Message several
          </Button>
        )}
      </Stack>

      {tab === 'first' ? (
        office ? (
          <ChatInbox
            key="laboratories"
            party="laboratories"
            multi
            title="Laboratories"
            emptyText="No messages with laboratories yet."
          />
        ) : (
          <ChatInbox
            key="head_office"
            party="head_office"
            multi={false}
            title="Super Admin"
            emptyText="Nothing from head office yet."
          />
        )
      ) : (
        <ChatInbox
          key="staff"
          party="staff"
          multi
          title="Employees"
          emptyText="No messages with employees yet."
        />
      )}

      {broadcast && (
        <MessageCompose
          audience={tab === 'first' ? 'laboratories' : office ? 'staff' : undefined}
          onClose={() => setBroadcast(false)}
        />
      )}
    </>
  );
}
