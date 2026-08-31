import { ArrowRight, ChevronRight, Gem, Mail, MapPin, Phone } from 'lucide-react';
import markUrl from '../../../Assets/footer-mark.png';

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
      { label: 'About Us', href: '#about' },
      { label: 'IIGL Reports', href: '#reports' },
      { label: 'Our Services', href: '#services' },
      { label: 'School of Gemology', href: '#school-of-gemology' },
      { label: 'School of Rock', href: '#school-of-rock' },
      { label: 'GemBlog', href: '#blog' },
      { label: 'Contact Us', href: '#contact' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Courses', href: '#courses' },
      { label: 'Study Materials', href: '#study-materials' },
      { label: 'Certification', href: '#certification' },
      { label: 'FAQ', href: '#faq' },
      { label: 'Blog', href: '#blog' },
      { label: 'Help Center', href: '#help' },
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

const contact = [
  {
    icon: MapPin,
    lines: ['15A, Gurudwara Road, Karol Bagh,', 'New Delhi - 110005, India'],
  },
  { icon: Mail, lines: ['info@iigl.education'], href: 'mailto:info@iigl.education' },
  { icon: Phone, lines: ['+91 11 4567 8900'], href: 'tel:+911145678900' },
];

/**
 * The four social marks, as paths.
 *
 * The style guide says to reach for `lucide-react` rather than draw an icon,
 * and everything else in this footer does. Brand logos are the exception it
 * cannot cover: lucide 1.x removed Facebook, LinkedIn, Instagram and YouTube
 * from the set, and there is no generic circle-with-an-f to stand in for one.
 */
const socials = [
  {
    label: 'Facebook',
    href: '#facebook',
    path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  {
    label: 'LinkedIn',
    href: '#linkedin',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    label: 'Instagram',
    href: '#instagram',
    path: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0z',
  },
  {
    label: 'YouTube',
    href: '#youtube',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#061948] px-5 pt-14 pb-0 text-white sm:px-8 lg:px-12">
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
        {/* One column on a phone, two on a tablet, the design's five on a desktop. */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.85fr_0.85fr_0.85fr_1.15fr] lg:gap-8">
          {/* -------------------------------------------------- the brand */}
          <div>
            <a className="flex items-center gap-3" href="/" aria-label="IIGL home">
              <span
                aria-hidden
                className="block h-[52px] w-[52px] shrink-0 bg-[#d58a2b]"
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
                <span className="mt-1 block text-[10.5px] font-medium tracking-[0.06em] text-[#d58a2b]">
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
                  <span className="mt-[2px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[#d58a2b]">
                    <Icon className="h-[14px] w-[14px]" strokeWidth={1.8} />
                  </span>
                  {href ? (
                    <a
                      className="text-[13px] font-normal leading-[1.6] text-white/70 transition-colors hover:text-[#d58a2b]"
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
              <h2 className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#d58a2b]">
                {column.heading}
              </h2>
              {/* The one rule under a heading the design does keep. */}
              <span aria-hidden className="mt-2 block h-px w-9 bg-[#d58a2b]/60" />
              <ul className="mt-5 space-y-[13px]">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      className="group inline-flex items-center gap-1.5 text-[13px] font-normal leading-[1.5] text-white/70 transition-colors hover:text-white"
                      href={link.href}
                    >
                      <span>{link.label}</span>
                      <ChevronRight
                        className="h-[13px] w-[13px] text-white/35 transition-colors group-hover:text-[#d58a2b]"
                        strokeWidth={2}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* ------------------------------------------------ stay updated */}
          <div>
            <h2 className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#d58a2b]">
              Stay Updated
            </h2>
            <span aria-hidden className="mt-2 block h-px w-9 bg-[#d58a2b]/60" />

            <p className="mt-5 max-w-[300px] text-[13px] font-normal leading-[1.7] text-white/70">
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
              className="mt-5 flex h-[46px] max-w-[300px] items-center overflow-hidden rounded-md border border-white/15 bg-white/[0.04] focus-within:border-[#d58a2b]/60"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="sr-only" htmlFor="footer-newsletter">
                Your email address
              </label>
              <input
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-[13px] font-normal text-white placeholder:text-white/45 focus:outline-none"
                id="footer-newsletter"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
              />
              <button
                className="flex h-[38px] w-[42px] shrink-0 items-center justify-center rounded-md bg-linear-to-b from-[#df9d3d] to-[#bd7724] text-white mr-1"
                type="submit"
                aria-label="Subscribe"
              >
                <ArrowRight className="h-[16px] w-[16px]" strokeWidth={2} />
              </button>
            </form>

            <p className="mt-7 text-[12.5px] font-medium text-white/75">Follow us on</p>
            <ul className="mt-3 flex items-center gap-3">
              {socials.map(({ label, href, path }) => (
                <li key={label}>
                  <a
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/15 text-[#d58a2b] transition-colors hover:border-[#d58a2b] hover:bg-[#d58a2b] hover:text-white"
                    href={href}
                    aria-label={label}
                  >
                    <svg
                      className="h-[15px] w-[15px]"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d={path} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------------------------------------------------- bottom bar */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-6 text-[12.5px] font-normal text-white/55">
          <p className="m-0">
            © {new Date().getFullYear()} IIGL Education. All rights reserved.
          </p>
          <p className="m-0 flex items-center gap-2 text-white/70">
            <Gem className="h-[15px] w-[15px] text-[#d58a2b]" strokeWidth={1.6} />
            <span>Excellence in Gemology Education</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
