import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Search, UserRound } from 'lucide-react';
import SectionLabel from '../SectionLabel.jsx';
import blogHero from '../../../Assets/hero/blog.jpg';
import { fileUrl, getPublic } from '../../lib/api.js';
import { cleanHtml } from '../../lib/html.js';
import card1 from '../../../Assets/card1.png';
import card2 from '../../../Assets/card2.png';
import card3 from '../../../Assets/card3.png';
import card4 from '../../../Assets/card4.png';

/**
 * The blog: every article at /blog, and each one at /blog/<slug>.
 *
 * Written in the panel under Website Setup › Blog — title, address, card image,
 * banner, category, author, publish date and the article itself. An article
 * dated in the future stays off the site until that day.
 */

const serif = "font-['Playfair_Display',Georgia,'Times_New_Roman',serif]";

/** An article with no card image of its own borrows one of the site's. */
const FALLBACK = [card1, card2, card3, card4];
const imageOf = (article, field = 'thumbnail') =>
  fileUrl(article[field]) ?? fileUrl(article.banner) ?? fileUrl(article.thumbnail) ?? FALLBACK[article.id % FALLBACK.length];

const dayOf = (value) => (value ? String(value).slice(0, 10) : null);

/** `2026-09-16` as `16 Sept 2026`. */
const longDate = (value) => {
  const day = dayOf(value);
  if (!day) return null;
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Published, or undated: an article set for a later day waits for it. */
const isLive = (article) => {
  const day = dayOf(article.published_on);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return !day || day <= today;
};

/** Minutes to read, at a comfortable 200 words a minute. */
const readingMinutes = (html) => {
  const words = new DOMParser().parseFromString(html ?? '', 'text/html').body.textContent.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

function Meta({ article, minutes, light = false }) {
  const tone = light ? 'text-white/80' : 'text-[#4a5265]';
  const icon = light ? 'text-[#e3b447]' : 'text-[#bd7724]';
  const date = longDate(article.published_on ?? article.created_at);
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] ${tone}`}>
      {article.author && (
        <span className="inline-flex items-center gap-1.5">
          <UserRound className={`h-4 w-4 ${icon}`} /> {article.author}
        </span>
      )}
      {date && (
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className={`h-4 w-4 ${icon}`} /> {date}
        </span>
      )}
      {minutes && (
        <span className="inline-flex items-center gap-1.5">
          <Clock className={`h-4 w-4 ${icon}`} /> {minutes} min read
        </span>
      )}
    </div>
  );
}

function Category({ children }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-[#fdf3e6] px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#bd7724]">
      {children}
    </span>
  );
}

function ArticleCard({ article }) {
  return (
    <a
      href={`/blog/${article.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#e6e8ee] bg-white shadow-[0_15px_38px_rgba(44,59,100,0.08)] transition-shadow hover:shadow-[0_20px_46px_rgba(44,59,100,0.16)]"
    >
      <div className="aspect-[16/10] overflow-hidden bg-[#f8f9fb]">
        <img
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          src={imageOf(article)}
          alt=""
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        {article.category && (
          <div>
            <Category>{article.category}</Category>
          </div>
        )}
        <h3 className={`m-0 mt-3 ${serif} text-[21px] font-medium leading-[1.25] text-[#061948] group-hover:text-[#bd7724]`}>
          {article.page_name}
        </h3>
        {article.excerpt && (
          <p className="m-0 mb-5 mt-2 line-clamp-3 text-[14px] leading-[1.65] text-[#4a5265]">{article.excerpt}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#e6e8ee] pt-4">
          <span className="text-[12px] text-[#4a5265]">{longDate(article.published_on ?? article.created_at)}</span>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#bd7724]">
            Read more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </a>
  );
}

function Hero({ title, intro }) {
  return (
    <section className="relative overflow-hidden bg-[#061948] px-4 py-16 text-center text-white sm:px-8 lg:px-12">
      <img src={blogHero} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      <span aria-hidden className="absolute inset-0 bg-linear-to-b from-[#0b2a63]/72 to-[#061948]/92" />
      <div className="relative mx-auto max-w-[860px]">
        <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#e3b447]">IIGL Blog</p>
        <h1 className={`m-0 mt-4 ${serif} text-[48px] font-medium leading-[1.08] max-[640px]:text-[24px]`}>{title}</h1>
        <p className="mx-auto mt-4 max-w-[680px] text-[16px] leading-[1.7] text-white/80 max-[640px]:mt-2.5 max-[640px]:text-[12.5px] max-[640px]:leading-[1.55]">{intro}</p>
      </div>
    </section>
  );
}

function Notice({ title, text, back }) {
  return (
    <div className="mx-auto max-w-[520px] py-16 text-center">
      <h2 className={`m-0 ${serif} text-[28px] font-medium text-[#061948] max-[640px]:text-[22px]`}>{title}</h2>
      <p className="mx-auto mt-3 text-[15px] leading-[1.7] text-[#4a5265]">{text}</p>
      {back && (
        <a className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-[#bd7724] hover:underline" href="/blog">
          <ArrowLeft className="h-4 w-4" /> All articles
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the list

/** /blog — every published article, newest first, with search and categories. */
export default function BlogPage() {
  const [articles, setArticles] = useState(null);
  const [failed, setFailed] = useState(false);
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('All');

  useEffect(() => {
    document.title = 'Blog — IIGL';
    const controller = new AbortController();
    getPublic('/public/blogs', { signal: controller.signal })
      .then((rows) => setArticles((Array.isArray(rows) ? rows : []).filter(isLive)))
      .catch((error) => {
        if (error.name !== 'AbortError') setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const categories = useMemo(
    () => ['All', ...new Set((articles ?? []).map((a) => a.category?.trim()).filter(Boolean))],
    [articles],
  );

  const shown = (articles ?? []).filter((a) => {
    if (category !== 'All' && a.category?.trim() !== category) return false;
    const q = term.trim().toLowerCase();
    return !q || [a.page_name, a.excerpt, a.category, a.author].some((v) => v?.toLowerCase().includes(q));
  });
  const filtering = category !== 'All' || term.trim() !== '';
  const [featured, ...rest] = filtering ? [null, ...shown] : shown;

  return (
    <main className="bg-white text-[#2c3b64]">
      <Hero
        title="Insights on Gems, Diamonds & Jewellery"
        intro="Guides, grading explained and news from the laboratory — written by the IIGL team to help you buy, sell and learn with confidence."
      />

      <section className="bg-[#f8f9fb] px-4 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1240px]">
          {failed ? (
            <Notice title="The blog could not be loaded" text="Please check your connection and try again in a moment." />
          ) : articles === null ? (
            <p className="m-0 py-16 text-center text-[15px] text-[#4a5265]">Loading articles…</p>
          ) : articles.length === 0 ? (
            <Notice
              title="Articles are on their way"
              text="We are writing our first articles on gemstones, diamonds and jewellery. Please check back soon."
            />
          ) : (
            <>
              {/* Search and categories */}
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`h-9 rounded-full border px-4 text-[13px] font-medium transition-colors ${
                        category === c
                          ? 'border-[#061948] bg-[#061948] text-white'
                          : 'border-[#e6e8ee] bg-white text-[#2c3b64] hover:border-[#061948]'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <label className="relative block w-full md:w-[320px]">
                  <span className="sr-only">Search articles</span>
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a5265]" />
                  <input
                    type="search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search articles"
                    className="h-11 w-full rounded-lg border border-[#e6e8ee] bg-white pl-10 pr-4 text-[14px] text-[#2c3b64] outline-none placeholder:text-[#8a91a3] focus:border-[#061948]"
                  />
                </label>
              </div>

              {/* The newest article, large, while nothing is filtered */}
              {featured && (
                <a
                  href={`/blog/${featured.slug}`}
                  className="group mt-8 grid overflow-hidden rounded-2xl border border-[#e6e8ee] bg-white shadow-[0_15px_38px_rgba(44,59,100,0.08)] transition-shadow hover:shadow-[0_20px_46px_rgba(44,59,100,0.16)] lg:grid-cols-[1.15fr_1fr]"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-[#f8f9fb] lg:aspect-auto lg:min-h-[340px]">
                    <img
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      src={imageOf(featured, 'banner')}
                      alt=""
                    />
                  </div>
                  <div className="flex flex-col justify-center px-6 py-7 lg:px-10">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#bd7724]">Latest</span>
                      {featured.category && <Category>{featured.category}</Category>}
                    </div>
                    <h2 className={`m-0 mt-4 ${serif} text-[32px] font-medium leading-[1.15] text-[#061948] group-hover:text-[#bd7724] max-[640px]:text-[26px]`}>
                      {featured.page_name}
                    </h2>
                    {featured.excerpt && (
                      <p className="m-0 mt-3 line-clamp-4 text-[15px] leading-[1.7] text-[#4a5265]">{featured.excerpt}</p>
                    )}
                    <div className="mt-5">
                      <Meta article={featured} />
                    </div>
                    <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-[#061948] px-5 py-3 text-[13px] font-medium uppercase tracking-[0.04em] text-white">
                      Read article <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </a>
              )}

              {rest.length > 0 ? (
                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              ) : (
                filtering && (
                  <Notice title="No articles found" text="Nothing matches that search. Try another word or category." />
                )
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

// ------------------------------------------------------------- one article

/** /blog/<slug> — one article, with a few more to read after it. */
export function BlogArticlePage({ slug }) {
  const [article, setArticle] = useState(null);
  const [status, setStatus] = useState('loading');
  const [others, setOthers] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    getPublic(`/public/blogs/${slug}`, { signal: controller.signal })
      .then((data) => {
        if (!isLive(data)) throw new Error('not yet published');
        setArticle(data);
        setStatus('ready');
        document.title = `${data.meta_title || data.page_name} — IIGL Blog`;
        const description = data.meta_description || data.excerpt;
        if (description) {
          let tag = document.querySelector('meta[name="description"]');
          if (!tag) {
            tag = document.createElement('meta');
            tag.name = 'description';
            document.head.appendChild(tag);
          }
          tag.content = description;
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus('missing');
      });
    getPublic('/public/blogs', { signal: controller.signal })
      .then((rows) => setOthers((Array.isArray(rows) ? rows : []).filter(isLive)))
      .catch(() => {});
    return () => controller.abort();
  }, [slug]);

  if (status !== 'ready') {
    return (
      <main className="bg-[#f8f9fb] px-4 text-[#2c3b64]">
        {status === 'loading' ? (
          <p className="m-0 py-24 text-center text-[15px] text-[#4a5265]">Loading the article…</p>
        ) : (
          <Notice
            title="Article not found"
            text="This article is not on the website. It may have been moved, or the link is out of date."
            back
          />
        )}
      </main>
    );
  }

  const content = cleanHtml(article.content);
  const minutes = readingMinutes(article.content);
  // Same category first, then the newest of the rest.
  const more = others
    .filter((a) => a.slug !== article.slug)
    .sort((a, b) => Number(b.category === article.category) - Number(a.category === article.category))
    .slice(0, 3);

  return (
    <main className="bg-white text-[#2c3b64]">
      <section className="relative overflow-hidden bg-[#061948] text-white">
        {(article.banner || article.thumbnail) && (
          <>
            <img className="absolute inset-0 h-full w-full object-cover" src={imageOf(article, 'banner')} alt="" />
            <div className="absolute inset-0 bg-linear-to-t from-[#061948] via-[#061948]/80 to-[#061948]/40" />
          </>
        )}
        <div className="relative mx-auto max-w-[860px] px-4 pb-12 pt-10 sm:px-8 lg:pt-16">
          <a className="inline-flex items-center gap-2 text-[13px] font-medium text-[#e3b447] hover:underline" href="/blog">
            <ArrowLeft className="h-4 w-4" /> All articles
          </a>
          {article.category && (
            <p className="m-0 mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-[#e3b447]">{article.category}</p>
          )}
          <h1 className={`m-0 mt-3 ${serif} text-[44px] font-medium leading-[1.12] max-[640px]:text-[25px]`}>{article.page_name}</h1>
          {article.excerpt && <p className="m-0 mt-4 max-w-[720px] text-[17px] leading-[1.7] text-white/85">{article.excerpt}</p>}
          <div className="mt-6">
            <Meta article={article} minutes={minutes} light />
          </div>
        </div>
      </section>

      <article className="px-4 py-12 sm:px-8">
        <div
          className="rich-content mx-auto max-w-[760px] text-[16px] leading-[1.85] text-[#3c4252]"
          dangerouslySetInnerHTML={{ __html: content || '<p>This article has no text yet.</p>' }}
        />
        <div className="mx-auto mt-10 flex max-w-[760px] items-center justify-between border-t border-[#e6e8ee] pt-6">
          <a className="inline-flex items-center gap-2 text-[14px] font-medium text-[#bd7724] hover:underline" href="/blog">
            <ArrowLeft className="h-4 w-4" /> All articles
          </a>
          {article.author && <span className="text-[13px] text-[#4a5265]">Written by {article.author}</span>}
        </div>
      </article>

      {more.length > 0 && (
        <section className="bg-[#f8f9fb] px-4 py-14 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1240px]">
            <div className="text-center">
              <SectionLabel>Keep Reading</SectionLabel>
              <h2 className={`m-0 mt-4 ${serif} text-[36px] font-medium leading-[1.08] text-[#061948] max-[640px]:text-[24px]`}>
                More From the Blog
              </h2>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
