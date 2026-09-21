import { useState } from 'react';
import { fileUrl } from '../../lib/api.js';
import { useSite } from '../../lib/site.js';
import SectionLabel from '../SectionLabel.jsx';

/** How many pictures show before "Show all". Two rows on a wide screen. */
const FIRST = 8;

/**
 * Head office's picture gallery, from the panel (Website Setup › Gallery).
 *
 * Nothing is drawn while the gallery is empty or the API cannot be reached: an
 * empty frame titled Gallery would be a section with nothing in it.
 */
export default function GallerySection() {
  const site = useSite();
  const pictures = Array.isArray(site?.gallery) ? site.gallery : [];
  const [all, setAll] = useState(false);

  if (pictures.length === 0) return null;
  const shown = all ? pictures : pictures.slice(0, FIRST);

  return (
    <section id="gallery" className="bg-white px-4 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <SectionLabel>Inside IIGL</SectionLabel>

          <h2 className="m-0 mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[24px]">
            Our <span className="text-[#bd7724]">Gallery</span>
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]">
            Our laboratories, classrooms and the stones that pass through them.
          </p>
        </div>

        <ul className="m-0 mt-7 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {shown.map((picture) => (
            <li key={picture}>
              <a
                className="group block overflow-hidden rounded-xl border border-[#e6e8ee] bg-[#f8f9fb] shadow-[0_15px_38px_rgba(44,59,100,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d58a2b]"
                href={fileUrl(picture)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the picture full size"
              >
                <img
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  src={fileUrl(picture)}
                  alt=""
                  loading="lazy"
                />
              </a>
            </li>
          ))}
        </ul>

        {pictures.length > FIRST && (
          <div className="mt-8 flex justify-center">
            <button
              className="inline-flex h-[50px] items-center justify-center rounded-lg border border-[#061948] px-8 text-[15px] font-medium leading-none text-[#061948] transition duration-200 hover:bg-[#061948] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d58a2b]"
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
