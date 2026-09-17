import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Building2, ChevronDown, ChevronLeft, ChevronRight, MapPin, Phone, Search } from 'lucide-react';
import { apiUrl } from '../../lib/api.js';
import SectionLabel from '../SectionLabel.jsx';

/**
 * Our Registered Customers.
 *
 * The jewellers who trade with IIGL, from `GET /api/public/customers` — the
 * registered customers in the panel, every one of them unless head office has
 * unticked it under Website Setup › Customers. Nothing is typed in here: a
 * customer registered there is listed here on the next visit, with the logo,
 * area, city and number on their record.
 *
 * A row of cards on a navy band, scrolled by the arrows or by swiping, with one
 * dot per screenful. The state and city dropdowns offer only places that have a
 * listed customer, so a search can never come back empty for a place the list
 * offered. "View all" lays every matching card out as a grid instead.
 *
 * The band is the one dark block above the footer, and runs the full width of
 * the page, one flat navy with no card borders or tints: the logos carry the
 * colour.
 */

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

/**
 * A place name as it should read. Records hold what was typed — "salkia",
 * "kolkata" — so each word gets a capital for display; matching elsewhere is
 * case-insensitive and never sees this.
 */
const titleCase = (v) => (v ?? '').trim().replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{L})/gu, (_, p, ch) => p + ch.toUpperCase());

/** "Salkia, Howrah" — or whichever of the two is known, or the state. */
const placeOf = (c) => [c.area, c.city].map(titleCase).filter(Boolean).join(', ') || titleCase(c.state);

const same = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

function CustomerCard({ customer, wide }) {
  const place = placeOf(customer);
  return (
    <article
      /*
        In the row, each card is at least 226px and grows to share the band's
        width: a few customers fill the band edge to edge instead of huddling
        at the left, and once there are more than fit, none has room to grow
        and they scroll at 226px. Centred, so a card stretched wide still reads
        as one card rather than a logo lost in a corner.
      */
      className={`flex snap-start flex-col items-center px-3 py-5 text-center text-white ${
        wide ? 'w-full' : 'min-w-[226px] flex-[1_0_226px]'
      }`}
    >
      {/* The logo in a circle, ringed in gold. */}
      <div className="h-[132px] w-[132px] shrink-0 overflow-hidden rounded-full border-[3px] border-[#e3b447]/85 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
        {customer.logo ? (
          <img
            src={apiUrl(customer.logo)}
            alt={`${customer.company_name} logo`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-linear-to-b from-[#0b2a63] to-[#061948] font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[38px] font-medium text-[#e3b447]">
            {initials(customer.company_name)}
          </span>
        )}
      </div>

      <h3 className="m-0 mt-4 max-w-full truncate text-[16px] font-medium leading-snug tracking-normal" title={customer.company_name}>
        {customer.company_name}
      </h3>

      {place && (
        <p className="m-0 mt-2 flex max-w-full min-w-0 items-center justify-center gap-2 text-[13px] font-normal text-white/85">
          <MapPin aria-hidden className="h-4 w-4 shrink-0 text-white" fill="currentColor" stroke="#061948" strokeWidth={1.6} />
          <span className="truncate" title={place}>{place}</span>
        </p>
      )}

      {customer.mobile && (
        <a
          href={`tel:${customer.mobile}`}
          className="mt-2 flex items-center justify-center gap-2 text-[13px] font-normal text-white/85 transition-colors hover:text-[#e3b447]"
        >
          <Phone aria-hidden className="h-4 w-4 shrink-0 text-white" fill="currentColor" strokeWidth={0} />
          <span className="tabular-nums">{customer.mobile}</span>
        </a>
      )}
    </article>
  );
}

/** A dropdown in the house field: icon left, chevron right, native select underneath. */
function SelectField({ icon: Icon, label, value, onChange, options, disabled }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Icon aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2c3b64]" strokeWidth={1.6} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`h-[52px] w-full cursor-pointer appearance-none rounded-lg border border-[#e0e3ea] bg-white pl-12 pr-11 text-[15px] font-normal outline-none transition-colors focus:border-[#d58a2b] disabled:cursor-not-allowed disabled:bg-[#f8f9fb] ${
          value ? 'text-[#2c3b64]' : 'text-[#6b7285]'
        }`}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2c3b64]" strokeWidth={1.8} />
    </label>
  );
}

export default function RegisteredCustomersSection() {
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  // 'loading' until the API answers, then 'ready' or 'error'.
  const [status, setStatus] = useState('loading');

  // What the dropdowns show, and what the last Search applied.
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [applied, setApplied] = useState({ state: '', city: '' });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl('/public/customers'), { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`customers answered ${response.status}`);
        return response.json();
      })
      .then((body) => {
        setCustomers(body.data ?? []);
        setLocations(body.locations ?? []);
        setStatus('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const stateOptions = locations.map((l) => l.state).filter(Boolean);
  // A chosen state narrows the cities; none offers every city there is.
  const cityOptions = useMemo(() => {
    const pool = state ? locations.filter((l) => same(l.state, state)) : locations;
    return [...new Set(pool.flatMap((l) => l.cities))].sort((a, b) => a.localeCompare(b));
  }, [locations, state]);

  const shown = useMemo(
    () =>
      customers.filter(
        (c) => (!applied.state || same(c.state, applied.state)) && (!applied.city || same(c.city, applied.city)),
      ),
    [customers, applied],
  );

  const search = (event) => {
    event.preventDefault();
    setApplied({ state, city });
  };

  /* --------------------------------------------------------------- carousel */
  const track = useRef(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  /*
    One page is as many whole cards as the band shows at once, so an arrow moves
    by whole cards and lands where the snap points already are — scrolling by
    the band's pixel width instead stops part-way into a card, and the snap then
    drags it back.
  */
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
    const { size, perPage, count } = step();
    const total = Math.max(1, Math.ceil(count / perPage));
    setPages(el.scrollWidth > el.clientWidth + 1 ? total : 1);
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setPage(atEnd ? total - 1 : Math.min(total - 1, Math.round(el.scrollLeft / (size * perPage))));
  }, [step]);

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    // The list changed under the track: start again at the first card.
    el.scrollTo({ left: 0 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, shown, showAll, status]);

  const goTo = (index) => {
    const el = track.current;
    if (!el) return;
    const { size, perPage } = step();
    el.scrollTo({ left: Math.max(0, index) * size * perPage, behavior: 'smooth' });
  };
  const scrollByPage = (direction) => goTo(page + direction);

  const filtered = Boolean(applied.state || applied.city);
  const canScroll = !showAll && pages > 1;

  /*
    Auto-advance the band a page at a time, looping back to the first. Re-armed
    on every page change (page is a dependency), and held while the pointer is
    over the row so it does not slide out from under someone reading a card.
  */
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!canScroll || paused) return undefined;
    const id = setTimeout(() => goTo(page + 1 >= pages ? 0 : page + 1), 3500);
    return () => clearTimeout(id);
  }, [canScroll, paused, page, pages]);

  return (
    <section id="customers" className="bg-[#f8f9fb] px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <SectionLabel>Trusted By Many</SectionLabel>

          <h2 className="m-0 mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
            Our Registered <span className="text-[#bd7724]">Customers</span>
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]">
            Proud to be the choice of leading jewellers and gem professionals across India.
          </p>
        </div>

        {/* -------------------------------------------------------- filters */}
        <form onSubmit={search} className="mt-7 flex flex-col gap-3 md:flex-row md:gap-5">
          {/* The two dropdowns share a row on the phone; `md:contents` dissolves
              this wrapper from `md` up so the button lines up beside them. */}
          <div className="flex flex-1 gap-3 md:contents">
            <SelectField
              icon={MapPin}
              label="Select your state"
              value={state}
              onChange={(value) => {
                // A city from another state would match nothing.
                const keepCity =
                  value && city && !locations.some((l) => same(l.state, value) && l.cities.some((c) => same(c, city)))
                    ? ''
                    : city;
                setState(value);
                setCity(keepCity);
                // Auto-search: the list follows the dropdowns without the button.
                setApplied({ state: value, city: keepCity });
              }}
              options={stateOptions}
              disabled={status !== 'ready' || stateOptions.length === 0}
            />
            <SelectField
              icon={Building2}
              label="Select your city"
              value={city}
              onChange={(value) => {
                setCity(value);
                setApplied({ state, city: value });
              }}
              options={cityOptions}
              disabled={status !== 'ready' || cityOptions.length === 0}
            />
          </div>
          <button
            type="submit"
            disabled={status !== 'ready'}
            className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-lg bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-10 text-[15px] font-medium text-white shadow-[0_10px_22px_rgba(189,119,36,0.28)] transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            <Search aria-hidden className="h-5 w-5" strokeWidth={2} />
            Search
          </button>
        </form>
      </div>

      {/*
        ----------------------------------------------------------------- band
        Edge to edge across the page: the negative margins cancel the section's
        side padding, so the navy runs the full width of the screen. What sits
        on it — the cards and the arrows — stays inside the same 1390px column
        as the heading and filters above, so the row lines up with them.
      */}
      <div
        className="-mx-5 mt-6 bg-[#0b1f4b] px-5 py-6 shadow-[0_20px_46px_rgba(6,25,72,0.22)] sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
      >
        <div className="relative mx-auto max-w-[1390px]">
          <div>
            {status === 'loading' && (
              <p className="m-0 px-4 py-16 text-center text-[15px] text-white/80">Loading customers…</p>
            )}
            {status === 'error' && (
              <p className="m-0 px-4 py-16 text-center text-[15px] text-white/80">
                The customer list could not be loaded just now. Please try again in a moment.
              </p>
            )}
            {status === 'ready' && shown.length === 0 && (
              <p className="m-0 px-4 py-16 text-center text-[15px] text-white/80">
                {filtered
                  ? 'No registered customer is listed there yet.'
                  : 'Our registered customers will be listed here soon.'}
              </p>
            )}

            {status === 'ready' && shown.length > 0 && (
              <div
                ref={track}
                onScroll={measure}
                className={
                  showAll
                    ? 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4'
                    : 'flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                }
                aria-label="Registered customers"
              >
                {shown.map((customer) => (
                  <CustomerCard key={customer.id} customer={customer} wide={showAll} />
                ))}
              </div>
            )}
          </div>

          {canScroll && (
            <>
              <button
                type="button"
                onClick={() => scrollByPage(-1)}
                disabled={page === 0}
                aria-label="Previous customers"
                className="absolute -left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#d0d5e0] bg-white text-[#061948] shadow-[0_8px_20px_rgba(6,25,72,0.18)] transition-opacity disabled:opacity-40 sm:-left-6 lg:-left-7"
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => scrollByPage(1)}
                disabled={page >= pages - 1}
                aria-label="Next customers"
                className="absolute -right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#d0d5e0] bg-white text-[#061948] shadow-[0_8px_20px_rgba(6,25,72,0.18)] transition-opacity disabled:opacity-40 sm:-right-6 lg:-right-7"
              >
                <ChevronRight className="h-6 w-6" strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* -------------------------------------------------- dots and view all */}
      {status === 'ready' && shown.length > 0 && (
        <div className="relative mx-auto mt-5 flex min-h-8 max-w-[1390px] items-center justify-center">
            {canScroll && (
              <div className="flex items-center gap-2">
                {Array.from({ length: pages }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Show page ${i + 1} of ${pages}`}
                    aria-current={i === page}
                    className={`h-2 rounded-full transition-all ${i === page ? 'w-8 bg-[#bd7724]' : 'w-8 bg-[#d5d9e2] hover:bg-[#c3c9d6]'}`}
                  />
                ))}
              </div>
            )}
            {(pages > 1 || showAll) && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="group absolute right-0 inline-flex items-center gap-2 text-[15px] font-medium text-[#bd7724] max-[640px]:static max-[640px]:ml-auto"
              >
                {showAll ? 'Show Less' : 'View All Customers'}
                <ArrowRight aria-hidden className={`h-4 w-4 transition-transform group-hover:translate-x-1 ${showAll ? 'rotate-180' : ''}`} strokeWidth={2} />
              </button>
            )}
        </div>
      )}
    </section>
  );
}
