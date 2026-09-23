import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Award, BarChart3, Clock, MessageCircle, UserPlus, X } from 'lucide-react';
import logoUrl from '../../../Assets/logo-text.png';
import { fileUrl, getPublic } from '../../lib/api.js';
import { getSite } from '../../lib/site.js';
import EnquiryForm from '../EnquiryForm.jsx';
import RegistrationForm from '../RegistrationForm.jsx';
import { cleanHtml } from '../../lib/html.js';
import dummyImage from '../../../Assets/AC1.png';

// Dummy content, shown until head office fills these in the panel (Student › Course).
const dummyDescription = (title) => `
  <p><strong>${title}</strong> is a practical IIGL course that takes you from the basics of gemmology to confident, hands-on testing.</p>
  <p>Classes combine theory with laboratory sessions, so every topic is practised on real stones with standard gemmological instruments.</p>`;
const DUMMY_DETAILS = `
  <p><strong>Who it is for</strong> — jewellers, traders, students and anyone starting a career in gems and diamonds.</p>
  <p><strong>How it is taught</strong> — classroom lessons, practical lab work and a final assessment.</p>
  <p><strong>What you receive</strong> — an IIGL certificate on successful completion.</p>`;
const DUMMY_SYLLABUS = [
  'Introduction to gemmology',
  'Physical and optical properties of gems',
  'Gemmological instruments and their use',
  'Natural, synthetic and treated stones',
  'Diamond grading: the 4Cs',
  'Practical identification and final assessment',
];

/**
 * What finishing earns: a sample of the course certificate, landscape like the
 * real one, beside the registration form. Drawn here rather than shown from the
 * printed template, which stays private — a blank of the real sheet on a public
 * page would be half a forgery. Sized in container units so it scales as one.
 */
function SampleCertificate({ course }) {
  const serif = "font-['Playfair_Display',Georgia,'Times_New_Roman',serif]";
  return (
    <figure className="@container m-0">
      <div className="relative flex aspect-[297/210] w-full flex-col items-center overflow-hidden rounded-lg border-[1.6cqw] border-double border-[#d9b779] bg-[radial-gradient(circle_at_center,#fffdf8_0%,#f3e6cc_100%)] px-[9%] pt-[4.5%] text-center text-[#3c4252] shadow-[0_22px_52px_rgba(44,59,100,0.16)]">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2.2%] bg-linear-to-b from-[#061948] to-[#0b2a63]" />
        <span
          aria-hidden
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] ${serif} text-[14cqw] font-semibold tracking-[0.1em] text-[#bd7724]/[0.07]`}
        >
          SAMPLE
        </span>

        <img src={logoUrl} alt="IIGL" className="h-[11%] w-auto mix-blend-multiply" />
        <p className={`m-0 mt-[2.5%] ${serif} text-[4.6cqw] font-semibold uppercase leading-none tracking-[0.04em] text-[#9a6a1f]`}>
          Certificate of Completion
        </p>
        <p className="m-0 mt-[2.5%] text-[1.9cqw]">This is to certify that</p>
        <p className="m-0 mt-[1%] font-['Great_Vibes',cursive] text-[6.4cqw] leading-tight text-[#061948]">Your Name</p>
        <span aria-hidden className="block h-px w-[46%] bg-[#d9b779]" />
        <p className="m-0 mt-[2%] text-[1.9cqw]">has successfully completed the course</p>
        <p className={`m-0 mt-[1%] ${serif} text-[3.4cqw] font-medium leading-tight text-[#061948]`}>{course}</p>

        <div className="absolute inset-x-[9%] bottom-[7%] flex items-end justify-between text-[1.5cqw] leading-snug">
          <div className="text-left">
            <p className="m-0 font-mono text-[#061948]">IIGL-C-0000-0000-XXXX</p>
            <p className="m-0">Certificate No.</p>
          </div>
          <span className="flex h-[9cqw] w-[9cqw] items-center justify-center rounded-full border-[0.35cqw] border-[#d9b779] bg-linear-to-b from-[#e3b447] to-[#bd7724] text-white shadow-[0_0.6cqw_1.4cqw_rgba(189,119,36,0.35)]">
            <Award aria-hidden className="h-[55%] w-[55%]" strokeWidth={1.6} />
          </span>
          <div className="text-right">
            <p className="m-0 font-['Great_Vibes',cursive] text-[2.6cqw] leading-none text-[#061948]">Director</p>
            <p className="m-0 border-t border-[#9a6a1f]/40 pt-[0.4cqw]">Authorised Signatory, IIGL</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[14px] text-[#4a5265]">
        A sample — yours carries your name, the course and a number anyone can verify.
      </figcaption>
    </figure>
  );
}

const registerButton =
  'inline-flex h-[50px] cursor-pointer items-center gap-3 rounded-lg border-0 bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-6 text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#061948]';

/** "12" typed in the panel reads as "12 Lessons", as on the card. */
const lessonsLabel = (lessons) => (/^\d+$/.test(lessons ?? '') ? `${lessons} Lessons` : lessons);

/**
 * A course's own page, at /courses/<id>: what head office wrote about it in the
 * panel (Student › Course). The public course list already carries every field,
 * so the page is that list's entry, and an id not on it — retired, or never
 * there — is not found.
 */
export default function CoursePage({ id }) {
  const [course, setCourse] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  // 'loading' until the API answers, then 'ready' or 'missing'.
  const [status, setStatus] = useState('loading');
  const registration = useRef(null);
  const openRegistration = () => registration.current?.showModal();

  useEffect(() => {
    const controller = new AbortController();
    getPublic('/public/courses', { signal: controller.signal })
      .then((courses) => {
        const found = (courses ?? []).find((c) => String(c.id) === String(id));
        if (!found) return setStatus('missing');
        setCourse(found);
        setStatus('ready');
        document.title = `${found.title || found.name} — IIGL`;
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus('missing');
      });
    // Head office's WhatsApp, for "Ask about this course". None set, no button.
    getSite()
      .then((site) => setWhatsapp(site?.whatsapp ?? null))
      .catch(() => {});
    return () => controller.abort();
  }, [id]);

  if (status !== 'ready') {
    return (
      <main className="bg-[#f8f9fb] px-4 py-24 text-center text-[#2c3b64]">
        {status === 'loading' ? (
          <p className="m-0 text-[15px] text-[#4a5265]">Loading the course…</p>
        ) : (
          <>
            <h1 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[32px] font-medium text-[#061948] max-[640px]:text-[24px]">
              Course not found
            </h1>
            <p className="mx-auto mt-3 max-w-[480px] text-[15px] text-[#4a5265]">
              This course is not offered at the moment, or the link is out of date.
            </p>
            <a className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-[#bd7724] hover:underline" href="/#courses">
              <ArrowLeft className="h-4 w-4" /> All courses
            </a>
          </>
        )}
      </main>
    );
  }

  const title = course.title || course.name;
  const description = cleanHtml(course.description) || cleanHtml(dummyDescription(title));
  const details = cleanHtml(course.details) || DUMMY_DETAILS;
  const written = (course.syllabus ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const syllabus = written.length ? written : DUMMY_SYLLABUS;
  const categories = course.categories ?? [];
  const ask = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello IIGL, I would like to know more about the course "${title}".`)}`
    : null;

  return (
    <main className="bg-white text-[#2c3b64]">
      {/* ------------------------------------------------------------ header */}
      <section className="bg-[#f8f9fb] px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1180px]">
          <a className="inline-flex items-center gap-2 text-[13px] font-medium text-[#bd7724] hover:underline" href="/#courses">
            <ArrowLeft className="h-4 w-4" /> All courses
          </a>

          <div className="mt-6 grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {course.level && (
                  <span className="rounded-md bg-[#bd7724] px-2.5 py-1 text-[11px] font-medium leading-none text-white">
                    {course.level}
                  </span>
                )}
                {categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-[#e6e8ee] bg-white px-3 py-1 text-[12px] font-medium leading-none text-[#2c3b64]"
                  >
                    {category}
                  </span>
                ))}
              </div>

              <h1 className="m-0 mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[44px] font-medium leading-[1.1] text-[#061948] max-[640px]:text-[26px]">
                {title}
              </h1>
              {course.subtitle && (
                <p className="m-0 mt-4 max-w-[620px] text-[16px] leading-[1.7] text-[#4a5265]">{course.subtitle}</p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-5 text-[14px] text-[#2c3b64]">
                {course.duration && (
                  <span className="inline-flex items-center gap-2">
                    <Clock className="h-[17px] w-[17px] text-[#bd7724]" strokeWidth={1.7} />
                    {course.duration}
                  </span>
                )}
                {course.lessons && (
                  <span className="inline-flex items-center gap-2">
                    <BarChart3 className="h-[17px] w-[17px] text-[#bd7724]" strokeWidth={1.7} />
                    {lessonsLabel(course.lessons)}
                  </span>
                )}
                {course.code && <span className="font-mono text-[13px] text-[#8b93a7]">{course.code}</span>}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" className={registerButton} onClick={openRegistration}>
                  <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  Register now
                </button>
                {ask && (
                  <a
                    className="inline-flex h-[50px] items-center gap-3 rounded-lg bg-[#061948] px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#10285e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d58a2b]"
                    href={ask}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    Ask about this course
                  </a>
                )}
              </div>
            </div>

            <img
              className="aspect-[16/9] w-full rounded-xl border border-[#e6e8ee] object-cover shadow-[0_22px_52px_rgba(44,59,100,0.16)]"
              src={fileUrl(course.image) ?? dummyImage}
              alt=""
            />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- body */}
      {(description || details || syllabus.length > 0) && (
        <section className="px-4 py-12 sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              {description && (
                <>
                  <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[28px] font-medium text-[#061948]">
                    About this course
                  </h2>
                  <div className="rich-content mt-4 text-[15px] leading-[1.75] text-[#3c4252]" dangerouslySetInnerHTML={{ __html: description }} />
                </>
              )}
              {details && (
                <>
                  <h2 className={`m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[28px] font-medium text-[#061948] ${description ? 'mt-10' : ''}`}>
                    Course details
                  </h2>
                  <div className="rich-content mt-4 text-[15px] leading-[1.75] text-[#3c4252]" dangerouslySetInnerHTML={{ __html: details }} />
                </>
              )}
            </div>

            {syllabus.length > 0 && (
              <aside className="h-fit rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
                <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[28px] font-medium text-[#061948]">
                  Syllabus
                </h2>
                <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
                  {syllabus.map((topic, index) => (
                    <li key={`${index}-${topic}`} className="flex gap-3 text-[14.5px] leading-[1.55] text-[#3c4252]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fdf7ef] text-[12px] font-semibold text-[#bd7724]">
                        {index + 1}
                      </span>
                      <span className="pt-1">{topic}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
        </section>
      )}

      {/* A question about the course, beside what finishing it earns. Registering itself is the modal below. */}
      <section id="enquire" className="scroll-mt-[80px] bg-[#f8f9fb] px-4 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1180px] items-center gap-8 lg:grid-cols-2">
          <div>
            <SampleCertificate course={title} />
            <div className="mt-5 flex justify-center">
              <button type="button" className={registerButton} onClick={openRegistration}>
                <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
                Register now
              </button>
            </div>
          </div>
          <EnquiryForm
            courseId={course.id}
            heading="Enquire about this course"
            intro="A question about batches, fees or admission? Leave your details and our team will call you back."
            button="Send enquiry"
            received={`enquiry about ${title}`}
          />
        </div>
      </section>

      {/*
        The registration form, in a native modal dialog: showModal() gives the
        backdrop, Escape to close and the focus trap without a library. A click
        on the backdrop lands on the dialog itself, and closes it too.
      */}
      <dialog
        ref={registration}
        aria-label={`Register for ${title}`}
        className="m-auto max-h-[92vh] w-[min(760px,calc(100%-2rem))] overflow-y-auto rounded-xl bg-transparent p-0 backdrop:bg-[#061948]/60"
        onClick={(event) => event.target === registration.current && registration.current.close()}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => registration.current?.close()}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-[#f8f9fb] text-[#061948] hover:bg-[#e6e8ee]"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
          <RegistrationForm
            courseId={course.id}
            course={title}
            fee={course.fee}
            feeTotal={course.fee_total}
            facts={[course.code, course.level, course.duration].filter(Boolean)}
          />
        </div>
      </dialog>
    </main>
  );
}
