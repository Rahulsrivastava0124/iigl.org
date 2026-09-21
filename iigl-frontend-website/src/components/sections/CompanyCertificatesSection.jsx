import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Award, Building2, ChevronLeft, ChevronRight, Handshake, Settings, ShieldCheck } from 'lucide-react';
import SectionLabel from '../SectionLabel.jsx';
import { fileUrl, usePublic } from '../../lib/api.js';

/**
 * Our Company Certificates: the registrations and accreditations head office
 * publishes under Website Setup › Certificates, each a picture with its title.
 *
 * Until head office adds one, three built-in cards show the kinds of document
 * the section is for, drawn as certificate frames rather than photographs.
 *
 * A row of three that moves by whole cards, as the registered customers do;
 * View All lays every one out in a grid instead. A picture opens full size.
 */

const ICONS = { award: Award, building: Building2, gear: Settings, handshake: Handshake, shield: ShieldCheck };

// Dummy cards, shown until the panel has a certificate (Website Setup › Certificates).
const BUILT_IN = [
  { id: 'incorporation', title: 'Certificate of Incorporation', subtitle: 'Ministry of Corporate Affairs, Government of India', icon: 'building' },
  { id: 'iso', title: 'ISO 9001:2015 Certification', subtitle: 'Quality Management System', icon: 'gear' },
  { id: 'partner', title: 'IIGL Partner Certificate', subtitle: 'Education & Certification', icon: 'handshake' },
];

function CertificateCard({ certificate, inRow }) {
  const Icon = ICONS[certificate.icon] ?? Award;
  const src = fileUrl(certificate.image);
  return (
    <article
      className={`flex flex-col rounded-xl border border-[#e6e8ee] bg-white p-3 shadow-[0_15px_38px_rgba(44,59,100,0.08)] ${
        inRow ? 'shrink-0 snap-start basis-full sm:basis-[calc((100%-20px)/2)] lg:basis-[calc((100%-40px)/3)]' : ''
      }`}
    >
      {src ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={certificate.title ? `Open ${certificate.title}` : 'Open the certificate'}
          className="block overflow-hidden rounded-lg border border-[#f0e6d6] bg-[#fbf8f3]"
        >
          <img
            src={src}
            alt=""
            loading="lazy"
            className="aspect-[3/2] w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
          />
        </a>
      ) : (
        // A dummy card has no picture: a certificate frame with its title instead.
        <div className="flex aspect-[3/2] flex-col items-center justify-center rounded-lg border-[6px] border-double border-[#d9b779] bg-[radial-gradient(circle_at_center,#fffdf8_0%,#f5ead6_100%)] px-6 text-center">
          <Icon aria-hidden className="h-10 w-10 text-[#bd7724]" strokeWidth={1.4} />
          <p className="m-0 mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b93a7]">Certificate</p>
          <p className="m-0 mt-2 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[22px] font-medium leading-tight text-[#061948]">
            {certificate.title}
          </p>
          {certificate.subtitle && <p className="m-0 mt-2 text-[13px] text-[#4a5265]">{certificate.subtitle}</p>}
        </div>
      )}
    </article>
  );
}

export default function CompanyCertificatesSection() {
  const live = usePublic('/company-certificates');
  const certificates = live?.length ? live : BUILT_IN;
  const count = certificates.length;
  const track = useRef(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [showAll, setShowAll] = useState(false);

  // A page is as many whole cards as the row shows at once, so an arrow lands
  // on the snap points rather than part-way into a card.
  const step = useCallback(() => {
    const el = track.current;
    const card = el?.querySelector('article');
    if (!el || !card) return { size: 1, perPage: 1, count: 0 };
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const size = card.getBoundingClientRect().width + gap;
    const perPage = Math.max(1, Math.floor((el.clientWidth + gap) / size));
    return { size, perPage, count: el.querySelectorAll('article').length };
  }, []);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const { size, perPage, count: cards } = step();
    const total = Math.max(1, Math.ceil(cards / perPage));
    setPages(el.scrollWidth > el.clientWidth + 1 ? total : 1);
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setPage(atEnd ? total - 1 : Math.min(total - 1, Math.round(el.scrollLeft / (size * perPage))));
  }, [step]);

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    el.scrollTo({ left: 0 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, count, showAll]);

  const goTo = (index) => {
    const el = track.current;
    if (!el) return;
    const { size, perPage } = step();
    el.scrollTo({ left: Math.max(0, index) * size * perPage, behavior: 'smooth' });
  };

  const canScroll = !showAll && pages > 1;

  return (
    <section
      id="certificates"
      className="relative overflow-hidden bg-linear-to-b from-white to-[#fbf8f3] px-4 py-12 text-[#2c3b64] sm:px-8 lg:px-12"
    >
      {/* The handwritten flourish in the corner. Decoration, so hidden from screen readers. */}
      <p
        aria-hidden
        className="pointer-events-none absolute right-12 top-8 m-0 hidden -rotate-12 font-['Great_Vibes',cursive] text-[36px] leading-[1.05] text-[#0b2a63]/80 xl:block"
      >
        Certified
        <span className="ml-5 block">Trusted</span>
        <span className="ml-10 block">Globally</span>
        <span className="ml-20 mt-3 block h-px w-16 bg-[#d58a2b]/60" />
      </p>

      <div className="relative mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <SectionLabel>Trust &amp; Authenticity</SectionLabel>
          <h2 className="m-0 mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[24px]">
            Our Company <span className="text-[#bd7724]">Certificates</span>
          </h2>
          <p className="mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]">
            Recognitions that reflect our commitment to quality, trust and excellence.
          </p>
        </div>

        <div className="relative mt-8">
          <div
            ref={track}
            onScroll={measure}
            aria-label="Company certificates"
            className={
              showAll
                ? 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'
                : 'flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            }
          >
            {certificates.map((certificate) => (
              <CertificateCard key={certificate.id} certificate={certificate} inRow={!showAll} />
            ))}
          </div>

          {canScroll && (
            <>
              <button
                type="button"
                onClick={() => goTo(page - 1)}
                disabled={page === 0}
                aria-label="Previous certificates"
                className="absolute -left-2 top-[40%] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#e6e8ee] bg-white text-[#bd7724] shadow-[0_8px_20px_rgba(6,25,72,0.14)] transition-opacity disabled:opacity-40 sm:-left-6 lg:-left-7"
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => goTo(page + 1)}
                disabled={page >= pages - 1}
                aria-label="Next certificates"
                className="absolute -right-2 top-[40%] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#e6e8ee] bg-white text-[#bd7724] shadow-[0_8px_20px_rgba(6,25,72,0.14)] transition-opacity disabled:opacity-40 sm:-right-6 lg:-right-7"
              >
                <ChevronRight className="h-6 w-6" strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        {canScroll && (
          <div className="mt-6 flex items-center justify-center gap-3">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show page ${i + 1} of ${pages}`}
                aria-current={i === page}
                className={`h-3 w-3 rounded-full transition-colors ${i === page ? 'bg-[#bd7724]' : 'bg-[#d5d9e2] hover:bg-[#c3c9d6]'}`}
              />
            ))}
          </div>
        )}

        {/* ------------------------------------------ the foot: promise, button, words */}
        <div className="mt-8 grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fdf7ef] text-[#061948]">
              <ShieldCheck aria-hidden className="h-7 w-7" strokeWidth={1.6} />
            </span>
            <span aria-hidden className="h-10 w-px shrink-0 bg-[#e6e8ee]" />
            <div>
              <p className="m-0 text-[16px] font-medium text-[#061948]">Trusted. Certified. Committed.</p>
              <p className="m-0 mt-1 text-[14px] text-[#4a5265]">Setting higher standards in gem and jewellery certification.</p>
            </div>
          </div>

          <div className="flex justify-center">
            {(pages > 1 || showAll) && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="group inline-flex h-[52px] items-center gap-3 rounded-lg bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-10 text-[16px] font-medium text-white shadow-[0_10px_22px_rgba(189,119,36,0.28)] transition-opacity hover:opacity-95"
              >
                {showAll ? 'Show Less' : 'View All Certificates'}
                <ArrowRight
                  aria-hidden
                  className={`h-5 w-5 transition-transform group-hover:translate-x-1 ${showAll ? 'rotate-180' : ''}`}
                  strokeWidth={2}
                />
              </button>
            )}
          </div>

          <p className="m-0 hidden justify-self-end border-l border-[#d58a2b]/40 pl-5 text-[16px] font-medium leading-[1.6] text-[#bd7724] md:block">
            Knowledge · Integrity
            <br />A Brighter Tomorrow
          </p>
        </div>
      </div>
    </section>
  );
}
