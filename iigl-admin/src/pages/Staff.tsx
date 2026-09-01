import { useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch, useDebounced } from '../lib/useFetch';
import { usePermissions } from '../lib/permissions';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import {
  DateField,
  IconAction,
  Pager,
  Panel,
  PasswordField,
  RowActions,
  SearchField,
  TableFrame,
  YesNo,
} from '../components/ui';
import FileField from '../components/FileField';
import type { Paged } from '../lib/api';
import { isSuper, ROLE } from '../lib/portal';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import ViewIcon from '@mui/icons-material/VisibilityOutlined';

import PermissionsIcon from '@mui/icons-material/KeyOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import UserPermissions from '../components/UserPermissions';

interface StaffRow {
  id: number;
  fullname: string;
  mobile: string;
  role_id: number;
  is_active: number;
  profile_photo: string | null;
  /** Their own employee ID, e.g. `EMP0007`. The API gives every account one. */
  empid: string | null;
  /** `employements.parent_id` as stored — the employer's `empid`, e.g. `LAB0001`. */
  lab_empid: string;
  /**
   * That employer resolved to a user id, which is what every other id in the
   * API is. Null when no account holds the stored `empid`.
   */
  lab_id: number | null;
  /** That employer's name, resolved by the API. */
  lab_name: string | null;
  /** 1 when the employer is head office rather than a laboratory. */
  employer_role_id: number | null;
  joining_date: string;
  /** On the employment, not the account: what this posting pays. */
  salary: string;
}

/** Get initials from name (first letter of first and last name) */
const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

interface Role {
  id: number;
  role_name: string;
  description: string | null;
}

/**
 * One account in full, as `GET /api/users/{id}` returns it.
 *
 * The staff list carries eight columns — enough for a table, nowhere near
 * enough for the form. Edit fetches the record.
 */
interface Account {
  id: number;
  fullname: string;
  mobile: string;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  adhar_no: string | null;
  pan_no: string | null;
  bank_name: string | null;
  ifsc_code: string | null;
  account_no: string | null;
  profile_photo: string | null;
  adhar_photo: string | null;
  role_id: number | null;
  employment: { joining_date: string; salary: string } | null;
}

const BLANK_ACCOUNT = {
  open: false,
  id: undefined as number | undefined,
  role_id: '3',
  fullname: '',
  mobile: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  // Laravel's spelling, because these are the column names: `adhar_*`, `pan_*`.
  // The form used to call them aadhar_no and pan_number, which matched nothing
  // on the API and so was never saved and never came back.
  adhar_no: '',
  pan_no: '',
  bank_name: '',
  ifsc_code: '',
  account_no: '',
  password: '',
  profile_photo: '',
  adhar_photo: '',
  // These two are the employment's, not the account's. They are on this form
  // because somebody hiring a person settles the pay and the start date in the
  // same breath as the name, and the API takes them on the create.
  salary: '',
  joining_date: '',
};

export default function Staff() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const admin = isSuper(user);
  const mayAdd = admin && can('employee_management', 'create');
  const mayEdit = admin && can('employee_management', 'update');
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());

  const { data, loading, error, reload } = useFetch<Paged<StaffRow>>(`/users/staff?${query}`);
  const roles = useFetch<{ data: Role[] }>('/roles');
  const rows = data?.data ?? [];
  // 0 is "no role": this person's permissions are their own, granted one by one.
  const roleName = (id: number | null) =>
    id === null
      ? 'No role'
      : (roles.data?.data.find((r) => r.id === id)?.role_name ?? `role ${id}`);

  /**
   * One form for both jobs, on the page rather than in a dialog. `id` is what
   * separates them, and it decides which fields matter: a new account needs a
   * password and cannot have an email yet, an existing one is the other way
   * round — its password is changed through Reset, which is a different act
   * with a different warning.
   */
  const [form, setForm] = useState(BLANK_ACCOUNT);
  const clearForm = () => setForm(BLANK_ACCOUNT);

  /**
   * Open the form on somebody, filled in.
   *
   * The row is not the record: the staff list returns the eight columns its
   * table shows, so seeding the form from it left the address, the bank and
   * the identity fields blank — and saving then wrote those blanks over what
   * was there. This fetches the account first.
   */
  const edit = async (row: StaffRow) => {
    setForm({ ...BLANK_ACCOUNT, open: true, id: row.id, fullname: row.fullname });
    try {
      const { data: a } = await api.get<{ data: Account }>(`/users/${row.id}`);
      setForm({
        ...BLANK_ACCOUNT,
        open: true,
        id: a.id,
        fullname: a.fullname,
        mobile: a.mobile,
        email: a.email ?? '',
        address: a.address ?? '',
        city: a.city ?? '',
        state: a.state ?? '',
        pincode: a.pincode ?? '',
        country: a.country ?? '',
        adhar_no: a.adhar_no ?? '',
        pan_no: a.pan_no ?? '',
        bank_name: a.bank_name ?? '',
        ifsc_code: a.ifsc_code ?? '',
        account_no: a.account_no ?? '',
        profile_photo: a.profile_photo ?? '',
        adhar_photo: a.adhar_photo ?? '',
        role_id: a.role_id === null ? '' : String(a.role_id),
        salary:
          a.employment && Number(a.employment.salary) > 0
            ? String(Number(a.employment.salary))
            : '',
        joining_date: String(a.employment?.joining_date ?? '').slice(0, 10),
      });
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  /** Whose individual permissions are open. */
  const [granting, setGranting] = useState<StaffRow | null>(null);

  const [busy, setBusy] = useState(false);

  const saveAccount = async () => {
    setBusy(true);
    try {
      if (form.id) {
        await api.patch(`/users/${form.id}`, {
          fullname: form.fullname,
          mobile: form.mobile,
          email: form.email || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          pincode: form.pincode || null,
          country: form.country || null,
          bank_name: form.bank_name || null,
          ifsc_code: form.ifsc_code || null,
          account_no: form.account_no || null,
          profile_photo: form.profile_photo || null,
          adhar_no: form.adhar_no || null,
          adhar_photo: form.adhar_photo || null,
          pan_no: form.pan_no || null,
          role_id: form.role_id === '' ? null : Number(form.role_id),
        });
        // The salary and the joining date are on the employment, which is a
        // different row and a different endpoint. Sent only when one of them
        // was filled in, so editing a name does not rewrite somebody's terms.
        if (form.salary !== '' || form.joining_date !== '') {
          await api.patch(`/users/${form.id}/employment`, {
            ...(form.salary !== '' ? { salary: Number(form.salary) } : {}),
            ...(form.joining_date !== '' ? { joining_date: form.joining_date } : {}),
          });
        }
        toast.ok(`${form.fullname} updated.`);
      } else {
        const res = await api.post<{ data: { id: number } }>('/users', {
          fullname: form.fullname,
          mobile: form.mobile,
          password: form.password,
          role_id: form.role_id === '' ? null : Number(form.role_id),
          // The create employs them in the same request, so the terms of that
          // employment travel with it.
          salary: form.salary === '' ? 0 : Number(form.salary),
          joining_date: form.joining_date || undefined,
        });
        // Update with additional fields
        const id = res.data.id;
        await api.patch(`/users/${id}`, {
          email: form.email || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          pincode: form.pincode || null,
          country: form.country || null,
          bank_name: form.bank_name || null,
          ifsc_code: form.ifsc_code || null,
          account_no: form.account_no || null,
          profile_photo: form.profile_photo || null,
          adhar_no: form.adhar_no || null,
          adhar_photo: form.adhar_photo || null,
          pan_no: form.pan_no || null,
        });
        toast.ok(`${form.fullname} added.`);
      }
      clearForm();
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const endEmployment = async (row: StaffRow) => {
    try {
      await api.post(`/users/${row.id}/employment/end`, {});
      toast.ok(`${row.fullname} is no longer employed.`);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  /**
   * Filter to show only super admin's employees (Head office).
   */
  const filteredRows = rows.filter((r) => r.employer_role_id === ROLE.SUPER);

  return (
    <>
      {form.open && (
        <Box sx={{ mb: 2 }}>
          <Panel title={form.id ? 'Edit Employee' : 'Employee Information'}>
            <Box
              component="form"
              onSubmit={(e: React.FormEvent) => {
                e.preventDefault();
                saveAccount();
              }}
              sx={{ p: 2 }}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    select
                    label="Role/Designation"
                    value={form.role_id}
                    onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                    required
                  >
                    {(roles.data?.data ?? [])
                      .filter((r) => r.id > 2)
                      .map((r) => (
                        <MenuItem key={r.id} value={String(r.id)}>
                          {r.role_name}
                        </MenuItem>
                      ))}
                    <MenuItem value="">No role</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Employee Name"
                    placeholder="Eg. Santosh Kumar"
                    value={form.fullname}
                    onChange={(e) => setForm({ ...form, fullname: e.target.value })}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Contact No/Mobile"
                    placeholder="Eg. 9875642310"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Email ID"
                    type="email"
                    placeholder="Eg. employee@gmail.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Complete Address"
                    placeholder="Eg."
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="City/District"
                    placeholder="Eg."
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="State"
                    placeholder="Choose State"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Pincode"
                    placeholder="Eg. 800020"
                    value={form.pincode}
                    onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Country"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Aadhar No"
                    placeholder="Eg. 987987987987"
                    value={form.adhar_no}
                    onChange={(e) => setForm({ ...form, adhar_no: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="PAN Number"
                    placeholder="Eg. ABCDE1234F"
                    value={form.pan_no}
                    onChange={(e) => setForm({ ...form, pan_no: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Bank Name"
                    placeholder="Eg. State Bank of India"
                    value={form.bank_name}
                    onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="IFSC Code"
                    placeholder="Eg. SBIXXXXXX"
                    value={form.ifsc_code}
                    onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Account No"
                    placeholder="Eg. 9325902385092345"
                    value={form.account_no}
                    onChange={(e) => setForm({ ...form, account_no: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Salary"
                    type="number"
                    placeholder="Eg. 18000"
                    value={form.salary}
                    onChange={(e) => setForm({ ...form, salary: e.target.value })}
                    helperText="Monthly. Shown on their own profile."
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <DateField
                    label="Joining Date"
                    value={form.joining_date}
                    onChange={(value) => setForm({ ...form, joining_date: value })}
                    helperText={form.id ? undefined : 'Blank is today.'}
                  />
                </Grid>
                {!form.id && (
                  <Grid size={{ xs: 12, md: 4 }}>
                    <PasswordField
                      label="Login Password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      slotProps={{ htmlInput: { minLength: 8 } }}
                      required
                    />
                  </Grid>
                )}
                <Grid size={{ xs: 12, md: 4 }}>
                  <FileField
                    label="Profile Photo"
                    bucket="employee"
                    value={form.profile_photo}
                    onChange={(url) => setForm({ ...form, profile_photo: url ?? '' })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FileField
                    label="Aadhar Photo"
                    bucket="documentation"
                    value={form.adhar_photo}
                    onChange={(url) => setForm({ ...form, adhar_photo: url ?? '' })}
                  />
                </Grid>
              </Grid>
              <Box
                sx={{
                  mt: 3,
                  pt: 2,
                  borderTop: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 2,
                }}
              >
                <Button variant="outlined" onClick={clearForm}>
                  Cancel
                </Button>
                <Button variant="contained" type="submit" disabled={busy}>
                  {busy ? 'Saving…' : form.id ? 'Save Changes' : 'Add Employee'}
                </Button>
              </Box>
            </Box>
          </Panel>
        </Box>
      )}

      <Panel
        footer={<Pager meta={data?.meta} onPage={setPage} />}
        title="Staff"
        count={data ? `${filteredRows.length} head office employees` : 'Loading…'}
        actions={
          <>
            <SearchField
              placeholder="Name, mobile, email…"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            {mayAdd && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setForm({ ...BLANK_ACCOUNT, open: true })}
              >
                Add account
              </Button>
            )}
          </>
        }
      >
        <TableFrame loading={loading} error={error} empty={filteredRows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>SN.</TableCell>
                <TableCell>Photo</TableCell>
                <TableCell>Emp ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Joined</TableCell>
                <TableCell>Active</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((s, index) => (
                <TableRow key={s.id} hover>
                  <TableCell className="mono">{index + 1}</TableCell>
                  <TableCell>
                    <Avatar
                      src={s.profile_photo || undefined}
                      sx={{
                        width: 36,
                        height: 36,
                        fontSize: 14,
                        bgcolor: 'primary.main',
                      }}
                    >
                      {getInitials(s.fullname)}
                    </Avatar>
                  </TableCell>
                  <TableCell className="mono">{s.empid || '—'}</TableCell>
                  <TableCell>{s.fullname}</TableCell>
                  <TableCell className="mono">{s.mobile}</TableCell>
                  <TableCell>{roleName(s.role_id)}</TableCell>
                  <TableCell>{s.joining_date}</TableCell>
                  <TableCell>
                    <YesNo on={s.is_active} />
                  </TableCell>
                  <TableCell>
                    {/*
                     * View is not gated on update. Opening somebody's record
                     * and their month is reading, and gating it on the right
                     * to change them hid it from everybody who may only look.
                     */}
                    <RowActions>
                      <IconAction label="View employee" icon={ViewIcon} to={`/staff/${s.id}`} />
                      {mayEdit && (
                        <>
                          <IconAction
                            label="Edit employee"
                            icon={EditIcon}
                            onClick={() => edit(s)}
                          />
                          <IconAction
                            label="Permissions"
                            icon={PermissionsIcon}
                            onClick={() => setGranting(s)}
                          />
                          <IconAction
                            label="End employment"
                            icon={DeleteIcon}
                            danger
                            onClick={() => endEmployment(s)}
                          />
                        </>
                      )}
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {granting && <UserPermissions user={granting} onClose={() => setGranting(null)} />}
    </>
  );
}
