import { ArrowRight, ChevronRight, Gem } from 'lucide-react';
import markUrl from '../../../Assets/footer-mark.png';
import { contactOf, contactRows, useSite } from '../../lib/site.js';
import { SocialIcon, socialLinks } from '../socials.jsx';

/**
 * The footer.
 *
 * Three link columns and a subscribe column on the deep navy, with the address
 * block under the mark. Everything that is gold here is a label or an accent —
 * the headings, the icons, the send button — and nothing else, which is what
 * keeps the block from reading as a second brand.
 *
 * The mark is painted through a CSS mask rather than dropped in as an image:
 * `logo-text.png` is RGB with no alpha, so on navy it arrives as a white
 * rectangle with a navy wordmark inside it. A mask uses only the alpha channel,
 * so the shape comes out in whatever colour is set on the box — gold here, to
 * match the emblem in the header.
 *
 * `footer-mark.png` is that mask. It is `footer logo.png` with the alpha
 * stretched to full strength: the original peaks at 117/255, so masking with it
 * painted the mark at 46% of the gold and the logo came out a ghost. The copy
 * is white with normalised alpha, which is all a mask reads.
 */

const columns = [
  {
    heading: 'Company',
    links: [
      { label: 'About Us', href: '/about-us' },
      { label: 'Affiliation', href: '/affiliation' },
      { label: 'Importance of Certificate', href: '/importance-of-certificate' },
      { label: 'GemBlog', href: '/blog' },
      { label: 'Contact Us', href: '/contact-us' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Courses', href: '#courses' },
      { label: 'Study Materials', href: '#study-materials' },
      { label: 'Certification', href: '#certification' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Blog', href: '/blog' },
      { label: 'Help Center', href: '/contact-us' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms & Conditions', href: '#terms' },
      { label: 'Privacy Policy', href: '#privacy' },
      { label: 'Refund Policy', href: '#refund' },
      { label: 'Shipping Policy', href: '#shipping' },
    ],
  },
];

export default function Footer() {
  /*
    One request for both: the social links are head office's page row, the
    address and the numbers are Settings › Company, and `/public/site` answers
    with both. Until it answers, `contactOf` gives back the address and number
    this footer printed before either was a setting, so the block is never
    blank and never half-filled.
  */
  const site = useSite();
  const links = socialLinks(site);
  const details = contactOf(site);

  const contact = contactRows(details);

  return (
    <footer className="relative overflow-hidden bg-[#061948] px-4 pt-14 pb-0 text-white sm:px-8 lg:px-12">
      {/*
        The mark again, whole, in the bottom right.

        Two earlier tries had it half off the page: 320px across the top right,
        where it read through the Stay Updated copy, then pushed out past both
        edges, which left a fragment nobody could name. It is sized to the gap
        that actually exists — 100px, between the bottom of the social row and
        the rule above the copyright — so the whole mark shows and nothing sits
        on top of it.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[78px] right-3 hidden h-[100px] w-[100px] bg-white/[0.06] lg:block"
        style={{
          maskImage: `url(${markUrl})`,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: `url(${markUrl})`,
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }}
      />

      <div className="relative mx-auto max-w-[1390px]">
        {/* Two columns on a phone, the design's five on a desktop. The brand
            block spans the pair so its logo and address keep the full width. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.25fr_0.85fr_0.85fr_0.85fr_1.15fr] lg:gap-8">
          {/* -------------------------------------------------- the brand */}
          <div className="col-span-2 lg:col-span-1">
            <a className="flex items-center gap-3" href="/" aria-label="IIGL home">
              <span
                aria-hidden
                className="block h-[52px] w-[52px] shrink-0 bg-white"
                style={{
                  maskImage: `url(${markUrl})`,
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  WebkitMaskImage: `url(${markUrl})`,
                  WebkitMaskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                }}
              />
              <span className="block">
                <span className="block font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[30px] font-medium leading-none tracking-[0.02em] text-white">
                  IIGL
                </span>
                <span className="mt-1 block text-[10.5px] font-medium tracking-[0.06em] text-white">
                  Learn. Understand. Excel.
                </span>
              </span>
            </a>

            <p className="mt-5 max-w-[300px] text-[13px] font-normal leading-[1.75] text-white/70">
              IIGL Education is your trusted partner in gemology learning and certification. We
              empower you with knowledge and skills to build a successful career in the gem and
              jewelry industry.
            </p>

            <ul className="mt-6 space-y-4">
              {contact.map(({ icon: Icon, lines, href }) => (
                <li className="flex items-start gap-3" key={lines[0]}>
                  <span className="mt-[2px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-white">
                    <Icon className="h-[14px] w-[14px]" strokeWidth={1.8} />
                  </span>
                  {href ? (
                    <a
                      className="text-[13px] font-normal leading-[1.6] text-white/70 transition-colors hover:text-white"
                      href={href}
                    >
                      {lines[0]}
                    </a>
                  ) : (
                    <span className="text-[13px] font-normal leading-[1.6] text-white/70">
                      {lines.map((line) => (
                        <span className="block" key={line}>
                          {line}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* ------------------------------------------------ link columns */}
          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-white">
                {column.heading}
              </h2>
              {/* The one rule under a heading the design does keep. */}
              <span aria-hidden className="mt-2 block h-px w-9 bg-white/60" />
              <ul className="mt-5 space-y-[13px]">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      className="group inline-flex items-center gap-1.5 text-[13px] font-normal leading-[1.5] text-white/70 transition-colors hover:text-white"
                      href={link.href}
                    >
                      <span>{link.label}</span>
                      <ChevronRight
                        className="h-[13px] w-[13px] text-white/35 transition-colors group-hover:text-white"
                        strokeWidth={2}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/*
            Stay Updated, the full width of a phone.

            In one of the two phone columns the subscribe field was about 150px
            across and the placeholder came out as "Enter your ema" — a box too
            narrow to hold the thing it is asking for. It keeps its own column
            on a desktop, where there is room for five.
          */}
          <div className="col-span-2 lg:col-span-1">
            <h2 className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-white">
              Stay Updated
            </h2>
            <span aria-hidden className="mt-2 block h-px w-9 bg-white/60" />

            <p className="mt-5 max-w-[300px] text-[13px] font-normal leading-[1.7] text-white/70 max-[640px]:max-w-none">
              Subscribe to our newsletter and stay updated with the latest courses, insights and
              offers.
            </p>

            {/*
              The form is the design's, and it posts nowhere yet: there is no
              subscribe endpoint on the API. It is left inert rather than made
              to look successful — a field that thanks you for subscribing to
              nothing is worse than one that plainly does not work yet.
            */}
            <form
              className="mt-5 flex h-[46px] w-full max-w-[420px] items-center overflow-hidden rounded-md border border-white/15 bg-white/[0.04] focus-within:border-white/60 max-[640px]:max-w-none"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="sr-only" htmlFor="footer-newsletter">
                Your email address
              </label>
              <input
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-[13px] font-normal text-white placeholder:text-white focus:outline-none"
                id="footer-newsletter"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
              />
              <button
                className="flex h-[38px] w-[42px] shrink-0 items-center justify-center rounded-md bg-white text-[#061948] mr-1"
                type="submit"
                aria-label="Subscribe"
              >
                <ArrowRight className="h-[16px] w-[16px]" strokeWidth={2} />
              </button>
            </form>

            {/* Head office's links, from the panel; none set, no row. */}
            {links.length > 0 && (
              <>
                <p className="mt-7 text-[12.5px] font-medium text-white/75">Follow us on</p>
                <ul className="mt-3 flex items-center gap-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:border-white hover:bg-white hover:text-[#061948]"
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={link.label}
                      >
                        <SocialIcon link={link} className="h-[15px] w-[15px]" />
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------- bottom bar */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-6 text-[12.5px] font-normal text-white/55">
          <p className="m-0">
            © {new Date().getFullYear()} IIGL Education. All rights reserved.
          </p>
          <p className="m-0 flex items-center gap-2 text-white/70">
            <Gem className="h-[15px] w-[15px] text-white" strokeWidth={1.6} />
            <span>Excellence in Gemology Education</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
