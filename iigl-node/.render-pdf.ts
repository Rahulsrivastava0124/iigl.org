import { franchiseeFormHtml, franchiseeFormPdf } from './src/services/document.service.js';
import { db } from './src/db/index.js';
import { writeFile } from 'node:fs/promises';

const OUT =
  'C:/Users/rahul/AppData/Local/Temp/claude/C--Users-rahul-Documents-GitHub-iigl-org/01bb3380-2823-443a-8afa-c21451a5ba41/scratchpad/';
const ID = 102;

const KEYS = [
  'office_tel',
  'id_proof_type',
  'address_proof_type',
  'account_holder',
  'bank_branch',
  'account_type',
  'registration_fee',
  'account_no',
  'ifsc_code',
] as const;

const before = await db.selectFrom('users').select(KEYS).where('id', '=', ID).executeTakeFirstOrThrow();

await db
  .updateTable('users')
  .set({
    office_tel: '0612-2345678',
    id_proof_type: 'PAN',
    address_proof_type: 'VOTER ID',
    account_holder: 'Ramesh Kumar Mishra',
    bank_branch: 'Boring Road',
    account_type: 'CURRENT',
    registration_fee: '125500.50',
    account_no: before.account_no ?? '1234567890123456',
    ifsc_code: before.ifsc_code ?? 'SBIN0001234',
  })
  .where('id', '=', ID)
  .execute();

await writeFile(OUT + 'franchisee-form.html', await franchiseeFormHtml(ID), 'utf8');
await writeFile(OUT + 'franchisee-form-blank.html', await franchiseeFormHtml(ID, { blank: true }), 'utf8');

const pdf = await franchiseeFormPdf(ID);
await writeFile(OUT + 'franchisee-form.pdf', pdf);

await db.updateTable('users').set(before).where('id', '=', ID).execute();

const text = pdf.toString('latin1');
const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
console.log('pdf bytes  :', pdf.length);
console.log('page count :', counts.length ? Math.max(...counts) : '(no /Count — check by eye)');
console.log('restored   :', JSON.stringify(await db.selectFrom('users').select(KEYS).where('id', '=', ID).executeTakeFirstOrThrow()));
await db.destroy();
