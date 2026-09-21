import { useEffect, useState } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { apiUrl, fileUrl, getPublic } from '../../lib/api.js';
import { SocialIcon, socialLinks } from '../socials.jsx';
import { cleanHtml } from '../../lib/html.js';
import ac1 from '../../../Assets/AC1.png';
import ac2 from '../../../Assets/AC2.png';
import ac3 from '../../../Assets/AC3.png';
import ac4 from '../../../Assets/AC4.png';

// Dummy content, shown until the branch saves its own in the panel (Settings › Website).
const DUMMY_GALLERY = [ac1, ac2, ac3, ac4];
const dummyContent = (name, place) => `
  <h2>Welcome to ${name}</h2>
  <p>${name}${place ? ` in ${place}` : ''} is an IIGL branch offering gemstone and diamond testing, identification and grading reports issued under one IIGL standard.</p>
  <h3>Our services</h3>
  <p><strong>Gem identification</strong> — natural, synthetic or treated, tested with standard gemmological instruments.</p>
  <p><strong>Diamond grading</strong> — the 4Cs recorded on a verifiable IIGL report.</p>
  <p><strong>Jewellery certification</strong> — studded jewellery tested and certified piece by piece.</p>
  <p>Visit us or send your stones through your jeweller. Every report can be verified online.</p>`;

/** A branch's own page, at /branches/<id>: what its laboratory set in the panel. */
export default function BranchPage({ id }) {
  const [branch, setBranch] = useState(null);
  // 'loading' until the API answers, then 'ready' or 'missing'.
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();
    getPublic(`/public/laboratories/${id}`, { signal: controller.signal })
      .then((data) => {
        setBranch(data);
        setStatus('ready');
        document.title = `${data.fullname} — IIGL`;
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus('missing');
      });
    return () => controller.abort();
  }, [id]);

  if (status !== 'ready') {
    return (
      <main className="bg-[#f8f9fb] px-4 py-24 text-center text-[#2c3b64]">
        {status === 'loading' ? (
          <p className="m-0 text-[15px] text-[#4a5265]">Loading the branch…</p>
        ) : (
          <>
            <h1 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[32px] font-medium text-[#061948] max-[640px]:text-[24px]">
              Branch not found
            </h1>
            <p className="mx-auto mt-3 max-w-[480px] text-[15px] text-[#4a5265]">
              This branch is not on the website. It may have moved, or the link is out of date.
            </p>
            <a className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-[#bd7724] hover:underline" href="/#branches">
              <ArrowLeft className="h-4 w-4" /> Our branches
            </a>
          </>
        )}
      </main>
    );
  }

  const place = [branch.city, branch.state].filter(Boolean).join(', ');
  const links = socialLinks(branch);
  const content = cleanHtml(branch.content) || cleanHtml(dummyContent(branch.fullname.trim(), place));
  const gallery = branch.gallery?.length ? branch.gallery.map(fileUrl) : DUMMY_GALLERY;

  return (
    <main className="bg-white text-[#2c3b64]">
      {/*
        The banner, when the branch has one. A branch that has not set one
        shows nothing here: the empty navy band that used to stand in its place
        said nothing and pushed the name and the logo down the page for it.
      */}
      {branch.banner && (
        <img className="h-[clamp(220px,32vw,480px)] w-full object-cover" src={fileUrl(branch.banner)} alt="" />
      )}

      <section className="px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1100px]">
          <a className="inline-flex items-center gap-2 text-[13px] font-medium text-[#bd7724] hover:underline" href="/#branches">
            <ArrowLeft className="h-4 w-4" /> Our branches
          </a>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            {branch.logo && (
              <img
                className="h-16 w-16 rounded-full border border-[#e6e8ee] bg-white object-contain p-1"
                src={apiUrl(branch.logo)}
                alt=""
              />
            )}
            <div className="min-w-0">
              <h1 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-tight text-[#061948] max-[640px]:text-[24px]">
                {branch.fullname}
              </h1>
              {place && (
                <p className="m-0 mt-1 inline-flex items-center gap-1.5 text-[14px] text-[#4a5265]">
                  <MapPin className="h-4 w-4 text-[#bd7724]" />
                  {place}
                </p>
              )}
            </div>
            {links.length > 0 && (
              <ul className="m-0 flex list-none gap-2 p-0 sm:ml-auto">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e6e8ee] text-[#061948] transition-colors hover:border-[#061948] hover:bg-[#061948] hover:text-white"
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label}
                    >
                      <SocialIcon link={link} className="h-[16px] w-[16px]" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {content && (
            <div className="rich-content mt-8 text-[15px] leading-[1.75] text-[#3c4252]" dangerouslySetInnerHTML={{ __html: content }} />
          )}

          {gallery.length > 0 && (
            <div className="mt-10">
              <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[28px] font-medium text-[#061948]">
                Gallery
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {gallery.map((picture) => (
                  <a
                    key={picture}
                    className="block overflow-hidden rounded-lg border border-[#e6e8ee]"
                    href={picture}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-105"
                      src={picture}
                      alt=""
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
