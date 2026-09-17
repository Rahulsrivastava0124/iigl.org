import { useEffect, useState } from 'react';
import { Gem, Hourglass, Inbox, MapPin } from 'lucide-react';
import { getPublic } from '../../lib/api.js';

/**
 * The tally: what the laboratory has done, and where. Counted live from the
 * panel's own orders, reports and listed branches — nothing here is typed in.
 *
 * Nothing is drawn until the counts arrive, and nothing at all if the API
 * cannot be reached: a row of zeroes reads as a laboratory that has never
 * tested anything.
 */

const TILES = [
  { key: 'items', icon: Inbox, label: 'Items received' },
  { key: 'tested', icon: Gem, label: 'Items tested' },
  { key: 'pending', icon: Hourglass, label: 'Pending items' },
  { key: 'branches', icon: MapPin, label: 'Branches' },
];

export default function StatsSection() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublic('/public/stats', { signal: controller.signal })
      .then(setStats)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Only the counts that actually arrived: a cached older answer (this is cached
  // for five minutes) can be missing a tile, and that must not take the page down.
  const tiles = TILES.filter(({ key }) => typeof stats?.[key] === 'number');
  if (tiles.length === 0) return null;

  return (
    <section className="bg-linear-to-b from-[#0b2a63] to-[#061948] px-5 py-10 text-white sm:px-8 lg:px-12">
      <dl className="mx-auto grid max-w-[1390px] grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
        {tiles.map(({ key, icon: Icon, label }) => (
          <div
            key={key}
            className="flex flex-col items-center text-center md:border-l md:border-white/15 md:first:border-l-0"
          >
            <Icon aria-hidden className="h-7 w-7 text-[#e3b447]" strokeWidth={1.5} />
            <dd className="m-0 mt-3 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[40px] font-medium leading-none max-[640px]:text-[26px]">
              {/* Indian grouping: 1,22,103, as every other number on the site reads. */}
              {stats[key].toLocaleString('en-IN')}
            </dd>
            <dt className="mt-2 text-[12px] font-medium uppercase tracking-[0.12em] text-white/70">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
