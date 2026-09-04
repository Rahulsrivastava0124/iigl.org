import type { ReactNode } from 'react';
import { useFetch } from '../lib/useFetch';
import { Autocomplete, Checkbox, Grid, ListItemText, MenuItem, TextField } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useToast } from './Toast';
import FileField from './FileField';
import DocumentAssets, { type LabDocument } from './DocumentAssets';
import { FRAME_CELL, WIDE_FRAME_CELL, hint, hintNode } from './ui';

/**
 * The laboratory's own details, as the printed Franchisee Form asks for them.
 *
 * One component for both Add and Edit. The two screens had the same thirty
 * fields typed out twice and had already drifted — a field added to one and
 * forgotten on the other is a field somebody fills in and cannot then change —
 * so the fields, the blank record, the mapping in from the API and the body
 * sent back out all live here together.
 *
 * The order follows the paper form: applicant, then KYC, then bank, then the
 * commercial terms. Flat three-column grid with no section headings, which is
 * the house style for a full-page form; the grouping is carried by the order,
 * as it is on the page it is copying.
 *
 * What each screen owns alone — a password when creating, an employee ID when
 * editing — comes in through `extra`, and sits with the account settings just
 * before the attachments.
 */

export const ACCOUNT_TYPES = ['SAVING', 'CURRENT'] as const;

/**
 * The documents somebody can produce as proof, as the paper asks for them.
 *
 * Two questions, two lists — the franchisee form prints them as two rows:
 *
 *     ID PROOF*       PAN   AADHAR   PASSPORT
 *     ADDRESS PROOF   AADHAR   D.L.NO.   VOTER ID
 *
 * Several answers each, because a franchise hands over two or three documents.
 * The Aadhaar sits on both lists and is the usual answer to both; a PAN card
 * proves identity and does not prove an address, which is why one merged
 * question could not fill the second row.
 *
 * `PROOFS` is the union, in the order the paper prints them. It orders the
 * number and scan fields below, each of which is asked **once**: a card named
 * as both proofs is one card with one number.
 */
export const ID_PROOFS = ['PAN', 'AADHAR', 'PASSPORT'] as const;
export const ADDRESS_PROOFS = ['AADHAR', 'D.L.NO.', 'VOTER ID'] as const;
export const PROOFS = ['PAN', 'AADHAR', 'PASSPORT', 'D.L.NO.', 'VOTER ID'] as const;

/** Where each proof's number and its scan are kept, and how to ask for them. */
type NumberKey = 'pan_no' | 'adhar_no' | 'passport_no' | 'dl_no' | 'voter_id';
type PhotoKey = 'pan_photo' | 'adhar_photo' | 'passport_photo' | 'dl_photo' | 'voter_photo';

const PROOF: Record<
  string,
  { key: NumberKey; photo: PhotoKey; label: string; eg: string; max: number; caps?: boolean }
> = {
  PAN: { key: 'pan_no', photo: 'pan_photo', label: 'PAN Number', eg: 'ABCDE1234F', max: 10, caps: true },
  AADHAR: { key: 'adhar_no', photo: 'adhar_photo', label: 'Aadhaar Number', eg: '1234 5678 9012', max: 14 },
  PASSPORT: { key: 'passport_no', photo: 'passport_photo', label: 'Passport Number', eg: 'M1234567', max: 12, caps: true },
  'D.L.NO.': { key: 'dl_no', photo: 'dl_photo', label: 'Driving Licence No.', eg: 'BR0120110012345', max: 20, caps: true },
  'VOTER ID': { key: 'voter_id', photo: 'voter_photo', label: 'Voter ID', eg: 'ABC1234567', max: 20, caps: true },
};

export interface LabForm {
  fullname: string;
  owner_name: string;
  mobile: string;
  office_tel: string;
  alt_mobile: string;
  email: string;
  fax: string;
  gst_no: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  /** Every document produced as proof. Stored as one comma-separated column. */
  id_proofs: string[];
  address_proofs: string[];
  pan_no: string;
  pan_photo: string;
  adhar_no: string;
  adhar_photo: string;
  passport_no: string;
  passport_photo: string;
  dl_no: string;
  dl_photo: string;
  voter_id: string;
  voter_photo: string;
  account_holder: string;
  account_no: string;
  account_type: string;
  ifsc_code: string;
  bank_name: string;
  bank_branch: string;
  commision: string;
  commission_type: string;
  registration_fee: string;
  profile_photo: string;
  company_logo: string;
  signature: string;
  /** The attachment list. JSON on the record, an array here. */
  documents: LabDocument[];
}

export const BLANK_LAB: LabForm = {
  fullname: '',
  owner_name: '',
  mobile: '',
  office_tel: '',
  alt_mobile: '',
  email: '',
  fax: '',
  gst_no: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  id_proofs: [],
  address_proofs: [],
  pan_no: '',
  pan_photo: '',
  adhar_no: '',
  adhar_photo: '',
  passport_no: '',
  passport_photo: '',
  dl_no: '',
  dl_photo: '',
  voter_id: '',
  voter_photo: '',
  account_holder: '',
  account_no: '',
  account_type: '',
  ifsc_code: '',
  bank_name: '',
  bank_branch: '',
  commision: '',
  commission_type: 'percent',
  registration_fee: '',
  profile_photo: '',
  company_logo: '',
  signature: '',
  documents: [],
};

/** The record as the API returns it: every field nullable but the id. */
export type LabRecord = Partial<Record<keyof LabForm, unknown>> & {
  id: number;
  /** The columns behind the two proof lists: one comma-separated string each. */
  id_proof_type?: unknown;
  address_proof_type?: unknown;
};

/** An account, mapped onto the form. Absent and null both become empty. */
export function labFromRecord(d: LabRecord): LabForm {
  const out: LabForm = { ...BLANK_LAB };
  for (const key of Object.keys(BLANK_LAB) as (keyof LabForm)[]) {
    if (key === 'documents' || key === 'id_proofs' || key === 'address_proofs') continue;
    const value = d[key];
    (out as unknown as Record<string, unknown>)[key] =
      value === null || value === undefined ? '' : String(value);
  }

  // A column each, several answers each: "PAN,AADHAR". Blanks and stray spaces
  // are dropped rather than becoming a proof nobody produced.
  const list = (value: unknown) =>
    String(value ?? '')
      .split(',')
      .map((one) => one.trim())
      .filter((one) => one !== '');

  // Not every account has been given a reading; a blank one is the percentage
  // everything meant before there was a choice.
  out.commission_type = out.commission_type === 'per_pc' ? 'per_pc' : 'percent';

  out.id_proofs = list(d.id_proof_type);
  out.address_proofs = list(d.address_proof_type);

  /*
    `documents` is JSON. The driver hands it back parsed, but a column written
    before this existed holds null and a row edited by hand could hold
    anything, so each entry is checked rather than trusted: a bad one is
    dropped instead of crashing the form somebody opened to fix it.
  */
  const raw = d.documents;
  out.documents = Array.isArray(raw)
    ? (raw as unknown[]).flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        const path = typeof row.path === 'string' ? row.path : '';
        if (!path) return [];
        return [
          {
            title: typeof row.title === 'string' ? row.title : 'Untitled',
            path,
            added_at: typeof row.added_at === 'string' ? row.added_at : undefined,
          },
        ];
      })
    : [];

  return out;
}

/**
 * The form as a PATCH body.
 *
 * Empty becomes `null`, not the empty string and certainly not the word
 * "null": clearing a field has to mean the record no longer holds a value, or
 * a bank column ends up printing four characters of nonsense on a document.
 */
export function labPatch(form: LabForm): Record<string, string | number | null | LabDocument[]> {
  const text = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    fullname: form.fullname,
    owner_name: text(form.owner_name),
    office_tel: text(form.office_tel),
    alt_mobile: text(form.alt_mobile),
    email: text(form.email),
    fax: text(form.fax),
    gst_no: text(form.gst_no),
    address: text(form.address),
    city: text(form.city),
    state: text(form.state),
    pincode: text(form.pincode),
    country: text(form.country),
    id_proof_type: form.id_proofs.length ? form.id_proofs.join(',') : null,
    address_proof_type: form.address_proofs.length ? form.address_proofs.join(',') : null,
    pan_no: text(form.pan_no),
    pan_photo: text(form.pan_photo),
    adhar_no: text(form.adhar_no),
    adhar_photo: text(form.adhar_photo),
    passport_no: text(form.passport_no),
    passport_photo: text(form.passport_photo),
    dl_no: text(form.dl_no),
    dl_photo: text(form.dl_photo),
    voter_id: text(form.voter_id),
    voter_photo: text(form.voter_photo),
    account_holder: text(form.account_holder),
    account_no: text(form.account_no),
    account_type: text(form.account_type),
    ifsc_code: text(form.ifsc_code),
    bank_name: text(form.bank_name),
    bank_branch: text(form.bank_branch),
    commision: form.commision === '' ? null : Number(form.commision),
    commission_type: form.commission_type === 'per_pc' ? 'per_pc' : 'percent',
    registration_fee: form.registration_fee === '' ? null : Number(form.registration_fee),
    profile_photo: text(form.profile_photo),
    company_logo: text(form.company_logo),
    signature: text(form.signature),
    // Sent as an array; the API validates each entry and stores the JSON.
    documents: form.documents,
  };
}

/** A row of one of the master lists, as much of it as this form reads. */
interface PlaceRow {
  id: number;
  name: string;
  country_id?: number;
  state_id?: number;
}

interface Props {
  form: LabForm;
  set: <K extends keyof LabForm>(key: K, value: LabForm[K]) => void;
  /** Fields belonging to one screen only — a password, an employee ID. */
  extra?: ReactNode;
}

const cell = { xs: 12, md: 4 } as const;

/* The attachment row's own columns, shared with the document list. */
const upright = FRAME_CELL;
const wide = WIDE_FRAME_CELL;

export default function LaboratoryFields({ form, set, extra }: Props) {
  const toast = useToast();

  /*
    Country, state and district come from the master lists.

    They were three free-text boxes, which is how one laboratory sits in
    "West Bengal", the next in "west bengal" and a third in "WB" — and why a
    report by state cannot be written. Master owns these lists; this reads
    them, and a name typed here that the list does not have is offered as an
    `Add "…"` option, which writes it to Master as well as to this record —
    the town a laboratory is in is often not on any list yet, and nobody can
    leave a half-filled form to go and add it.

    The three are fetched whole and narrowed here: they are short lists, one
    request each, and filtering in the browser means changing the country
    re-narrows the states with no round trip.
  */
  const countries = useFetch<{ data: PlaceRow[] }>('/master/countries?active=1');
  const states = useFetch<{ data: PlaceRow[] }>('/master/states?active=1');
  const districts = useFetch<{ data: PlaceRow[] }>('/master/districts?active=1');

  /* Names are compared loosely: the column holds what somebody typed years
     ago, and "West Bengal" is the row called "West bengal". */
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const countryRow = (countries.data?.data ?? []).find((c) => same(c.name, form.country));
  const stateRows = (states.data?.data ?? []).filter(
    (st) => !countryRow || st.country_id === countryRow.id,
  );
  const stateRow = stateRows.find((st) => same(st.name, form.state));
  const districtRows = (districts.data?.data ?? []).filter(
    (d) => !stateRow || d.state_id === stateRow.id,
  );

  /*
    The options for one of those selects.

    A value the list does not have is kept and offered as its own option. The
    alternative is a select that silently shows nothing for a laboratory whose
    town was typed before the list existed — the record would look empty and
    save empty, quietly losing an address.
  */
  const options = (rows: PlaceRow[], current: string) => {
    const names = rows.map((r) => r.name);
    return current.trim() && !names.some((nme) => same(nme, current))
      ? [...names, current]
      : names;
  };

  /**
   * Adds a name to a master list and returns whether it landed.
   *
   * A state needs its country and a district needs its state, and neither is
   * knowable when the box above is still empty — so the name is kept on the
   * record either way and only the master list goes unwritten. The same is
   * true of anybody without the Master permission: a laboratory's address is
   * their business, the shared list is head office's.
   */
  const addToMaster = async (
    path: string,
    name: string,
    parent?: { column: string; id?: number },
  ) => {
    if (parent && !parent.id) return false;
    try {
      await api.post(`/master/${path}`, {
        name,
        ...(parent?.id ? { [parent.column]: parent.id } : {}),
      });
      return true;
    } catch (e) {
      // A duplicate is a success as far as this form is concerned: the name is
      // on the list, which is all it wanted.
      const message = messageOf(e);
      if (/already exists/i.test(message)) return true;
      toast.error(`Saved on this record, but not added to the list — ${message}`);
      return false;
    }
  };

  /**
   * A place box: the master list, plus whatever the record already held, plus
   * whatever somebody types.
   *
   * Typing is the point. The old form was three free-text boxes, which is how
   * one laboratory sits in "West Bengal" and the next in "WB"; a bare select
   * fixes that and creates a worse problem, because the town this laboratory
   * is actually in is not on any list until somebody adds it, and the person
   * filling the form cannot leave it to go and do that. So: pick from the
   * list, or type a new name and take the `Add "…"` option, which puts it on
   * the master list for the next form as well as on this record.
   */
  const ADD = '\u0000add:';

  const placeField = (
    label: string,
    key: 'country' | 'state' | 'city',
    rows: PlaceRow[],
    onPick: (value: string) => void,
    note: string,
    /** Where a newly typed name goes, and what it hangs off. */
    master: { path: string; parent?: { column: string; id?: number }; reload: () => void },
  ) => (
    <Grid size={cell}>
      <Autocomplete
        freeSolo
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        options={options(rows, form[key])}
        /*
          The option's own spelling, when the record's differs only in case.
          With "West Bengal" in the column and "West bengal" on the list, an
          exact match finds neither and the box renders empty over a state the
          laboratory has had for years. The column is left alone until somebody
          actually picks something: quietly rewriting an address on load is not
          this form's business.
        */
        value={rows.find((r) => same(r.name, form[key]))?.name ?? form[key]}
        onChange={(_, chosen) => {
          const value = String(chosen ?? '');
          if (!value.startsWith(ADD)) return onPick(value);

          const name = value.slice(ADD.length);
          onPick(name);
          void addToMaster(master.path, name, master.parent).then(
            (added) => added && master.reload(),
          );
        }}
        /* The typed name is offered as its own option when the list has no
           such name — otherwise there is nothing to press and Enter is the
           only way through, which nobody guesses. */
        filterOptions={(all, params) => {
          const typed = params.inputValue.trim();
          const shown = all.filter((o) =>
            o.toLowerCase().includes(params.inputValue.trim().toLowerCase()),
          );
          if (typed && !all.some((o) => same(o, typed))) shown.push(ADD + typed);
          return shown;
        }}
        getOptionLabel={(o) => (o.startsWith(ADD) ? o.slice(ADD.length) : o)}
        renderOption={({ key: k, ...props }, o) => (
          <li key={k} {...props}>
            {o.startsWith(ADD) ? `Add "${o.slice(ADD.length)}"` : o}
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps.input,
                // The hint sits before the clear and dropdown buttons the
                // Autocomplete puts there, rather than replacing them.
                endAdornment: (
                  <>
                    {hintNode(note)}
                    {params.slotProps.input.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    </Grid>
  );

  /**
   * One row of the KYC block: which documents were produced as this kind of
   * proof. Several answers, because a franchise hands over two or three.
   */
  const proofSelect = (
    label: string,
    key: 'id_proofs' | 'address_proofs',
    choices: readonly string[],
    note: string,
  ) => (
    <Grid size={cell}>
      <TextField
        select
        label={label}
        value={form[key]}
        onChange={(e) => {
          const given = e.target.value as unknown as string[] | string;
          set(key, typeof given === 'string' ? given.split(',').filter(Boolean) : given);
        }}
        slotProps={{
          select: {
            multiple: true,
            // Listed in the order the options are, not the order they were
            // ticked, so the summary matches the blocks below it.
            renderValue: (selected) =>
              choices.filter((o) => (selected as string[]).includes(o)).join(', '),
          },
          ...hint(note, true),
        }}
      >
        {choices.map((o) => (
          <MenuItem key={o} value={o}>
            <Checkbox size="small" checked={form[key].includes(o)} sx={{ p: 0.5, mr: 1 }} />
            <ListItemText primary={o} slotProps={{ primary: { sx: { fontSize: 13.5 } } }} />
          </MenuItem>
        ))}
      </TextField>
    </Grid>
  );

  /* Every document named in either row, once. The Aadhaar is the usual answer
     to both and has one number and one scan. */
  const produced = PROOFS.filter(
    (o) => form.id_proofs.includes(o) || form.address_proofs.includes(o),
  );

  /*
    A chosen proof's number, asked for only once the document is chosen.

    Five proofs standing permanently empty is five boxes nobody fills; the two
    or three actually handed over are the ones worth asking about.
  */
  const proofNumber = (choice: string) => {
    const spec = PROOF[choice];
    if (!spec) return null;
    return (
      <Grid size={cell} key={choice}>
        <TextField
          label={spec.label}
          placeholder={`Eg. ${spec.eg}`}
          value={form[spec.key]}
          onChange={(e) => set(spec.key, spec.caps ? e.target.value.toUpperCase() : e.target.value)}
          slotProps={{ htmlInput: { maxLength: spec.max } }}
        />
      </Grid>
    );
  };

  /*
    The scan of that proof, framed portrait beside the photograph and the
    signature rather than sitting in the middle of the typed fields.

    Every upload on this form is in one place at the foot of it. A drop zone
    is a tall thing among one-line inputs, and one standing between two text
    fields breaks the three-column grid into steps; gathered at the end they
    line up as a row of frames, which is also the order somebody works in —
    type the details, then attach the paperwork.

    Portrait, 3:4, because these are scans of documents: an A4 page, a card
    photographed on a desk. The signature keeps its own wide strip.
  */
  const proofUpload = (choice: string) => {
    const spec = PROOF[choice];
    if (!spec) return null;
    return (
      <Grid size={upright} key={choice}>
        <FileField
          label={`${choice} copy`}
          bucket="documentation"
          accept="image/*,application/pdf"
          ratio="3 / 4"
          fill
          value={form[spec.photo] || null}
          onChange={(v) => set(spec.photo, v ?? '')}
        />
      </Grid>
    );
  };

  return (
    <Grid container spacing={2}>
      {/* ---------------------------------------------- applicant's detail */}
      <Grid size={cell}>
        <TextField
          label="Laboratory Name"
          placeholder="Eg. Sri Jewelery & Lab"
          value={form.fullname}
          onChange={(e) => set('fullname', e.target.value)}
          required
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Owner Name"
          placeholder="Eg. Ramesh Mishra"
          value={form.owner_name}
          onChange={(e) => set('owner_name', e.target.value)}
          required
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Mobile"
          placeholder="Eg. 9875642310"
          value={form.mobile}
          onChange={(e) => set('mobile', e.target.value)}
          slotProps={{
            htmlInput: { maxLength: 10, inputMode: 'numeric' },
            ...hint('Ten digits. The printed form gives each one its own box.'),
          }}
          required
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Official Email"
          type="email"
          placeholder="Eg. lab@example.com"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          required
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="GST No"
          placeholder="Eg. 22XXXXXXXXXXXXXXX"
          value={form.gst_no}
          onChange={(e) => set('gst_no', e.target.value)}
          required
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="FAX No"
          placeholder="Eg. 9879854465"
          value={form.fax}
          onChange={(e) => set('fax', e.target.value)}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Office Tel No."
          placeholder="Eg. 0612-2345678"
          value={form.office_tel}
          onChange={(e) => set('office_tel', e.target.value)}
          slotProps={hint('STD code first, then the number — "0612-2345678". The form prints the code in its own box.')}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Alt Mobile"
          placeholder="Eg. 9875642310"
          value={form.alt_mobile}
          onChange={(e) => set('alt_mobile', e.target.value)}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Permanent Address"
          placeholder="Full address"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />
      </Grid>
      {/*
        Country, then state, then district: each narrows the next, so they are
        asked in that order rather than in the paper form's, where country is
        last and would re-open the two answers above it.

        Changing one clears what hangs off it. A state left over from the
        previous country is worse than an empty box: it reads as an answer.
      */}
      {placeField(
        'Country',
        'country',
        countries.data?.data ?? [],
        (value) => {
          set('country', value);
          if (form.state) set('state', '');
          if (form.city) set('city', '');
        },
        'From Master › Country. Type a country that is not listed and take the Add option to put it on the list.',
        { path: 'countries', reload: countries.reload },
      )}
      {placeField(
        'State',
        'state',
        stateRows,
        (value) => {
          set('state', value);
          if (form.city) set('city', '');
        },
        'The states of the country chosen above, from Master › State. Type a new one and take the Add option; choose the country first, or it is kept on this record only.',
        {
          path: 'states',
          parent: { column: 'country_id', id: countryRow?.id },
          reload: states.reload,
        },
      )}
      {placeField(
        'Town / City',
        'city',
        districtRows,
        (value) => set('city', value),
        'The districts of the state chosen above, from Master › District. Most towns are not on it — type the name and take the Add option, which puts it there for the next form too.',
        {
          path: 'districts',
          parent: { column: 'state_id', id: stateRow?.id },
          reload: districts.reload,
        },
      )}
      <Grid size={cell}>
        <TextField
          label="Pin Code"
          placeholder="Eg. 800020"
          value={form.pincode}
          onChange={(e) => set('pincode', e.target.value)}
        />
      </Grid>

      {/* -------------------------------------------------- kyc documents

          Two questions, as the paper asks them. Whichever documents are named
          in either, their numbers are asked for once each below and their
          scans once each at the foot of the form: an Aadhaar produced as both
          proofs is one card with one number. */}
      {proofSelect(
        'ID Proof',
        'id_proofs',
        ID_PROOFS,
        'The documents produced as proof of identity — the top row of tick boxes on the printed form.',
      )}
      {proofSelect(
        'Address Proof',
        'address_proofs',
        ADDRESS_PROOFS,
        'The documents produced as proof of address — the second row on the printed form. Usually the Aadhaar card, which proves both and is named in both.',
      )}
      {/* Ordered by the list, not by the order they were ticked, so the form
          reads the same way twice. The scan of each goes with the other
          attachments at the foot of the form. */}
      {produced.map(proofNumber)}

      {/* ---------------------------------------------------- bank details */}
      <Grid size={cell}>
        <TextField
          label="Accountholder's Name"
          placeholder="Eg. Ramesh Mishra"
          slotProps={hint("Left empty, the form prints the owner's name.")}
          value={form.account_holder}
          onChange={(e) => set('account_holder', e.target.value)}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Account No"
          placeholder="Eg. 12345678901234"
          value={form.account_no}
          onChange={(e) => set('account_no', e.target.value)}
          slotProps={{ htmlInput: { maxLength: 16 } }}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          select
          label="A/C Type"
          value={form.account_type}
          onChange={(e) => set('account_type', e.target.value)}
        >
          <MenuItem value="">Not recorded</MenuItem>
          {ACCOUNT_TYPES.map((o) => (
            <MenuItem key={o} value={o}>
              {o.charAt(0) + o.slice(1).toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={cell}>
        <TextField
          label="IFSC Code"
          placeholder="Eg. SBIN0001234"
          value={form.ifsc_code}
          onChange={(e) => set('ifsc_code', e.target.value.toUpperCase())}
          slotProps={{ htmlInput: { maxLength: 11 } }}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Bank Name"
          placeholder="Eg. State Bank of India"
          value={form.bank_name}
          onChange={(e) => set('bank_name', e.target.value)}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Branch"
          placeholder="Eg. Boring Road"
          value={form.bank_branch}
          onChange={(e) => set('bank_branch', e.target.value)}
        />
      </Grid>

      {/* -------------------------------------------------------- the terms

          Two ways a franchise is paid, and one number. A percentage is taken
          off what the laboratory collects; a per-piece rate is rupees for each
          piece certified and has nothing to do with what the order was worth.
          Which one applies decides the arithmetic on every commission screen
          and the wording printed on the franchisee form, so it is asked here
          rather than assumed. */}
      <Grid size={cell}>
        <TextField
          select
          label="Commission Type"
          value={form.commission_type}
          onChange={(e) => set('commission_type', e.target.value)}
          slotProps={hint(
            'A percentage of what the laboratory collects, or a flat amount for each piece it certifies. The printed form and every commission figure follow this.',
            true,
          )}
        >
          <MenuItem value="percent">Percentage</MenuItem>
          <MenuItem value="per_pc">Per Pc.</MenuItem>
        </TextField>
      </Grid>
      <Grid size={cell}>
        <TextField
          label={form.commission_type === 'per_pc' ? 'Commission (₹ per Pc.)' : 'Commission (%)'}
          type="number"
          placeholder={form.commission_type === 'per_pc' ? 'Eg. 15' : 'Eg. 10'}
          value={form.commision}
          onChange={(e) => set('commision', e.target.value)}
          /* A percentage cannot exceed a hundred; rupees per piece can. */
          slotProps={{
            htmlInput:
              form.commission_type === 'per_pc'
                ? { min: 0, step: 0.01 }
                : { min: 0, max: 100, step: 0.01 },
          }}
        />
      </Grid>
      <Grid size={cell}>
        <TextField
          label="Registration Fee (₹)"
          type="number"
          placeholder="Eg. 25000"
          value={form.registration_fee}
          onChange={(e) => set('registration_fee', e.target.value)}
          slotProps={{
            htmlInput: { min: 0, step: 0.01 },
            ...hint('Printed on the form in figures and in words.'),
          }}
        />
      </Grid>

      {extra}

      {/*
        ------------------------------------------------------ attachments

        A row of their own, on a grid sized to the frames.

        Two things were wrong. A frame is several times the height of a text
        input, so while the uploads flowed with the fields the photograph
        landed in the third column of the last row of inputs and held that
        whole row open. And a portrait frame capped at its natural width inside
        a third-of-the-page column left most of that column empty, which is the
        space that kept appearing beside each one.

        So: their own full-width cell, and inside it a grid whose columns are
        the width the frames actually want — two units for an upright frame,
        four for the signature's wide strip — with each frame filling the
        column it is given. Nothing is capped, nothing is stranded, and the row
        adds up: photograph, signature and three proofs make twelve.
      */}
      <Grid size={12}>
        <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Grid size={upright}>
            <FileField
              label="Photo"
              bucket="employee"
              // The laboratory's photograph. It prints in the photo panel of
              // the Franchisee Form, which had nowhere to get one from until
              // this field existed.
              ratio="3 / 4"
              fill
              value={form.profile_photo || null}
              onChange={(v) => set('profile_photo', v ?? '')}
            />
          </Grid>
          <Grid size={upright}>
            <FileField
              label="Logo"
              bucket="employee"
              // The franchise's own mark, for its letterhead and its cards. A
              // logo is drawn to fit rather than cropped to a shape: cropping
              // one is the difference between a brand and a piece of it.
              ratio="1 / 1"
              fill
              value={form.company_logo || null}
              onChange={(v) => set('company_logo', v ?? '')}
            />
          </Grid>
          <Grid size={wide}>
            <FileField
              label="Signature"
              bucket="signature"
              // A signature is a wide strip, not a square: framed to its own
              // shape it is legible at a glance instead of being cropped to a
              // thumbnail of the middle of somebody's name.
              ratio="3 / 1"
              fill
              value={form.signature || null}
              onChange={(v) => set('signature', v ?? '')}
            />
          </Grid>
          {produced.map(proofUpload)}
        </Grid>
      </Grid>

      {/* ------------------------------------------------------- documents */}
      <Grid size={12}>
        <DocumentAssets value={form.documents} onChange={(d) => set('documents', d)} />
      </Grid>
    </Grid>
  );
}
