import { ArrowRight, Star } from 'lucide-react';

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

const reviews = [
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

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export default function ReviewsSection() {
  return (
    <section id="reviews" className="bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#bd7724]">
            Our Reviews
          </p>
          {/* The one rule the design asks for, under the label rather than the heading. */}
          <span aria-hidden className="mx-auto mt-3 block h-px w-14 bg-[#d58a2b]/70" />

          <h2 className="m-0 mt-5 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
            What Our Clients Say
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]">
            What’s commonly called a ‘certificate’ is actually a grading report. IIGL issues{' '}
            <span className="font-medium text-[#bd7724]">grading reports</span> with clarity and
            confidence.
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {reviews.map((review) => (
            <article
              key={review.name}
              className="flex flex-col items-center rounded-xl border border-[#e6e8ee] bg-white px-5 py-7 text-center shadow-[0_15px_38px_rgba(44,59,100,0.08)]"
            >
              <span
                aria-hidden
                className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-[#f7efe7] text-[19px] font-semibold tracking-[0.04em] text-[#bd7724] shadow-[0_12px_26px_rgba(213,138,43,0.14)]"
              >
                {initials(review.name)}
              </span>

              <h3 className="m-0 mt-4 text-[18px] font-semibold leading-tight tracking-normal text-[#061948]">
                {review.name}
              </h3>
              <p className="m-0 mt-1 text-[14px] font-normal leading-tight text-[#4a5265]">
                {review.trade}
              </p>

              <div className="mt-5 flex items-center justify-center gap-1" aria-label="Rated 5 out of 5">
                {Array.from({ length: 5 }, (_, i) => (
                  // Filled, not outlined: a row of five outlines reads as five
                  // empty stars, which is the opposite of what it says.
                  <Star key={i} className="h-[18px] w-[18px] text-[#d58a2b]" fill="currentColor" strokeWidth={0} />
                ))}
              </div>

              <p className="mt-5 flex-1 text-[15px] font-normal leading-[1.75] text-[#3c4252]">
                {review.quote}
              </p>
            </article>
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
            href="#reviews"
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
