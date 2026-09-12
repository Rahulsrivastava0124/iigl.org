import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tab, Tabs } from '@mui/material';
import MessageCompose from '../components/MessageCompose';
import StaffInbox from '../components/StaffInbox';
import { useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';

/**
 * Messages, as separate conversations.
 *
 *   laboratory   with head office, and with its own staff
 *   head office  with its laboratories, and with staff
 *
 * Kept apart because they are different business — a notice to the network is
 * not a leave request from a front desk — and one list mixed them.
 *
 * They used to sit beside the Attendance calendar, which is an employee's
 * screen: an employer has no month of its own to punch, so it was opening an
 * empty calendar to read its mail.
 */
export default function Messages() {
  const { user } = useAuth();
  const office = isSuper(user);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'staff' ? 'staff' : 'first';
  // Head office names who it is writing to; the list is narrowed to the tab.
  const [writing, setWriting] = useState<'laboratories' | 'staff' | 'any' | null>(null);
  const me = user?.id ?? 0;

  return (
    <>
      <Tabs
        value={tab}
        onChange={(_, v) => setParams(v === 'staff' ? { tab: 'staff' } : {})}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="first" label={office ? 'Laboratories' : 'Super Admin'} />
        <Tab value="staff" label="Employees" />
      </Tabs>

      {tab === 'first' ? (
        office ? (
          <StaffInbox
            key="laboratories"
            from={me}
            conversation
            party="laboratories"
            title="Laboratories"
            emptyText="No messages with laboratories yet."
            onCompose={() => setWriting('laboratories')}
          />
        ) : (
          /* No Write: a laboratory answers head office, it does not start
             conversations with it — Reply on each message is the way back. */
          <StaffInbox
            key="head_office"
            from={me}
            conversation
            party="head_office"
            title="Super Admin"
            emptyText="Nothing from head office yet."
          />
        )
      ) : (
        <StaffInbox
          key="staff"
          from={me}
          conversation
          party="staff"
          title="Employees"
          emptyText="No messages with employees yet."
          onCompose={() => setWriting(office ? 'staff' : 'any')}
        />
      )}
      {writing && (
        <MessageCompose
          audience={writing === 'any' ? undefined : writing}
          onClose={() => setWriting(null)}
        />
      )}
    </>
  );
}
