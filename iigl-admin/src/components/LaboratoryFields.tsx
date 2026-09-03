import type { ReactNode } from 'react';
import { useFetch } from '../lib/useFetch';
import { Checkbox, Grid, ListItemText, MenuItem, TextField } from '@mui/material';
import FileField from './FileField';
import DocumentAssets, { type LabDocument } from './DocumentAssets';
import { FRAME_CELL, WIDE_FRAME_CELL, hint } from './ui';

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
 * The documents somebody can produce as proof, in the order the paper prints
 * them.
 *
 * One list, not two. The form asks for identity proof and address proof in
 * separate boxes, but an Aadhaar card answers both and a franchise hands over
 * two or three documents between them — so the panel asks once, several
 * answers are allowed, and each row of ticks on the printed form reads from
 * the same set.
 */
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
  registration_fee: string;
  profile_photo: string;
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
  registration_fee: '',
  profile_photo: '',
  signature: '',
  documents: [],
};

/** The record as the API returns it: every field nullable but the id. */
export type LabRecord = Partial<Record<keyof LabForm, unknown>> & {
  id: number;
  /** The column behind `id_proofs`: one comma-separated string. */
  id_proof_type?: unknown;
};

/** An account, mapped onto the form. Absent and null both become empty. */
export function labFromRecord(d: LabRecord): LabForm {
  const out: LabForm = { ...BLANK_LAB };
  for (const key of Object.keys(BLANK_LAB) as (keyof LabForm)[]) {
    if (key === 'documents' || key === 'id_proofs') continue;
    const value = d[key];
    (out as unknown as Record<string, unknown>)[key] =
      value === null || value === undefined ? '' : String(value);
  }

  // One column, several answers: "PAN,AADHAR". Blanks and stray spaces are
  // dropped rather than becoming a proof nobody produced.
  out.id_proofs = String(d.id_proof_type ?? '')
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '');

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
    registration_fee: form.registration_fee === '' ? null : Number(form.registration_fee),
    profile_photo: text(form.profile_photo),
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
  /*
    Country, state and district come from the master lists.

    They were three free-text boxes, which is how one laboratory sits in
    "West Bengal", the next in "west bengal" and a third in "WB" — and why a
    report by state cannot be written. Master owns these lists; this reads
    them, and head office adds a missing district there rather than inventing
    it in a laboratory record.

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

  /** A place select: the master list, plus whatever the record already held. */
  const placeField = (
    label: string,
    key: 'country' | 'state' | 'city',
    rows: PlaceRow[],
    onPick: (value: string) => void,
    note?: string,
  ) => (
    <Grid size={cell}>
      <TextField
        select
        label={label}
        /*
          The option's own spelling, when the record's differs only in case.
          A Select matches its value exactly: with "West Bengal" in the column
          and "West bengal" on the list, it finds neither and renders an empty
          box over a state the laboratory has had for years. Matching loosely
          and displaying the list's spelling shows the answer; the column is
          left alone until somebody actually picks something, because quietly
          rewriting an address on load is not this form's business.
        */
        value={rows.find((r) => same(r.name, form[key]))?.name ?? form[key]}
        onChange={(e) => onPick(e.target.value)}
        slotProps={note ? hint(note, true) : undefined}
      >
        <MenuItem value="">Not recorded</MenuItem>
        {options(rows, form[key]).map((name) => (
          <MenuItem key={name} value={name}>
            {name}
          </MenuItem>
        ))}
      </TextField>
    </Grid>
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
          label="FAX No"
          placeholder="Eg. 9879854465"
          value={form.fax}
          onChange={(e) => set('fax', e.target.value)}
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
        'From Master › Country. Add a missing one there and it appears here.',
      )}
      {placeField(
        'State',
        'state',
        stateRows,
        (value) => {
          set('state', value);
          if (form.city) set('city', '');
        },
        'The states of the country chosen above, from Master › State.',
      )}
      {placeField(
        'Town / City',
        'city',
        districtRows,
        (value) => set('city', value),
        'The districts of the state chosen above, from Master › District.',
      )}
      <Grid size={cell}>
        <TextField
          label="Pin Code"
          placeholder="Eg. 800020"
          value={form.pincode}
          onChange={(e) => set('pincode', e.target.value)}
        />
      </Grid>

      {/* ------------------------------------------------- kyc documents */}
      <Grid size={cell}>
        <TextField
          select
          label="ID Proof"
          value={form.id_proofs}
          onChange={(e) => {
            const given = e.target.value as unknown as string[] | string;
            set('id_proofs', typeof given === 'string' ? given.split(',').filter(Boolean) : given);
          }}
          slotProps={{
            select: {
              multiple: true,
              // Listed in the order the options are, not the order they were
              // ticked, so the summary matches the blocks below it.
              renderValue: (selected) =>
                PROOFS.filter((o) => (selected as string[]).includes(o)).join(', '),
            },
            ...hint(
              'Every document produced. Both rows of tick boxes on the printed form read from this one list, so an Aadhaar card ticks as identity proof and as address proof.',
              true,
            ),
          }}
        >
          {PROOFS.map((o) => (
            <MenuItem key={o} value={o}>
              <Checkbox size="small" checked={form.id_proofs.includes(o)} sx={{ p: 0.5, mr: 1 }} />
              <ListItemText primary={o} slotProps={{ primary: { sx: { fontSize: 13.5 } } }} />
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      {/* Ordered by the list, not by the order they were ticked, so the form
          reads the same way twice. The scan of each goes with the other
          attachments at the foot of the form. */}
      {PROOFS.filter((o) => form.id_proofs.includes(o)).map(proofNumber)}

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

      {/* ------------------------------------------------------- the terms */}
      <Grid size={cell}>
        <TextField
          label="Commission (%)"
          type="number"
          placeholder="Eg. 10"
          value={form.commision}
          onChange={(e) => set('commision', e.target.value)}
          slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
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
          {PROOFS.filter((o) => form.id_proofs.includes(o)).map(proofUpload)}
        </Grid>
      </Grid>

      {/* ------------------------------------------------------- documents */}
      <Grid size={12}>
        <DocumentAssets value={form.documents} onChange={(d) => set('documents', d)} />
      </Grid>
    </Grid>
  );
}
