import { useEffect, useState } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { getPublic } from './api.js';

/**
 * How people reach IIGL: the address, the numbers, the email and the social
 * links, as the panel has them.
 *
 * All of it comes from `/public/site` — the page's own row for the banner,
 * content, gallery and social links, and Settings › Company for the rest — so
 * the website prints what somebody typed into the panel rather than what was
 * typed into these files. Before this, a telephone number lived in three
 * components and had already drifted into three different numbers.
 *
 * **The built-in values below are still printed when a setting is blank.** Not
 * every field is filled in, and an address heading with nothing under it is
 * worse than last year's address: the site keeps working, and a filled setting
 * quietly takes over.
 */

/** What the site printed before any of this was a setting. */
const BUILT_IN = {
  address: ['15A, Gurudwara Road, Karol Bagh,', 'New Delhi - 110005, India'],
  email: 'info@iigl.education',
  phone: '911145678900',
  hours: 'Mon – Sat : 9:30 AM – 6:30 PM (IST)',
};

/*
  One request, however many components ask.

  Four of them want this — the footer, the FAQ panel, the contact page and the
  course enquiry — and each used to fetch it for itself, which is four
  identical requests on a page that shows two of them at once. The promise is
  kept rather than the answer, so callers that arrive while it is in flight
  wait on the same one. A failure is not kept: the next caller retries.
*/
let inFlight = null;

export function getSite() {
  if (!inFlight) {
    inFlight = getPublic('/public/site').catch((error) => {
      inFlight = null;
      throw error;
    });
  }
  return inFlight;
}

/** The whole `/public/site` payload, or null until it lands. */
export function useSite() {
  const [site, setSite] = useState(null);

  useEffect(() => {
    let live = true;
    getSite()
      .then((data) => {
        if (live) setSite(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return site;
}

/**
 * A stored telephone number as something to print and something to dial.
 *
 * The panel stores digits with the country code and nothing else, because that
 * is what a `wa.me` link needs. An Indian mobile — 91 and ten digits — is
 * printed in the grouping people read it in; anything else, a landline with an
 * STD code among them, is printed as it was typed, since guessing where to put
 * the spaces in an unknown numbering plan gets it wrong.
 */
export function phoneOf(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const mobile = digits.length === 12 && digits.startsWith('91');
  return {
    text: mobile ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : digits,
    href: `tel:${mobile ? '+' : ''}${digits}`,
  };
}

/**
 * The contact details, settings first and the built-in ones behind them.
 *
 * `phone` is the number the website tells a visitor to ring and `office` is
 * the one printed on certificates and invoices. They are often the same and
 * are allowed not to be, which is why the panel keeps two: the office line
 * goes on paper, and the counter answers the website.
 */
export function contactOf(site) {
  const company = site?.company ?? null;

  const address = company?.address
    ? [
        company.address,
        [company.city, company.state, company.pincode].filter(Boolean).join(' - '),
      ].filter(Boolean)
    : BUILT_IN.address;

  const email = company?.email || BUILT_IN.email;
  const office = phoneOf(company?.phone);
  const phone = phoneOf(company?.contact_number) ?? office ?? phoneOf(BUILT_IN.phone);

  return {
    name: company?.name ?? 'IIGL',
    address,
    email,
    emailHref: `mailto:${email}`,
    phone,
    office: office ?? phone,
    website: company?.website ?? null,
    /*
      The WhatsApp number is head office's social link rather than a company
      field: it is the same number the footer's WhatsApp icon opens, and one
      number with two homes is a number that goes out of date in one of them.
    */
    whatsapp: site?.whatsapp ? `https://wa.me/${site.whatsapp}` : null,
    hours: BUILT_IN.hours,
  };
}

/** The contact details, fetched. Built-in values until the API answers. */
export function useContact() {
  return contactOf(useSite());
}

/**
 * The address, the email and the number as a list of rows, the way the footer
 * and the education page both print them — an icon, one or two lines, and a
 * link for the two that can be followed. One list because they are the same
 * list: the education page used to import the footer's array to get it.
 */
export function contactRows(details) {
  return [
    { icon: MapPin, lines: details.address },
    { icon: Mail, lines: [details.email], href: details.emailHref },
    ...(details.phone ? [{ icon: Phone, lines: [details.phone.text], href: details.phone.href }] : []),
  ];
}
