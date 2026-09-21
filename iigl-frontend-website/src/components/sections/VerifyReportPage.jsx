import { useCallback, useEffect, useRef, useState } from 'react';
import { A11y, Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import {
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  FileSearch,
  FileText,
  Lock,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import verifyHero from '../../../Assets/hero/verify.jpg';
import { apiUrl, getPublic } from '../../lib/api.js';
import { contactOf, useSite } from '../../lib/site.js';

/**
 * Verify Report, at /verify-report: a grading report checked against the
 * laboratory's own record, by its number or its QR code. /verify-report/<id>
 * is what every printed QR carries, so that address verifies on arrival.
 * Withheld reports answer not found, the same as a number never issued.
 */

const serif = "font-['Playfair_Display',Georgia,'Times_New_Roman',serif]";

/** What a scanned code says: a printed IIGL QR is a /verify-report/<id> address; anything else is read as a report number. */
function readScan(text) {
  const id = text.match(/\/verify-report\/(\d+)/)?.[1];
  if (id) return { id };
  const no = text.trim();
  return /^[A-Za-z0-9-]{6,40}$/.test(no) ? { no } : null;
}

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

// ------------------------------------------------------------------ scanner

/**
 * The camera, read with the browser's own BarcodeDetector (Chrome, Edge,
 * Android). The camera stops when this unmounts, which is when the dialog closes.
 *
 * ponytail: Safari and Firefox have no BarcodeDetector, so there the page says
 * to scan with the phone's camera app — which opens the printed QR's address
 * directly. Add a decoder (jsQR) if scanning inside the page matters there.
 */
function Scanner({ onCode }) {
  const video = useRef(null);
  const [problem, setProblem] = useState(() => ('BarcodeDetector' in window ? '' : 'unsupported'));

  useEffect(() => {
    if (problem) return undefined;
    let stream;
    let timer;
    let stopped = false;
    (async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        const look = async () => {
          if (stopped) return;
          try {
            const [code] = await detector.detect(video.current);
            if (code?.rawValue) {
              onCode(code.rawValue);
              return;
            }
          } catch {
            // A frame that could not be read; the next one may.
          }
          timer = setTimeout(look, 250);
        };
        look();
      } catch {
        setProblem('camera');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode, problem]);

  if (problem) {
    return (
      <div className="flex flex-col items-center px-2 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf7ef] text-[#bd7724]">
          <QrCode aria-hidden className="h-7 w-7" strokeWidth={1.6} />
        </span>
        <p className="m-0 mt-4 text-[15px] leading-[1.65] text-[#3c4252]">
          {problem === 'unsupported'
            ? 'This browser cannot scan inside the page. Open your phone’s camera app and point it at the QR code on the report — it opens this page with the report already verified.'
            : 'The camera could not be opened. Allow camera access for this site, or type the report number instead.'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
      <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[16%] rounded-xl border-2 border-[#e3b447] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
      />
      <p className="absolute inset-x-0 bottom-3 m-0 text-center text-[13px] text-white">
        Point the camera at the QR code on the report
      </p>
    </div>
  );
}

// ------------------------------------------------------------------- result

/** The page each card prints on, as a CSS aspect ratio: A4 for the classic certificate, 7.2 × 2.5 in for the smart card. */
const CARD_SHAPE = { classic: '210 / 297', smart: '72 / 25' };
const CARD_NAME = { classic: 'Original certificate', smart: 'Smart card' };

/**
 * The original certificate, shown in the page: the PDF the laboratory printed,
 * rendered from the record, for each card the order paid for. A phone browser
 * that will not draw a PDF in a frame still has Open PDF.
 */
function OriginalCertificate({ data }) {
  const cards = data.cards ?? [];
  const [kind, setKind] = useState(cards.includes('classic') ? 'classic' : cards[0]);
  if (!kind) return null;
  const url = apiUrl(`/public/verify/${encodeURIComponent(data.report_no)}/pdf/${kind}`);

  return (
    <section className="border-t border-[#eef0f4] px-6 pb-6 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#bd7724]">{CARD_NAME[kind]}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {cards.length > 1 &&
            cards.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === kind}
                onClick={() => setKind(k)}
                className={`h-9 cursor-pointer rounded-full border px-4 text-[13px] font-medium ${
                  k === kind ? 'border-[#061948] bg-[#061948] text-white' : 'border-[#e6e8ee] bg-white text-[#2c3b64] hover:border-[#061948]'
                }`}
              >
                {CARD_NAME[k]}
              </button>
            ))}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e6e8ee] px-4 text-[13px] font-medium text-[#061948] transition-colors hover:border-[#061948]"
          >
            <FileText aria-hidden className="h-4 w-4" strokeWidth={1.8} />
            Open PDF
          </a>
        </div>
      </div>
      <iframe
        key={url}
        // The page alone, fitted to the frame's width: no viewer toolbar or thumbnail
        // strip (Open PDF is there to print or save).
        src={`${url}#toolbar=0&navpanes=0&view=FitH`}
        title={`${CARD_NAME[kind]} for report ${data.report_no}`}
        className="mx-auto mt-4 block w-full max-w-[680px] rounded-lg border border-[#e6e8ee] bg-[#f8f9fb]"
        style={{ aspectRatio: CARD_SHAPE[kind] }}
      />
    </section>
  );
}

/** The record in the page, for a report with no certificate to show. */
function Details({ data }) {
  const facts = [
    ['Gross weight', data.gross_weight],
    ['Carat weight', data.carat_weight],
    ['Size', data.size],
    ['Report date', formatDate(data.created_at)],
  ].filter(([, value]) => value);
  const attributes = [...(data.attributes ?? [])]
    .filter((a) => a.attr_name && a.value)
    .sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0));

  return (
    <div className={`grid gap-6 p-6 ${data.image ? 'md:grid-cols-[240px_1fr]' : ''}`}>
        {data.image && (
          <img
            src={apiUrl(data.image)}
            alt={data.subcategory ?? 'The item'}
            className="aspect-square w-full rounded-lg border border-[#e6e8ee] bg-[#f8f9fb] object-contain"
          />
        )}
        <div className="min-w-0">
          <h2 className={`m-0 ${serif} text-[28px] font-medium text-[#061948]`}>{data.subcategory ?? 'Grading report'}</h2>

          {facts.length > 0 && (
            <dl className="m-0 mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8b93a7]">{label}</dt>
                  <dd className="m-0 mt-1 text-[15px] font-medium text-[#061948]">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {attributes.length > 0 && (
            <>
              <h3 className="m-0 mt-6 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#bd7724]">Characteristics</h3>
              <dl className="m-0 mt-3 grid gap-x-8 sm:grid-cols-2">
                {attributes.map((a) => (
                  <div key={`${a.attr_id}-${a.value}`} className="flex justify-between gap-4 border-b border-[#eef0f4] py-2 text-[14.5px]">
                    <dt className="text-[#4a5265]">{a.attr_name}</dt>
                    <dd className="m-0 text-right font-medium text-[#061948]">{a.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {data.comments && (
            <>
              <h3 className="m-0 mt-6 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#bd7724]">Comments</h3>
              <p className="m-0 mt-2 text-[14.5px] leading-[1.65] text-[#3c4252]">{data.comments}</p>
            </>
          )}
        </div>
    </div>
  );
}

/**
 * A verified report: the line that says it is genuine, then the certificate
 * itself. The certificate carries the identification, the weights and every
 * characteristic, so the record is only written out when there is no
 * certificate to show.
 */
function Found({ data }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#b7e0c2] bg-white shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[#f1faf3] px-6 py-4">
        <p className="m-0 flex items-center gap-2 text-[16px] font-semibold text-[#1b7a3a]">
          <CircleCheck aria-hidden className="h-5 w-5" /> Genuine IIGL report
        </p>
        <p className="m-0 text-[14px] text-[#4a5265]">
          Report No. <span className="font-mono font-semibold text-[#061948]">{data.report_no}</span>
        </p>
      </header>

      {data.cards?.length > 0 ? <OriginalCertificate data={data} /> : <Details data={data} />}
    </article>
  );
}

function Problem({ status, no }) {
  // Where to write when a report will not verify — the panel's address and
  // number, the same pair the footer prints.
  const details = contactOf(useSite());

  const text = {
    missing: (
      <>
        {no ? (
          <>
            No report matches <span className="font-mono font-semibold">{no}</span>. Check each character exactly as printed.
          </>
        ) : (
          'No report matches this QR code.'
        )}{' '}
        A report can also be withheld from public verification — if yours will not verify, contact us at{' '}
        <a className="font-medium underline" href={details.emailHref}>
          {details.email}
        </a>
        {details.phone ? (
          <>
            {' '}
            or{' '}
            <a className="font-medium underline" href={details.phone.href}>
              {details.phone.text}
            </a>
          </>
        ) : null}
        .
      </>
    ),
    unreadable: 'That QR code is not an IIGL report code. Scan the code printed on the report, or type the report number.',
    error: 'Verification could not be reached just now. Please try again in a moment.',
  }[status];

  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-[#f3c7c3] bg-[#fdecea] p-5 text-[14.5px] leading-[1.65] text-[#8a1f17]">
      <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="m-0">{text}</p>
    </div>
  );
}

// ------------------------------------------------------------- information

const STEPS = [
  { icon: FileSearch, title: 'Find the report number', text: 'It is printed on your IIGL report card, beside the QR code.' },
  { icon: ScanLine, title: 'Type it, or scan the QR code', text: 'Enter the number above, or scan the code with this page or your phone’s camera.' },
  { icon: BadgeCheck, title: 'Match the details', text: 'The product, weights and characteristics shown must match the report in your hand.' },
];

const NOTES = [
  {
    icon: ShieldCheck,
    title: 'Why verify',
    text: 'Anyone can print a card. Only a report in IIGL’s own records verifies here, so what you see is the laboratory’s record, not the card’s.',
  },
  {
    icon: CircleAlert,
    title: 'If it does not verify',
    text: 'Check each character first. A report can also be withheld from public verification; contact us with the report in hand.',
  },
  {
    icon: Lock,
    title: 'What is shown',
    text: 'The item’s details only — never the owner’s name, number or what was paid.',
  },
];

// --------------------------------------------------------------------- page

export default function VerifyReportPage({ id }) {
  // /verify-report?no=<number> is a check that can be shared, as the QR's /verify-report/<id> is.
  const initialNo = new URLSearchParams(window.location.search).get('no')?.trim() ?? '';
  const [no, setNo] = useState(initialNo);
  // idle, checking, found (with the report), missing, unreadable or error.
  const [result, setResult] = useState(id || initialNo ? { status: 'checking' } : { status: 'idle' });
  const resultRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const scanDialog = useRef(null);

  const verify = useCallback(async (query) => {
    setResult({ status: 'checking' });
    if (query.no) window.history.replaceState(null, '', `/verify-report?no=${encodeURIComponent(query.no)}`);
    try {
      const data = await getPublic(
        query.id ? `/public/verify-by-id/${query.id}` : `/public/verify/${encodeURIComponent(query.no)}`,
      );
      setNo(data.report_no);
      setResult({ status: 'found', data });
    } catch (error) {
      setResult({ status: /answered 404$/.test(error.message) ? 'missing' : 'error' });
    }
  }, []);

  useEffect(() => {
    document.title = 'Verify Report — IIGL';
    if (id) verify({ id });
    else if (initialNo) verify({ no: initialNo });
  }, [id, initialNo, verify]);

  // On a phone the answer lands below the fold; bring it into view when it arrives.
  useEffect(() => {
    if (result.status !== 'idle' && result.status !== 'checking') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [result.status]);

  const onCode = useCallback(
    (text) => {
      scanDialog.current?.close();
      const query = readScan(text);
      if (!query) {
        setResult({ status: 'unreadable' });
        return;
      }
      // A printed QR's own address, so the page can be shared or reloaded.
      if (query.id) window.history.replaceState(null, '', `/verify-report/${query.id}`);
      if (query.no) setNo(query.no);
      verify(query);
    },
    [verify],
  );

  const openScanner = () => {
    setScanning(true);
    scanDialog.current?.showModal();
  };

  return (
    <main className="bg-[#f8f9fb] text-[#2c3b64]">
      <section className="relative overflow-hidden bg-[#061948] px-4 pb-28 pt-14 text-center text-white sm:px-8 lg:px-12">
        <img src={verifyHero} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <span aria-hidden className="absolute inset-0 bg-linear-to-b from-[#0b2a63]/72 to-[#061948]/92" />
        <div className="relative mx-auto max-w-[820px]">
          <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#e3b447]">Trust &amp; Authenticity</p>
          <h1 className={`m-0 mt-4 ${serif} text-[48px] font-medium leading-[1.08] max-[640px]:text-[24px]`}>Verify Report</h1>
          <p className="mx-auto mt-4 max-w-[640px] text-[16px] leading-[1.7] text-white/80 max-[640px]:mt-2.5 max-[640px]:text-[12.5px] max-[640px]:leading-[1.55]">
            Check any IIGL grading report against the laboratory’s own record — type the report number, or scan the QR
            code printed on it.
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-8 lg:px-12">
        <div className="mx-auto -mt-20 max-w-[900px]">
          <form
            className="rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_22px_52px_rgba(6,25,72,0.16)] sm:p-8"
            onSubmit={(event) => {
              event.preventDefault();
              verify({ no: no.trim() });
            }}
          >
            <label htmlFor="report-no" className="mb-2 block text-[14px] font-medium text-[#2c3b64]">
              Report number
            </label>
            {/* Input and Verify share one row; the QR scanner is an icon button
                tucked inside the field's right edge. */}
            <div className="flex gap-3">
              <div className="relative min-w-0 flex-1">
                <input
                  id="report-no"
                  className="h-[52px] w-full rounded-lg border border-[#e6e8ee] bg-[#f8f9fb] pl-4 pr-14 font-mono text-[16px] text-[#061948] outline-none placeholder:font-sans placeholder:text-[#8b93a7] focus:border-[#d58a2b] focus:bg-white"
                  value={no}
                  onChange={(event) => setNo(event.target.value)}
                  placeholder="Enter your report number"
                  required
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={!id && !initialNo}
                />
                <button
                  type="button"
                  onClick={openScanner}
                  aria-label="Scan QR code"
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[#061948] transition-colors hover:bg-[#eef0f4]"
                >
                  <ScanLine aria-hidden className="h-[20px] w-[20px]" strokeWidth={2} />
                </button>
              </div>
              <button
                type="submit"
                disabled={result.status === 'checking'}
                aria-label={result.status === 'checking' ? 'Checking…' : 'Verify'}
                className="inline-flex h-[52px] w-[52px] shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-linear-to-b from-[#df9d3d] to-[#bd7724] text-white disabled:cursor-wait disabled:opacity-60"
              >
                {result.status === 'checking' ? (
                  <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Search aria-hidden className="h-[20px] w-[20px]" strokeWidth={2} />
                )}
              </button>
            </div>
            <p className="m-0 mt-3 text-[13px] leading-[1.5] text-[#8b93a7]">
              The number is printed on the report card, beside the QR code. Type it as printed; capital or small letters
              both work.
            </p>
          </form>

          <div ref={resultRef} className="mt-6 scroll-mt-24" aria-live="polite">
            {result.status === 'checking' && (
              <div className="flex items-center gap-3 rounded-xl border border-[#e6e8ee] bg-white p-5 text-[14.5px] text-[#4a5265]">
                <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-[#e6e8ee] border-t-[#bd7724]" />
                Checking the laboratory’s record…
              </div>
            )}
            {result.status === 'found' && <Found data={result.data} />}
            {['missing', 'unreadable', 'error'].includes(result.status) && <Problem status={result.status} no={no} />}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1180px]">
          <h2 className={`m-0 text-center ${serif} text-[36px] font-medium leading-[1.08] text-[#061948] max-[640px]:text-[24px]`}>
            How to Verify a <span className="text-[#bd7724]">Report</span>
          </h2>
          <ol className="m-0 mt-8 grid list-none gap-5 p-0 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="rounded-xl border border-[#e6e8ee] bg-white p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fdf7ef] text-[#bd7724]">
                  <Icon aria-hidden className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <p className="m-0 mt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#bd7724]">Step {index + 1}</p>
                <h3 className="m-0 mt-1 text-[17px] font-semibold text-[#061948]">{title}</h3>
                <p className="m-0 mt-2 text-[14.5px] leading-[1.6] text-[#4a5265]">{text}</p>
              </li>
            ))}
          </ol>

          {/* Phone: the notes auto-rotate through a swiper; the static grid
              takes over from `md` up. */}
          <div className="mt-6 md:hidden">
            <Swiper
              className="w-full"
              modules={[A11y, Autoplay]}
              loop
              speed={600}
              spaceBetween={16}
              slidesPerView={1.1}
              autoplay={{ delay: 3000, disableOnInteraction: false }}
              a11y={{ prevSlideMessage: 'Previous note', nextSlideMessage: 'Next note' }}
            >
              {NOTES.map(({ icon: Icon, title, text }) => (
                <SwiperSlide key={title} className="h-auto">
                  <div className="flex h-full gap-4 rounded-xl bg-[#061948] p-6 text-white">
                    <Icon aria-hidden className="h-6 w-6 shrink-0 text-[#e3b447]" strokeWidth={1.6} />
                    <div>
                      <h3 className="m-0 text-[16px] font-semibold">{title}</h3>
                      <p className="m-0 mt-2 text-[14px] leading-[1.6] text-white/80">{text}</p>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          <div className="mt-6 hidden gap-5 md:grid md:grid-cols-3">
            {NOTES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 rounded-xl bg-[#061948] p-6 text-white">
                <Icon aria-hidden className="h-6 w-6 shrink-0 text-[#e3b447]" strokeWidth={1.6} />
                <div>
                  <h3 className="m-0 text-[16px] font-semibold">{title}</h3>
                  <p className="m-0 mt-2 text-[14px] leading-[1.6] text-white/80">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The scanner, in a native modal: Escape and the backdrop close it, and closing stops the camera. */}
      <dialog
        ref={scanDialog}
        aria-label="Scan the QR code"
        onClose={() => setScanning(false)}
        onClick={(event) => event.target === scanDialog.current && scanDialog.current.close()}
        className="m-auto w-[min(440px,calc(100%-2rem))] rounded-xl bg-white p-0 backdrop:bg-[#061948]/60"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className={`m-0 ${serif} text-[22px] font-medium text-[#061948]`}>Scan the QR code</h2>
          <button
            type="button"
            onClick={() => scanDialog.current?.close()}
            aria-label="Close"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-[#f8f9fb] text-[#061948] hover:bg-[#e6e8ee]"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="px-5 pb-5">{scanning && <Scanner onCode={onCode} />}</div>
      </dialog>
    </main>
  );
}
