import { A11y, Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { ArrowRight, Star } from 'lucide-react';
import SectionLabel from '../SectionLabel.jsx';
import { usePublic } from '../../lib/api.js';

/**
 * What clients say.
 *
 * Four quotes, five stars each, with the client mark and name lifted to the
 * top of the card. The card is the house card — the same corner, border and
 * shadow as the report categories — so the row reads as part of the same site
 * rather than as a widget dropped into it.
 *
 * The faces are initials in a soft gold disc. There are no client photographs
 * in `Assets/`, and putting stock portraits against named people would be a
 * picture of somebody who is not them.
 */

// Built in, shown until head office publishes its own under Website Setup › Reviews.
const builtIn = [
  {
    quote:
      'IIGL’s grading report is precise, detailed and easy to understand. It helps me choose the right stone with complete confidence. Truly professional and reliable service!',
    name: 'Neha Mehta',
    trade: 'Jewelry Retailer',
  },
  {
    quote:
      'The grading report from IIGL is much more than a certificate. It’s a trustworthy evaluation that adds real value to our business and our customers.',
    name: 'Ravi Shah',
    trade: 'Diamond Wholesaler',
  },
  {
    quote:
      'IIGL provides accurate and transparent grading reports. The information is detailed, consistent and very helpful in making the right decisions.',
    name: 'Pooja Nair',
    trade: 'Gemstone Exporter',
  },
  {
    quote:
      'Every grading report I receive from IIGL reflects precision and authenticity. It gives our customers the confidence they deserve.',
    name: 'Arjun Desai',
    trade: 'Jewelry Manufacturer',
  },
];

// Dummy student testimonials for the Education page, shown until head office
// publishes its own under Website Setup › Testimonials.
const students = [
  {
    quote: 'The practical lab sessions made every topic click. I can now grade diamonds with real confidence.',
    name: 'Ananya Sharma',
    trade: 'Diamond Basics',
  },
  {
    quote: 'Clear teaching, patient instructors and plenty of stones to practise on. Every class was worth it.',
    name: 'Rohit Verma',
    trade: 'Gemstone Identification',
  },
  {
    quote: 'The course gave me the skills to start work at a jewellery store straight after my certificate.',
    name: 'Sneha Kapoor',
    trade: 'Graduate Gemologist',
  },
  {
    quote: 'Well structured from the basics to advanced grading, with a certificate the traders I work with know.',
    name: 'Imran Qureshi',
    trade: 'IIGL Certification Program',
  },
];

/** The two places this section is drawn: clients' reviews on the home page, students' on the Education page. */
const COPY = {
  client: {
    id: 'reviews',
    label: 'Our Reviews',
    title: 'What Our Clients Say',
    intro: (
      <>
        What’s commonly called a ‘certificate’ is actually a grading report. IIGL issues{' '}
        <span className="font-medium text-[#bd7724]">grading reports</span> with clarity and confidence.
      </>
    ),
    builtIn,
  },
  student: {
    id: 'testimonials',
    label: 'Testimonials',
    title: 'What Our Students Say',
    intro: (
      <>
        Students who started their <span className="font-medium text-[#bd7724]">careers in gemology</span> with IIGL.
      </>
    ),
    builtIn: students,
  },
};

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

function ReviewCard({ review }) {
  return (
    <article className="flex h-full flex-col items-center rounded-xl border border-[#e6e8ee] bg-white px-5 py-7 text-center shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
      <span
        aria-hidden
        className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-[#f7efe7] text-[19px] font-semibold tracking-[0.04em] text-[#bd7724] shadow-[0_12px_26px_rgba(213,138,43,0.14)]"
      >
        {initials(review.name)}
      </span>

      <h3 className="m-0 mt-4 text-[18px] font-semibold leading-tight tracking-normal text-[#061948]">
        {review.name}
      </h3>
      <p className="m-0 mt-1 text-[14px] font-normal leading-tight text-[#4a5265]">{review.trade}</p>

      <div className="mt-5 flex items-center justify-center gap-1" aria-label={`Rated ${review.rating ?? 5} out of 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          // Filled, not outlined: a row of five outlines reads as five
          // empty stars, which is the opposite of what it says. The
          // stars not earned are the same shape in grey.
          <Star
            key={i}
            className={`h-[18px] w-[18px] ${i < (review.rating ?? 5) ? 'text-[#d58a2b]' : 'text-[#e6e8ee]'}`}
            fill="currentColor"
            strokeWidth={0}
          />
        ))}
      </div>

      <p className="mt-5 flex-1 text-[15px] font-normal leading-[1.75] text-[#3c4252]">{review.quote}</p>
    </article>
  );
}

export default function ReviewsSection({ kind = 'client' }) {
  const copy = COPY[kind];
  const live = usePublic(`/reviews?kind=${kind}`);
  const reviews = live?.length ? live : copy.builtIn;

  return (
    <section id={copy.id} className="bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <SectionLabel>{copy.label}</SectionLabel>

          <h2 className="m-0 mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[24px]">
            {copy.title}
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]">
            {copy.intro}
          </p>
        </div>

        {/* Phone: the reviews auto-rotate through a one-card swiper. The static
            grid takes over from `sm` up. */}
        <div className="mt-7 sm:hidden">
          <Swiper
            className="w-full"
            modules={[A11y, Autoplay]}
            loop
            speed={600}
            spaceBetween={16}
            slidesPerView={1.1}
            autoplay={{ delay: 3500, disableOnInteraction: false }}
            a11y={{ prevSlideMessage: 'Previous review', nextSlideMessage: 'Next review' }}
          >
            {reviews.map((review) => (
              <SwiperSlide key={review.id ?? review.name} className="h-auto">
                <ReviewCard review={review} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div className="mt-7 hidden gap-5 sm:grid sm:grid-cols-2 xl:grid-cols-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id ?? review.name} review={review} />
          ))}
        </div>

        <div className="mt-9 border-t border-[#e6e8ee] pt-7 text-center">
          {/*
            Navy, and the height of the card button on the report categories —
            `h-10`, the same corner, the same 11px label. The hero's 54px button
            is the page's one big call to action and stays alone at that size;
            a second one that tall directly under a row of cards fought it.
          */}
          <a
            className="group inline-flex h-10 w-fit items-center justify-center gap-3 rounded-lg bg-[#061948] px-5 text-[13px] font-medium uppercase leading-none tracking-[0.04em] text-white shadow-[0_12px_20px_rgba(6,25,72,0.14)]"
            href={`#${copy.id}`}
          >
            <span>View All Reviews</span>
            <ArrowRight
              className="transition-transform group-hover:translate-x-1"
              size={16}
              strokeWidth={2}
            />
          </a>
        </div>
      </div>
    </section>
  );
}
