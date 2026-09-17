import { useEffect, useState } from 'react';
import { A11y, Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { Award, BadgeCheck, CircleCheck, FileSearch, Keyboard, Microscope, MonitorPlay, Presentation } from 'lucide-react';
import ac1 from '../../../Assets/AC1.png';
import ac2 from '../../../Assets/AC2.png';
import ac3 from '../../../Assets/AC3.png';
import ac4 from '../../../Assets/AC4.png';
import card1 from '../../../Assets/card1.png';
import card2 from '../../../Assets/card2.png';
import card3 from '../../../Assets/card3.png';
import card4 from '../../../Assets/card4.png';
import SectionLabel from '../SectionLabel.jsx';
import EnquiryForm from '../EnquiryForm.jsx';
import AvailableCoursesSection from './AvailableCoursesSection.jsx';
import ReviewsSection from './ReviewsSection.jsx';
import { contact } from './Footer.jsx';
import { fileUrl, getPublic, usePublic } from '../../lib/api.js';

/**
 * The Education page, at /education: every course, how they are taught, the
 * course gallery, students' testimonials, checking a course certificate, and a
 * way to ask. What changes lives in the panel — courses (Student › Course),
 * the gallery and testimonials (Website Setup), certificates (Student ›
 * Certificates) and the enquiries this page files (Student › Enquiry).
 */

const serif = "font-['Playfair_Display',Georgia,'Times_New_Roman',serif]";
const headingClass = `m-0 mt-4 ${serif} text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[24px]`;
const introClass = 'mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]';

function Heading({ label, title, intro }) {
  return (
    <div className="mx-auto max-w-[820px] text-center">
      <SectionLabel>{label}</SectionLabel>
      <h2 className={headingClass}>{title}</h2>
      {intro && <p className={introClass}>{intro}</p>}
    </div>
  );
}

// ------------------------------------------------------------------- header

function Hero() {
  return (
    <section className="bg-linear-to-b from-[#0b2a63] to-[#061948] px-5 py-16 text-center text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[860px]">
        <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#e3b447]">IIGL Education</p>
        <h1 className={`m-0 mt-4 ${serif} text-[48px] font-medium leading-[1.08] max-[640px]:text-[24px]`}>
          Your Journey to Excellence Starts Here
        </h1>
        <p className="mx-auto mt-4 max-w-[680px] text-[16px] leading-[1.7] text-white/80">
          Expert-led courses in gemology, diamonds and jewellery, taught in the classroom and the laboratory, with a
          certificate anyone can verify.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href="#courses"
            className="inline-flex h-[50px] items-center whitespace-nowrap rounded-lg bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-7 text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] max-[420px]:px-4 max-[420px]:text-[13px]"
          >
            Explore Courses
          </a>
          <a
            href="#verify-certificate"
            className="inline-flex h-[50px] items-center whitespace-nowrap rounded-lg border border-white/40 px-7 text-[15px] font-medium text-white transition-colors hover:bg-white/10 max-[420px]:px-4 max-[420px]:text-[13px]"
          >
            Verify a Certificate
          </a>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------- learning methods

const METHODS = [
  {
    icon: Presentation,
    title: 'Classroom Learning',
    text: 'Structured lessons led by experienced gemmologists, from the fundamentals to advanced grading.',
  },
  {
    icon: Microscope,
    title: 'Practical Lab Sessions',
    text: 'Hands-on work with real stones and standard instruments — loupe, refractometer and microscope.',
  },
  {
    icon: MonitorPlay,
    title: 'Online Classes',
    text: 'Live and recorded sessions for the theory, so you can keep learning wherever you are.',
  },
  {
    icon: Award,
    title: 'Assessment & Certification',
    text: 'A final assessment, then an IIGL certificate anyone can verify on this page.',
  },
];

function MethodCard({ icon: Icon, title, text, index }) {
  return (
    <article className="relative h-full rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
      <span className="absolute right-5 top-5 text-[13px] font-semibold text-[#d5d9e2]">0{index + 1}</span>
      <span className="icon-gold-outline inline-flex h-14 w-14">
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </span>
      <h3 className={`m-0 mt-5 ${serif} text-[20px] font-medium text-[#061948]`}>{title}</h3>
      <p className="m-0 mt-2 text-[14.5px] leading-[1.65] text-[#4a5265]">{text}</p>
    </article>
  );
}

function LearningMethods() {
  return (
    <section id="learning-methods" className="bg-[#f8f9fb] px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <Heading
          label="How You Learn"
          title={
            <>
              Learning <span className="text-[#bd7724]">Methods</span>
            </>
          }
          intro="Theory, practice and assessment, in the order a gemmologist actually needs them."
        />
        {/* Phone: the methods auto-rotate through a one-card swiper; the static
            grid takes over from `sm` up. */}
        <div className="mt-8 sm:hidden">
          <Swiper
            className="w-full"
            modules={[A11y, Autoplay]}
            loop
            speed={600}
            spaceBetween={16}
            slidesPerView={1.1}
            autoplay={{ delay: 3000, disableOnInteraction: false }}
            a11y={{ prevSlideMessage: 'Previous method', nextSlideMessage: 'Next method' }}
          >
            {METHODS.map((method, index) => (
              <SwiperSlide key={method.title} className="h-auto">
                <MethodCard {...method} index={index} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div className="mt-8 hidden gap-5 sm:grid sm:grid-cols-2 xl:grid-cols-4">
          {METHODS.map((method, index) => (
            <MethodCard key={method.title} {...method} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------- course gallery

// Dummy pictures, shown until the panel has one (Website Setup › Course Gallery).
const BUILT_IN_GALLERY = [ac1, card1, ac2, card2, ac3, card3, ac4, card4].map((src) => ({ key: src, src, caption: null }));
const FIRST = 8;

function CourseGallery() {
  const rows = usePublic('/education-gallery');
  const [all, setAll] = useState(false);
  const pictures = rows?.length
    ? rows.map((r) => ({ key: r.id, src: fileUrl(r.image), caption: r.title }))
    : BUILT_IN_GALLERY;
  const shown = all ? pictures : pictures.slice(0, FIRST);

  return (
    <section id="course-gallery" className="bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <Heading
          label="Inside Our Classes"
          title={
            <>
              Course <span className="text-[#bd7724]">Gallery</span>
            </>
          }
          intro="Our classrooms, laboratory sessions and the stones students learn on."
        />
        <ul className="m-0 mt-8 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {shown.map(({ key, src, caption }) => (
            <li key={key}>
              <a
                className="group relative block overflow-hidden rounded-xl border border-[#e6e8ee] bg-[#f8f9fb] shadow-[0_15px_38px_rgba(44,59,100,0.08)]"
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={caption ? `Open ${caption}` : 'Open the picture full size'}
              >
                <img
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  src={src}
                  alt=""
                  loading="lazy"
                />
                {caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#061948]/85 to-transparent px-3 pb-2.5 pt-8 text-[13px] font-medium text-white">
                    {caption}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
        {pictures.length > FIRST && (
          <div className="mt-8 flex justify-center">
            <button
              className="inline-flex h-[50px] items-center justify-center rounded-lg border border-[#061948] px-8 text-[15px] font-medium text-[#061948] transition duration-200 hover:bg-[#061948] hover:text-white"
              type="button"
              aria-expanded={all}
              onClick={() => setAll(!all)}
            >
              {all ? 'Show fewer' : `Show all ${pictures.length} pictures`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------ verify a certificate

const STEPS = [
  {
    icon: FileSearch,
    title: 'Find the certificate number',
    text: 'It is printed on your IIGL course certificate and starts with IIGL-C — for example IIGL-C-2026-0001-7QF4.',
  },
  { icon: Keyboard, title: 'Enter it in the form', text: 'Type the number exactly as it is printed, dashes included.' },
  {
    icon: BadgeCheck,
    title: 'See the result',
    text: 'A genuine certificate shows the course, the grade and the date it was issued.',
  },
];

const fieldClass =
  'h-11 w-full rounded-lg border border-[#e6e8ee] bg-[#f8f9fb] px-3 text-[14px] text-[#3c4252] outline-none placeholder:text-[#8b93a7] focus:border-[#d58a2b] focus:bg-white';

function VerifyCertificate() {
  const [no, setNo] = useState('');
  // idle, checking, found (with the certificate) or missing.
  const [result, setResult] = useState({ status: 'idle' });

  const check = async (event) => {
    event.preventDefault();
    setResult({ status: 'checking' });
    try {
      const data = await getPublic(`/public/student-certificates/${encodeURIComponent(no.trim())}`);
      setResult({ status: 'found', data });
    } catch {
      setResult({ status: 'missing' });
    }
  };

  const found = result.status === 'found' ? result.data : null;

  return (
    <section id="verify-certificate" className="scroll-mt-[80px] bg-[#f8f9fb] px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <Heading
          label="Trust & Authenticity"
          title={
            <>
              How to Verify Your <span className="text-[#bd7724]">Certificate</span>
            </>
          }
          intro="Every IIGL course certificate can be checked here, by you or by anyone you show it to."
        />

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="flex gap-4 rounded-xl border border-[#e6e8ee] bg-white p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fdf7ef] text-[#bd7724]">
                  <Icon aria-hidden className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <div>
                  <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#bd7724]">Step {index + 1}</p>
                  <h3 className="m-0 mt-1 text-[17px] font-semibold text-[#061948]">{title}</h3>
                  <p className="m-0 mt-1 text-[14.5px] leading-[1.6] text-[#4a5265]">{text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)] sm:p-8">
            <h3 className={`m-0 ${serif} text-[28px] font-medium text-[#061948]`}>Verify a certificate</h3>
            <form className="mt-5 grid gap-4" onSubmit={check}>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[#2c3b64]">Certificate number *</span>
                <input
                  className={`${fieldClass} font-mono uppercase`}
                  value={no}
                  onChange={(e) => setNo(e.target.value)}
                  placeholder="IIGL-C-2026-0001-7QF4"
                  required
                  maxLength={40}
                />
              </label>
              <button
                type="submit"
                disabled={result.status === 'checking'}
                className="inline-flex h-[50px] cursor-pointer items-center justify-center gap-3 rounded-lg border-0 bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-6 text-[15px] font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                <BadgeCheck aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
                {result.status === 'checking' ? 'Checking…' : 'Verify'}
              </button>
            </form>

            <div aria-live="polite">
              {result.status === 'missing' && (
                <p className="m-0 mt-5 rounded-lg bg-[#fdecea] px-4 py-3 text-[14px] text-[#c62828]">
                  No certificate matches that number. Check it exactly as printed on the certificate.
                </p>
              )}
              {found && (
                <div className="mt-5 rounded-lg border border-[#b7e0c2] bg-[#f1faf3] p-4">
                  <p className="m-0 flex items-center gap-2 text-[15px] font-semibold text-[#1b7a3a]">
                    <CircleCheck aria-hidden className="h-5 w-5" /> Genuine IIGL certificate
                  </p>
                  <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
                    {[
                      ['Certificate', found.certificate_no],
                      ['Student', found.student_name],
                      ['Course', found.course],
                      ['Grade', found.grade],
                      ['Issued on', found.issued_on],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-[#4a5265]">{label}</dt>
                          <dd className="m-0 font-medium text-[#061948]">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------- contact us

function ContactUs() {
  return (
    <section id="contact" className="scroll-mt-[80px] bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <Heading
          label="Get In Touch"
          title={
            <>
              Contact <span className="text-[#bd7724]">Us</span>
            </>
          }
          intro="Questions about a course, a batch or the fees — write to us and our team will call you back."
        />
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_1.5fr]">
          <ul className="m-0 flex list-none flex-col gap-4 rounded-xl bg-linear-to-b from-[#0b2a63] to-[#061948] p-6 text-white sm:p-8">
            {contact.map(({ icon: Icon, lines, href }) => {
              const body = (
                <>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#e3b447]">
                    <Icon aria-hidden className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <span className="text-[15px] leading-[1.6] text-white/90">
                    {lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </>
              );
              return (
                <li key={lines[0]}>
                  {href ? (
                    <a className="flex items-center gap-4 hover:text-white" href={href}>
                      {body}
                    </a>
                  ) : (
                    <div className="flex items-center gap-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <EnquiryForm heading="Send us a message" intro="Leave your details and we will call you back." button="Send message" received="message" />
        </div>
      </div>
    </section>
  );
}

export default function EducationPage() {
  useEffect(() => {
    document.title = 'Education — IIGL';
    // An address naming a section (/education#contact) arrives before the page
    // is drawn, so the browser has nothing to scroll to; scroll once it is.
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <main>
      <Hero />
      <AvailableCoursesSection />
      <LearningMethods />
      <CourseGallery />
      <ReviewsSection kind="student" />
      <VerifyCertificate />
      <ContactUs />
    </main>
  );
}
