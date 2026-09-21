import {
  BadgeCheck,
  Building2,
  Gem,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import aboutHero from '../../../Assets/hero/about.jpg';
import affiliationHero from '../../../Assets/hero/affiliation.jpg';
import certificateHero from '../../../Assets/hero/certificate.jpg';
import contactHero from '../../../Assets/hero/contact.jpg';
import SectionLabel from '../SectionLabel.jsx';
import EnquiryForm from '../EnquiryForm.jsx';
import OurBranchesSection from './OurBranchesSection.jsx';
import { contactOf, useSite } from '../../lib/site.js';

/**
 * The standing information pages carried over from the old iigl.org: About Us,
 * Affiliation, Importance of Certificate and Contact. Each is a navy hero over
 * a white body; the body is the same card and type as the rest of the site so
 * these read as part of it rather than as pasted-in copy.
 *
 * Navbar and Footer are added by `App`; a page here renders only its sections.
 */

const serif = "font-['Playfair_Display',Georgia,'Times_New_Roman',serif]";

/** The navy band every one of these pages opens on. */
/**
 * A page's navy header, with a photograph behind it.
 *
 * The picture is decorative: it sits under a navy wash dark enough that the
 * label, the heading and the intro keep their contrast whatever the photograph
 * is doing underneath, and it carries an empty alt because it says nothing the
 * heading does not. The wash is the gradient this header used to be, so a page
 * given no picture looks exactly as it did.
 */
function PageHero({ label, title, intro, image }) {
  return (
    <section className="relative overflow-hidden bg-[#061948] px-4 py-16 text-center text-white sm:px-8 lg:px-12">
      {image && <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />}
      <span aria-hidden className="absolute inset-0 bg-linear-to-b from-[#0b2a63]/72 to-[#061948]/92" />
      <div className="relative mx-auto max-w-[860px]">
        <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#e3b447] max-[640px]:text-[11px]">{label}</p>
        <h1 className={`m-0 mt-4 ${serif} text-[44px] font-medium leading-[1.1] max-[640px]:mt-3 max-[640px]:text-[27px]`}>{title}</h1>
        {intro && <p className="mx-auto mt-4 max-w-[680px] text-[16px] leading-[1.7] text-white/80 max-[640px]:mt-2.5 max-[640px]:text-[12.5px] max-[640px]:leading-[1.55]">{intro}</p>}
      </div>
    </section>
  );
}

/** A titled block of prose, gold label above the heading. */
function Prose({ label, title, children }) {
  return (
    <div className="rounded-xl border border-[#e6e8ee] bg-white p-7 shadow-[0_15px_38px_rgba(44,59,100,0.08)] max-[640px]:p-6">
      <SectionLabel align="start">{label}</SectionLabel>
      <h2 className={`m-0 mt-4 ${serif} text-[26px] font-medium leading-[1.15] text-[#061948] max-[640px]:mt-3 max-[640px]:text-[20px]`}>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-[1.8] text-[#3c4252] max-[640px]:text-[13.5px] max-[640px]:leading-[1.7]">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------- About Us

export function AboutPage() {
  return (
    <main className="bg-[#f8f9fb] text-[#2c3b64]">
      <PageHero
        label="Who We Are"
        image={aboutHero}
        title="About IIGL"
        intro="An ISO 9001:2015 certified, MSME-registered gemological laboratory, testing and certifying gems, diamonds, jewellery and rudraksha across India."
      />
      <section className="px-4 py-14 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1000px] gap-6">
          <Prose label="Introduction" title="Seventeen years of gemology, made independent">
            <p>
              After many experiments since 2004, the founders and managers of the organisation, Sri Surojit Banerjee
              and Sri Jaynarayan Singh, established IIGL in 2017 with detailed management and modern equipment, driven by
              a deep interest in the study of gems and jewellery and their results.
            </p>
            <p>
              What began as a small gem-testing service grew into a full gemological laboratory. Finished jewellery,
              natural diamonds, coloured gems and rudraksha are tested and their reports verified. We have taken the lead
              in providing gemological training to professionals, students, shopkeepers, growers and the general public.
            </p>
            <p>
              Our efficiency, integrity and ideas have earned your trust, and our colleagues and researchers continue to
              expand their experience and skills. The Institute of International Gemological Laboratory family thanks you
              for choosing us.
            </p>
          </Prose>

          <Prose label="Our Mission" title="Honest gemology at a reasonable price">
            <p>
              IIGL is a self-reliant, independent gemological laboratory equipped with the finest instruments and
              certified to ISO 9001:2015. Every report is issued only after the authenticity of the gem, rudraksha or
              diamond has been established.
            </p>
            <p>
              Treatments that were once very hard to detect — moissanite, CVD, treated and glass-filled diamonds, and
              glass fillings, heating, treatment and colour filling in coloured stones — are today identified with
              UV, Vis, NIR and spectrometer equipment, and reported plainly.
            </p>
            <p>
              Our aim is to reach ordinary people with gemological services at reasonable prices, to make customers
              aware and to connect educated people — because only then can the frauds in the gem trade be stopped.
            </p>
          </Prose>

          <Prose label="Our Vision" title="Reports you can trust before you buy">
            <p>
              Our gemological services are simple and genuinely helpful. Because our certification reports are reliable,
              you can turn to us before buying any gem, jewellery or diamond — backed by seventeen years of work that you
              are now a part of.
            </p>
            <p>
              IIGL is known for exquisite detailing and precise assessment. We release thousands of reports every year,
              committed to proper analysis and accurate proof of authenticity for every customer.
            </p>
          </Prose>

        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------- Affiliation

const AFFILIATIONS = [
  {
    icon: ShieldCheck,
    title: 'Government of India Recognition',
    text: 'IIGL holds the licences and certifications required to conduct gemstone testing in India, so our operations comply with the regulations and standards set by the Indian government.',
  },
  {
    icon: BadgeCheck,
    title: 'MSME Registration',
    text: 'We are registered with the Micro, Small and Medium Enterprises authority under the Government of India, reflecting our commitment to supporting and promoting small and medium businesses.',
  },
  {
    icon: Globe2,
    title: 'ISO 9001:2015 Certification',
    text: 'IIGL proudly holds ISO 9001:2015 certification, awarded by the International Standards Organisation — a mark of our dedication to the highest quality and world-class standards in gem identification and certification.',
  },
  {
    icon: Building2,
    title: 'Largest Network in India',
    text: 'We operate the largest network of gemstone testing laboratories in India, which speaks to our experience and expertise, and to the many satisfied clients we have served over the years.',
  },
  {
    icon: Gem,
    title: 'Wide Range of Gemstones',
    text: 'We test and grade a wide variety of precious gemstones — diamonds, pearls, sapphires, emeralds, topaz, corals, opals and more — covering a broad spectrum of gemstone needs.',
  },
];

export function AffiliationPage() {
  return (
    <main className="bg-[#f8f9fb] text-[#2c3b64]">
      <PageHero
        label="Trust & Credibility"
        image={affiliationHero}
        title="Affiliations"
        intro="When it comes to something as precious as gemstones, trust and credibility matter most. These affiliations are why you can place your trust in IIGL."
      />
      <section className="px-4 py-14 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1100px]">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {AFFILIATIONS.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)]"
              >
                <span className="icon-gold-outline inline-flex h-14 w-14">
                  <Icon className="h-7 w-7" strokeWidth={1.5} />
                </span>
                <h2 className={`m-0 mt-5 ${serif} text-[19px] font-medium leading-tight text-[#061948] max-[640px]:text-[17px]`}>{title}</h2>
                <p className="m-0 mt-3 text-[14.5px] leading-[1.7] text-[#4a5265] max-[640px]:text-[13px] max-[640px]:leading-[1.65]">{text}</p>
              </article>
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-[760px] text-center text-[15px] leading-[1.8] text-[#3c4252] max-[640px]:text-[13.5px] max-[640px]:leading-[1.7]">
            We take pride in our accuracy, professionalism and transparency in every dealing. When you choose IIGL, you
            choose a reliable partner for all your gemstone testing and certification requirements.
          </p>

        </div>
      </section>
    </main>
  );
}

// --------------------------------------------------- Importance of Certificate

const REASONS = [
  {
    title: 'Ensuring Authenticity',
    text: 'A certification report is a gem’s birth certificate, documenting its origin and characteristics and offering indisputable evidence of its identity — so you get exactly what you paid for.',
  },
  {
    title: 'Quality Assessment',
    text: 'A diamond grading report delves into the 4 Cs — carat weight, colour, clarity and cut. A certified gemologist evaluates each with precision, so you can understand a gem’s quality and decide with confidence.',
  },
  {
    title: 'Enhanced Value',
    text: 'Certification by a recognised authority adds a layer of trust to your stone, and that trust can translate into a higher resale value should you ever decide to part with it.',
  },
  {
    title: 'Conflict-Free Assurance',
    text: 'Certification supports the ethical sourcing of gemstones. Verifying your gem’s report contributes to the movement against conflict diamonds and to sustainable practice within the industry.',
  },
  {
    title: 'Investment Protection',
    text: 'Gems often serve as investments. A verified report guards against counterfeit or misrepresented stones and helps secure your financial interest.',
  },
  {
    title: 'Peace of Mind',
    text: 'Knowing a gem has been examined by experts and authenticated by a reputable institution removes doubt — so you can simply enjoy its beauty without worry.',
  },
];

export function ImportancePage() {
  return (
    <main className="bg-[#f8f9fb] text-[#2c3b64]">
      <PageHero
        label="Why It Matters"
        image={certificateHero}
        title="Importance of a Certificate"
        intro="A gem’s true worth lies beyond its beauty, in its composition and quality. Testing, verification and certification are the key to unlocking that worth."
      />
      <section className="px-4 py-14 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1100px]">
          <p className="mx-auto max-w-[820px] text-center text-[15.5px] leading-[1.8] text-[#3c4252] max-[640px]:text-[13.5px] max-[640px]:leading-[1.7]">
            Whether it is a dazzling diamond ring or a lustrous sapphire pendant, the allure of a precious stone is
            undeniable. Gem testing and certification reports offer an essential key to its real value.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {REASONS.map(({ title, text }, i) => (
              <article
                key={title}
                className="flex gap-4 rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#061948] text-[15px] font-semibold text-[#e3b447]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2 className="m-0 text-[17px] font-semibold text-[#061948] max-[640px]:text-[15.5px]">{title}</h2>
                  <p className="m-0 mt-2 text-[14.5px] leading-[1.7] text-[#4a5265] max-[640px]:text-[13px] max-[640px]:leading-[1.65]">{text}</p>
                </div>
              </article>
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-[820px] text-center text-[15px] leading-[1.8] text-[#3c4252] max-[640px]:text-[13.5px] max-[640px]:leading-[1.7]">
            Certification reports are not just pieces of paper; they are invaluable documents that safeguard your
            investment, ensure authenticity and enhance the experience of owning a precious gem. In a world of dazzling
            treasures, certification is the beacon of trust that guides you to the true worth of your gems.
          </p>
        </div>
      </section>
    </main>
  );
}

// --------------------------------------------------------------------- Contact

export function ContactPage() {
  /*
    Every channel here was a constant in this file, including a WhatsApp number
    that was nobody's setting and a telephone number read out of the footer's
    array by index. They are the panel's now.
  */
  const details = contactOf(useSite());

  const channels = [
    details.phone && { icon: Phone, label: 'Call us', value: details.phone.text, href: details.phone.href },
    details.whatsapp && {
      icon: MessageCircle,
      label: 'WhatsApp',
      value: 'Chat on WhatsApp',
      href: details.whatsapp,
    },
    { icon: Mail, label: 'Email us', value: details.email, href: details.emailHref },
    /*
      Not on a phone. The branch list it points at is on this same page, a
      screen further down, so on a narrow screen the card is a link to what
      the reader is already scrolling towards — and it was pushing the three
      channels that do something into a column four cards long.
    */
    { icon: MapPin, label: 'Visit a lab', value: 'Find your nearest branch', href: '/#branches', wide: false, phone: false },
  ].filter(Boolean);

  /*
    Two to a row on a phone. An odd one out spans the pair rather than sitting
    half-width beside a gap.
  */
  const onPhone = channels.filter((c) => c.phone !== false);
  const lastOnPhone = onPhone.length % 2 === 1 ? onPhone[onPhone.length - 1] : null;

  return (
    <main className="bg-[#f8f9fb] text-[#2c3b64]">
      <PageHero
        label="Get In Touch"
        image={contactHero}
        title="Contact Us"
        intro="To verify the authenticity of your diamonds, gemstones, jewellery or rudraksha, reach us through any of the channels below — or visit your nearest laboratory."
      />
      <section className="px-4 py-14 sm:px-8 lg:px-12">
        {/*
          One row on a desktop: the channels down the left, the form beside
          them. Stacked, the four cards were a band across the top with a tall
          white form under it and nothing in the right half of the page — the
          same shape the education page solved this way. On a phone they go
          back to two cards to a row with the form underneath.
        */}
        <div className="mx-auto grid max-w-[1100px] items-start gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)]">
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {channels.map((channel) => {
              const { icon: Icon, label, value, href } = channel;
              return (
                <a
                  key={label}
                  href={href}
                  className={[
                    'flex flex-col items-center rounded-xl border border-[#e6e8ee] bg-white p-4 text-center shadow-[0_15px_38px_rgba(44,59,100,0.08)] transition-colors hover:border-[#d58a2b] sm:p-6',
                    channel.phone === false ? 'max-[640px]:hidden' : '',
                    channel === lastOnPhone ? 'max-[640px]:col-span-2' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="icon-gold-outline inline-flex h-12 w-12 sm:h-14 sm:w-14">
                    <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} />
                  </span>
                  <span className={`mt-3 ${serif} text-[15px] font-medium text-[#061948] sm:mt-4 sm:text-[17px]`}>
                    {label}
                  </span>
                  <span className="mt-1 text-[12.5px] leading-[1.5] text-[#4a5265] sm:text-[13.5px]">{value}</span>
                </a>
              );
            })}
          </div>

          {/*
            The message goes to Student › Enquiry in the panel, source Website,
            the same place a course enquiry lands — so a question asked from
            the contact page is on somebody's list rather than in an inbox.
          */}
          <EnquiryForm
            heading="Send us a message"
            intro="Leave your details and we will call you back."
            button="Send message"
            received="message"
          />
        </div>
      </section>

      {/* The live branch network — the map and searchable list from the panel. */}
      <OurBranchesSection />
    </main>
  );
}
