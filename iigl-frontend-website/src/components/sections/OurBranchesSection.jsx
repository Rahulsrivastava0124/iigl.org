import { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import markUrl from '../../../Assets/footer-mark.png';
import { indiaPath, project, statesPath, viewBox } from './indiaOutline.js';

/**
 * Where IIGL is.
 *
 * The list on the left, the country on the right, and one selection shared
 * between them: picking a city lifts its pin, hovering a pin lifts its row.
 * Two views of six records rather than a list and a decoration.
 *
 * Two ways of showing a branch, each suited to where it sits. On the map it is
 * the house marker — a navy badge on a point, carrying the branch's own logo
 * where there is one and the IIGL mark where there is not. In the list it is a
 * disc of initials, because six identical marks down a column tell the reader
 * nothing while six sets of initials name the place.
 *
 * Every branch in the database has a null `img` today, so both fallbacks are
 * what will actually print — which is why they are designed states and not
 * something drawn in a hurry.
 *
 * The map is an inline path, not a tile layer: six fixed points on one country
 * need no panning, no zoom and no third-party script watching visitors. See
 * `indiaOutline.js` for where the boundary comes from and why that source.
 */

/*
  The six branches, mirroring the `branches` table — city, page and title as
  they are stored, with the coordinates the table has no column for.

  Hardcoded because every section on this site is: the website reads no API at
  all yet, and a seventh branch is a line here rather than a deployment. When
  the site does start fetching, `GET /api/public/branches` returns the first
  three fields and this stays as the coordinate lookup.
*/
const branches = [
  {
    city: 'Kolkata',
    state: 'West Bengal',
    page: 'kolkata',
    blurb: 'Head office and grading laboratory',
    lat: 22.5726,
    lon: 88.3639,
    logo: null,
  },
  {
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    page: 'varanasi',
    blurb: 'Gem testing laboratory and institute',
    lat: 25.3176,
    lon: 82.9739,
    logo: null,
  },
  {
    city: 'Brahmapur',
    state: 'Odisha',
    page: 'brahampur',
    blurb: 'Gem testing laboratory and institute',
    lat: 19.315,
    lon: 84.7941,
    logo: null,
  },
  {
    city: 'Bhubaneswar',
    state: 'Odisha',
    page: 'bhubaneswar',
    blurb: 'Gem testing laboratory and institute',
    lat: 20.2961,
    lon: 85.8245,
    logo: null,
  },
  {
    city: 'Tata Nagar',
    state: 'Jharkhand',
    page: 'tata-nagar',
    blurb: 'Gem testing laboratory and institute',
    lat: 22.8046,
    lon: 86.2029,
    logo: null,
  },
  {
    city: 'New Delhi',
    state: 'Delhi NCR',
    page: 'delhi',
    blurb: 'Gem testing laboratory',
    lat: 28.6139,
    lon: 77.209,
    logo: null,
  },
];

const initials = (city) =>
  city
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const [, , MAP_WIDTH, MAP_HEIGHT] = viewBox.split(' ').map(Number);

const stateLabels = [
  { name: 'Jammu & Kashmir', lat: 33.6, lon: 75.1 },
  { name: 'Ladakh', lat: 34.2, lon: 78.2 },
  { name: 'Himachal Pradesh', lat: 31.9, lon: 77.2 },
  { name: 'Punjab', lat: 30.8, lon: 75.4 },
  { name: 'Haryana', lat: 29.1, lon: 76.2 },
  { name: 'Delhi', lat: 28.6, lon: 77.2 },
  { name: 'Uttarakhand', lat: 30.1, lon: 79.2 },
  { name: 'Rajasthan', lat: 26.8, lon: 73.8 },
  { name: 'Gujarat', lat: 22.7, lon: 71.5 },
  { name: 'Madhya Pradesh', lat: 23.5, lon: 78.6 },
  { name: 'Uttar Pradesh', lat: 26.9, lon: 80.8 },
  { name: 'Bihar', lat: 25.8, lon: 85.7 },
  { name: 'Jharkhand', lat: 23.6, lon: 85.6 },
  { name: 'West Bengal', lat: 23.5, lon: 87.8 },
  { name: 'Sikkim', lat: 27.5, lon: 88.5 },
  { name: 'Assam', lat: 26.2, lon: 92.8 },
  { name: 'Arunachal Pradesh', lat: 28.0, lon: 94.7 },
  { name: 'Nagaland', lat: 26.1, lon: 94.4 },
  { name: 'Manipur', lat: 24.8, lon: 93.9 },
  { name: 'Mizoram', lat: 23.3, lon: 92.8 },
  { name: 'Tripura', lat: 23.8, lon: 91.3 },
  { name: 'Meghalaya', lat: 25.5, lon: 91.3 },
  { name: 'Chhattisgarh', lat: 21.5, lon: 82.0 },
  { name: 'Odisha', lat: 20.4, lon: 84.3 },
  { name: 'Maharashtra', lat: 19.4, lon: 76.7 },
  { name: 'Goa', lat: 15.4, lon: 74.0 },
  { name: 'Telangana', lat: 17.8, lon: 79.0 },
  { name: 'Andhra Pradesh', lat: 15.8, lon: 80.8 },
  { name: 'Karnataka', lat: 14.6, lon: 76.1 },
  { name: 'Tamil Nadu', lat: 11.1, lon: 78.6 },
  { name: 'Kerala', lat: 10.4, lon: 76.4 },
];

/**
 * The marker the map uses: the map-pin teardrop, with the branch inside it.
 *
 * Drawn as one path rather than a badge with a triangle stuck under it — a pin
 * is a shape people recognise before they read anything, and a rounded square
 * on a spike is not that shape. The head carries the branch's own logo where
 * there is one and the IIGL mark where there is not: a branch without its own
 * artwork is still IIGL, and the house mark says so better than two letters
 * would at this size.
 *
 * The artwork is clipped to the head's circle, which needs an id of its own
 * per pin — six markers on one page would otherwise share one clip path and
 * the browser would apply whichever it saw last.
 */
function MapMarker({ branch, size, active }) {
  const height = Math.round(size * 1.44);
  const clipId = `pin-${branch.page}`;
  const body = active ? '#d58a2b' : '#061948';

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 24 34.5"
      aria-hidden
      className="drop-shadow-[0_6px_10px_rgba(6,25,72,0.32)]"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="11.7" r="7.1" />
        </clipPath>
      </defs>

      {/* Head and tail in one outline: a circle drawn down to a point. */}
      <path
        d="M12 .9a11.1 11.1 0 0 0-11.1 11.1c0 3.4 1.7 7 4.2 10.5 2.3 3.2 5 6 6.2 7.2a1 1 0 0 0 1.4 0c1.2-1.2 3.9-4 6.2-7.2 2.5-3.5 4.2-7.1 4.2-10.5A11.1 11.1 0 0 0 12 .9Z"
        fill={body}
        stroke="#ffffff"
        strokeWidth="1.5"
      />

      {/* A pale disc behind a photographic logo; the IIGL mark is white and
          wants the navy. */}
      {branch.logo && <circle cx="12" cy="11.7" r="7.1" fill="#ffffff" />}

      <image
        href={branch.logo ?? markUrl}
        x={branch.logo ? 4.2 : 3.2}
        y={branch.logo ? 3.9 : 2.9}
        width={branch.logo ? 15.6 : 17.6}
        height={branch.logo ? 15.6 : 17.6}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${clipId})`}
      />
    </svg>
  );
}

/** The branch's own mark, or its initials. The list's disc. */
function BranchMark({ branch, size, active }) {
  const ring = active ? 'ring-[#d58a2b]' : 'ring-white';
  const common = `flex items-center justify-center overflow-hidden rounded-full ring-2 ${ring} shadow-[0_6px_16px_rgba(6,25,72,0.22)]`;

  if (branch.logo) {
    return (
      <span className={`${common} bg-white`} style={{ width: size, height: size }}>
        <img
          src={branch.logo}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={`${common} bg-linear-to-b from-[#0b2a63] to-[#061948] font-medium text-white`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(branch.city)}
    </span>
  );
}

function BranchDetailCard({ branch }) {
  if (!branch) return null;

  const services = [
    'Gem testing and certification support',
    branch.blurb.toLowerCase().includes('institute') && 'Institute and training enquiries',
    'IIGL grading report assistance',
  ].filter(Boolean);

  return (
    <aside
      /*
        Bottom right of the map. On a narrow screen it spans the foot instead,
        because 240px beside a phone-width map leaves neither readable.
      */
      className="absolute bottom-3 right-3 z-10 w-[240px] rounded-xl border border-[#e6e8ee] bg-white/95 p-4 text-left shadow-[0_18px_44px_rgba(6,25,72,0.16)] backdrop-blur-sm max-[640px]:left-3 max-[640px]:w-auto"
      aria-label={`${branch.city} branch details`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <BranchMark branch={branch} size={42} active />
        <div className="min-w-0">
          <h3 className="m-0 truncate font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[22px] font-medium leading-[1.12] tracking-normal text-[#061948]">
            {branch.city}
          </h3>
          <p className="m-0 mt-1 text-[12px] font-medium uppercase tracking-[0.08em] text-[#bd7724]">
            {branch.state}
          </p>
        </div>
      </div>

      <p className="m-0 mt-3 text-[14px] font-normal leading-[1.6] text-[#3c4252]">
        {branch.blurb}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[#e6e8ee] pt-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b93a7]">
            City
          </dt>
          <dd className="m-0 mt-0.5 text-[13px] font-medium text-[#061948]">{branch.city}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b93a7]">
            State
          </dt>
          <dd className="m-0 mt-0.5 text-[13px] font-medium text-[#061948]">{branch.state}</dd>
        </div>
      </dl>

      <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
        {services.map((service) => (
          <li
            key={service}
            className="rounded-lg bg-[#f8f9fb] px-2.5 py-1.5 text-[12px] font-medium leading-snug text-[#3c4252]"
          >
            {service}
          </li>
        ))}
      </ul>

      <a
        href={`#${branch.page}`}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[#061948] px-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-white transition-colors hover:bg-[#10285e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d58a2b]"
      >
        Read more
      </a>
    </aside>
  );
}
export default function OurBranchesSection() {
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState(branches[0].page);

  const found = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) =>
      `${b.city} ${b.state} ${b.blurb}`.toLowerCase().includes(q),
    );
  }, [term]);

  /*
    A search that empties the list should not leave a pin lit on a city the
    list no longer shows, so the selection follows the search when what was
    selected has been filtered away.
  */
  const shown = found.some((b) => b.page === selected) ? selected : (found[0]?.page ?? null);
  const detailBranch = branches.find((branch) => branch.page === shown) ?? null;

  return (
    <section id="branches" className="bg-[#f8f9fb] px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#bd7724]">
            Our Branches
          </p>
          <span aria-hidden className="mx-auto mt-3 block h-px w-14 bg-[#d58a2b]/70" />

          <h2 className="m-0 mt-5 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
            Where You Can Find Us
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]">
            Laboratories and institutes across India, each issuing the same{' '}
            <span className="font-medium text-[#bd7724]">grading reports</span> under one standard.
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
          {/* ------------------------------------------------------- the list */}
          <div className="flex flex-col rounded-xl border border-[#e6e8ee] bg-white p-4 shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
            <label className="relative block">
              <span className="sr-only">Search branches</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b93a7]"
              />
              <input
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search a city or state"
                className="h-11 w-full rounded-lg border border-[#e6e8ee] bg-[#f8f9fb] pl-9 pr-3 text-[14px] font-normal text-[#3c4252] outline-none placeholder:text-[#8b93a7] focus:border-[#d58a2b] focus:bg-white"
              />
            </label>

            <ul className="m-0 mt-4 flex list-none flex-col gap-2 overflow-y-auto p-0 lg:max-h-[520px]">
              {found.map((branch) => {
                const active = branch.page === shown;
                return (
                  <li key={branch.page}>
                    <button
                      type="button"
                      onClick={() => setSelected(branch.page)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                        active
                          ? 'border-[#d58a2b] bg-[#fdf7ef]'
                          : 'border-[#e6e8ee] bg-white hover:border-[#d0d5e0]'
                      }`}
                    >
                      <BranchMark branch={branch} size={40} active={active} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-[#061948]">
                          {branch.city}
                        </span>
                        <span className="block truncate text-[13px] font-normal text-[#4a5265]">
                          {branch.state} · {branch.blurb}
                        </span>
                      </span>
                      <MapPin
                        aria-hidden
                        className={`h-4 w-4 shrink-0 ${active ? 'text-[#bd7724]' : 'text-[#c3c9d6]'}`}
                      />
                    </button>
                  </li>
                );
              })}

              {found.length === 0 && (
                <li className="rounded-lg border border-dashed border-[#e6e8ee] px-3 py-8 text-center text-[14px] font-normal text-[#4a5265]">
                  No branch matches “{term.trim()}”. We open new centres often — write to us and we
                  will tell you what is nearest.
                </li>
              )}
            </ul>

            <p className="m-0 mt-4 border-t border-[#e6e8ee] pt-3 text-[13px] font-normal text-[#4a5265]">
              {found.length} of {branches.length} branches
            </p>
          </div>

          {/* -------------------------------------------------------- the map */}
          <div className="relative rounded-xl border border-[#e6e8ee] bg-white p-4 shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
            {/*
              The pins are HTML over the drawing rather than shapes inside it:
              a logo, initials and a shadow are things the page already knows
              how to draw, and inside the SVG each would have to be rebuilt.
              Both are placed by the same projection, so they agree.
            */}
            <div
              className="relative mx-auto w-full max-w-[560px]"
              style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
            >
              <svg
                viewBox={viewBox}
                role="img"
                aria-label="Map of India showing IIGL branch cities"
                className="h-full w-full"
              >
                {/*
                  Three passes, in this order: the country as a solid, the
                  state borders over it, then the coastline again on top. The
                  state rings run along the coast too, so drawing the national
                  edge last keeps it one clean line instead of two greys
                  fighting over the same pixels.
                */}
                <path d={indiaPath} fill="#eef1f7" />
                <path
                  d={statesPath}
                  fill="none"
                  stroke="#d3daea"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d={indiaPath}
                  fill="none"
                  stroke="#b6c1d8"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <g aria-hidden className="select-none">
                  {stateLabels.map((state) => {
                    const { x, y } = project(state.lon, state.lat);
                    const words = state.name.split(' ');
                    const split = words.length > 2 ? Math.ceil(words.length / 2) : words.length;
                    const lines =
                      words.length > 2
                        ? [words.slice(0, split).join(' '), words.slice(split).join(' ')]
                        : [state.name];

                    return (
                      <text
                        key={state.name}
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="pointer-events-none fill-[#6f7d9f] text-[14px] font-medium tracking-normal opacity-70"
                      >
                        {lines.map((line, index) => (
                          <tspan
                            key={line}
                            x={x}
                            dy={index === 0 ? 0 : 16}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    );
                  })}
                </g>
              </svg>

              {branches.map((branch) => {
                const { x, y } = project(branch.lon, branch.lat);
                const active = branch.page === shown;
                const dimmed = shown !== null && !active;
                return (
                  <button
                    key={branch.page}
                    type="button"
                    onClick={() => setSelected(branch.page)}
                    aria-label={`${branch.city}, ${branch.state}`}
                    className="absolute -translate-x-1/2 -translate-y-full transition-[transform,opacity] duration-200"
                    style={{
                      left: `${(x / MAP_WIDTH) * 100}%`,
                      top: `${(y / MAP_HEIGHT) * 100}%`,
                      opacity: dimmed ? 0.9 : 1,
                      transform: `translate(-50%, -100%) scale(${active ? 1.04 : 1})`,
                      zIndex: active ? 2 : 1,
                    }}
                  >
                    <span className={`flex flex-col items-center ${active ? 'animate-bounce' : ''}`}>
                      <MapMarker branch={branch} size={active ? 29 : 27} active={active} />
                    </span>
                  </button>
                );
              })}

            </div>
            <BranchDetailCard branch={detailBranch} />
          </div>
        </div>
      </div>
    </section>
  );
}
