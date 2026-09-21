import { Router, type Request } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { ROLE } from '../middleware/auth.js';
import { setting } from '../services/settings.service.js';

/**
 * A website page's own settings: head office's, and each laboratory's branch
 * page — the banner, the content, a gallery and three social links.
 *
 * One row per page in `site_profiles`, keyed by `lab_id`: the laboratory's user
 * id, or 0 for head office. A laboratory edits its own page; head office edits
 * its own and any laboratory's. Reading is public (public.routes.ts).
 */
export const siteRoutes = Router();

/** `site_profiles.lab_id` for head office's own page. */
export const HEAD_OFFICE = 0;

const GALLERY_MAX = 24;
const CONTENT_MAX = 100_000;
const PICTURE = /^(public\/)?uploads\/banner\/[A-Za-z0-9._-]+$/;
const text = (v: unknown) => (v == null ? '' : String(v).trim());

export interface SiteProfile {
  banner: string | null;
  content: string;
  gallery: string[];
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  updated_at: string | Date | null;
}

const galleryOf = (v: unknown): string[] => {
  try {
    const list = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * One page's settings, or the empty page when nothing has been saved yet.
 *
 * Head office's three social links are the exception: they are company details
 * and live in Settings, under `company.whatsapp` and the two beside it, rather
 * than in this table. They are read back in here so that everything reading a
 * page — the website footer, the course enquiry link — goes on asking one
 * endpoint for one shape and does not have to know where a given page keeps
 * them. A laboratory's own links are its row's, as they always were.
 */
export async function siteProfile(labId: number): Promise<SiteProfile> {
  const row = await db.selectFrom('site_profiles').selectAll().where('lab_id', '=', labId).executeTakeFirst();

  const social =
    labId === HEAD_OFFICE
      ? await (async () => {
          const [whatsapp, facebook, instagram] = await Promise.all([
            setting('company.whatsapp'),
            setting('company.facebook'),
            setting('company.instagram'),
          ]);
          return {
            whatsapp: whatsapp || null,
            facebook: facebook || null,
            instagram: instagram || null,
          };
        })()
      : {
          whatsapp: row?.whatsapp ?? null,
          facebook: row?.facebook ?? null,
          instagram: row?.instagram ?? null,
        };

  return {
    banner: row?.banner ?? null,
    content: row?.content ?? '',
    gallery: galleryOf(row?.gallery),
    ...social,
    updated_at: row?.updated_at ?? null,
  };
}

/**
 * The company's own contact details, as the public website prints them.
 *
 * Settings, not this table: they are the company's, not a page's, and the
 * panel keeps them under Settings → Company beside the name that goes on a
 * certificate. The website used to carry its own copy of every one of these
 * — an address in the footer, one telephone number in the footer and a
 * different one on the contact page, a third in a WhatsApp link — so a change
 * of number meant a code change, and the numbers had already drifted apart.
 *
 * Blank is null rather than an empty string, so a caller can fall back to what
 * it printed before instead of showing a heading with nothing under it.
 */
export interface CompanyDetails {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  /** The office line, the one printed on certificates and invoices. */
  phone: string | null;
  /** What the website tells a visitor to ring, when that is a different one. */
  contact_number: string | null;
  email: string | null;
  website: string | null;
}

export async function companyDetails(): Promise<CompanyDetails> {
  const [name, address, city, state, pincode, phone, contactNumber, email, website] =
    await Promise.all([
      setting('company.name'),
      setting('company.address'),
      setting('company.city'),
      setting('company.state'),
      setting('company.pincode'),
      setting('company.phone'),
      setting('company.contact_number'),
      setting('company.email'),
      setting('company.website'),
    ]);

  return {
    name,
    address: address || null,
    city: city || null,
    state: state || null,
    pincode: pincode || null,
    phone: phone || null,
    contact_number: contactNumber || null,
    email: email || null,
    website: website || null,
  };
}

/** Whose page this request is about — or a refusal. */
async function ownerOf(req: Request): Promise<number> {
  const given = req.params.labId;
  if (given === undefined) {
    if (req.user.roleId === ROLE.SUPER) return HEAD_OFFICE;
    if (req.user.roleId === ROLE.LAB) return req.user.id;
    throw forbidden('Only head office and a laboratory have a website page.');
  }
  if (req.user.roleId !== ROLE.SUPER) throw forbidden('Only head office edits another laboratory’s page.');
  const id = Number(given);
  const lab =
    Number.isInteger(id) && id > 0
      ? await db.selectFrom('users').select('id').where('id', '=', id).where('role_id', '=', ROLE.LAB).executeTakeFirst()
      : undefined;
  if (!lab) throw notFound('Laboratory not found.');
  return id;
}

function picture(v: unknown, label: string): string | null {
  const s = text(v);
  if (!s) return null;
  if (!PICTURE.test(s)) throw badRequest(`${label} is not an uploaded picture.`);
  return s;
}

/** A link on one of the named sites, or null when blank. */
function link(v: unknown, label: string, host: string): string | null {
  const s = text(v);
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw badRequest(`${label} must be the full link, starting https://${host}/`);
  }
  const onSite = url.hostname === host || url.hostname.endsWith(`.${host}`);
  if (!/^https?:$/.test(url.protocol) || !onSite) throw badRequest(`${label} must be a link on ${host}.`);
  if (url.toString().length > 255) throw badRequest(`${label} is longer than 255 characters.`);
  return url.toString();
}

/**
 * A WhatsApp number as wa.me wants it: digits with the country code. Ten digits
 * alone are an Indian mobile, and get 91 in front.
 */
function whatsapp(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const digits = s.replace(/[\s()+.-]/g, '');
  if (!/^\d{10,15}$/.test(digits)) {
    throw badRequest('WhatsApp is a phone number with its country code — 91 98765 43210.');
  }
  return digits.length === 10 ? `91${digits}` : digits;
}

const read = wrap(async (req, res) => {
  res.json({ data: await siteProfile(await ownerOf(req)) });
});

/*
  Only the fields sent change. Head office saves its social links and its
  gallery from two different screens, and a save from one must not blank what
  the other holds.
*/
const write = wrap(async (req, res) => {
  const labId = await ownerOf(req);
  const b = req.body ?? {};
  const sent = (key: string) => Object.prototype.hasOwnProperty.call(b, key);

  const values: Record<string, unknown> = { updated_by: req.user.id, updated_at: new Date() };
  if (sent('banner')) values.banner = picture(b.banner, 'The banner');
  if (sent('content')) {
    const content = typeof b.content === 'string' ? b.content : '';
    if (content.length > CONTENT_MAX) throw badRequest('The content is too long.');
    values.content = content.trim() ? content : null;
  }
  if (sent('gallery')) {
    const given = Array.isArray(b.gallery) ? b.gallery : [];
    if (given.length > GALLERY_MAX) throw badRequest(`A gallery holds at most ${GALLERY_MAX} pictures.`);
    const gallery = [...new Set(given.map((p: unknown) => picture(p, 'A gallery picture')).filter(Boolean))];
    values.gallery = gallery.length ? JSON.stringify(gallery) : null;
  }
  if (sent('whatsapp')) values.whatsapp = whatsapp(b.whatsapp);
  if (sent('facebook')) values.facebook = link(b.facebook, 'Facebook', 'facebook.com');
  if (sent('instagram')) values.instagram = link(b.instagram, 'Instagram', 'instagram.com');

  await db
    .insertInto('site_profiles')
    .values({ lab_id: labId, ...values, created_at: new Date() } as never)
    .onDuplicateKeyUpdate(values as never)
    .execute();

  res.json({ data: await siteProfile(labId) });
});

siteRoutes.get('/profile', read);
siteRoutes.put('/profile', write);
siteRoutes.get('/profile/:labId', read);
siteRoutes.put('/profile/:labId', write);
