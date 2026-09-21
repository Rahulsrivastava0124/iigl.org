import { useState } from 'react';
import { A11y, Autoplay, Scrollbar } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/scrollbar';
import {
  ArrowRight,
  BarChart3,
  Clock,
  Diamond,
  Gem,
  GraduationCap,
  LayoutGrid,
  ScrollText,
} from 'lucide-react';
import ac1Url from '../../../Assets/AC1.png';
import ac2Url from '../../../Assets/AC2.png';
import ac3Url from '../../../Assets/AC3.png';
import ac4Url from '../../../Assets/AC4.png';
import SectionLabel from '../SectionLabel.jsx';
import { fileUrl, usePublic } from '../../lib/api.js';

/**
 * The filter row is the categories the shown courses carry, typed per course in
 * the panel (Student › Course). A category named like one of the originals keeps
 * its icon; any other gets the gem.
 */
/** A course description is formatted HTML from the panel; a card shows its words. */
const plainText = (html) =>
  html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim() : '';

const ICONS = { gemology: Diamond, jewellery: Gem, certification: ScrollText, fundamentals: GraduationCap };

/** The four cards shown until a course in the panel has a website card written. */

const courses = [
  {
    title: 'Diamond Basics',
    description: 'Understand the fundamentals of diamonds, the 4Cs, shapes, and their characteristics.',
    level: 'Beginner',
    duration: '6 Hours',
    lessons: '12 Lessons',
    categories: ['Fundamentals'],
    image: ac1Url,
    imageAlt: 'A polished diamond held in tweezers',
    // icon: Diamond,
  },
  {
    title: 'Gemstone Identification',
    description: 'Learn to identify colored gemstones and understand their properties and origins.',
    level: 'Intermediate',
    duration: '8 Hours',
    lessons: '18 Lessons',
    categories: ['Gemology'],
    image: ac2Url,
    imageAlt: 'A gemstone examined through a loupe',
    // icon: Sparkles,
  },
  {
    title: 'Jewellery Design & Fabrication',
    description: 'Master the art of jewellery design, CAD, and fabrication techniques from experts.',
    level: 'Advanced',
    duration: '12 Hours',
    lessons: '24 Lessons',
    categories: ['Jewellery'],
    image: ac3Url,
    imageAlt: 'A diamond necklace and matching earrings',
    // icon: Gem,
  },
  {
    title: 'IIGL Certification Programs',
    description: 'Get certified with IIGL and boost your career with globally recognized credentials.',
    level: 'Certification',
    duration: 'Varies',
    lessons: 'Self Paced',
    categories: ['Certification'],
    image: ac4Url,
    imageAlt: 'An IIGL certificate with a gold seal',
    // icon: ScrollText,
  },
];

function CourseCard({ id, title, description, level, duration, lessons, image, imageAlt }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-[#e6e8ee] bg-white shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
      <div className="relative h-[196px] overflow-hidden bg-[#f8f9fb]">
        {image && <img className="h-full w-full object-cover" src={image} alt={imageAlt} />}
        {level && (
          <span className="absolute right-3 top-3 rounded-md bg-[#bd7724] px-2.5 py-1 text-[11px] font-medium leading-none text-white">
            {level}
          </span>
        )}
      </div>

      {/* Padding lives here, not on the article, so the image stays
          flush with the card edge. */}
      <div className="flex flex-1 flex-col px-5 pb-5 pt-5">
        <div className="flex items-start gap-3.5">
          <h3 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[19px] font-medium leading-[1.25] tracking-normal text-[#061948]">
            {title}
          </h3>
        </div>
        <p className="mt-4 text-[14px] font-normal leading-[1.65] text-[#4a5265]">{description}</p>

        {/* Pushed to the bottom so the meta row lines up across cards
            whose descriptions run to different lengths. */}
        <div className="mt-auto flex items-center gap-3 pt-6 text-[13px] font-normal leading-none text-[#4a5265]">
          {duration && (
            <span className="inline-flex items-center gap-2">
              <Clock className="h-[15px] w-[15px] text-[#2c3b64]" strokeWidth={1.6} />
              {duration}
            </span>
          )}
          {duration && lessons && <span className="h-[14px] w-px bg-[#e6e8ee]" />}
          {lessons && (
            <span className="inline-flex items-center gap-2">
              <BarChart3 className="h-[15px] w-[15px] text-[#2c3b64]" strokeWidth={1.6} />
              {/* "12" typed in the panel reads as "12 Lessons" on the card. */}
              {/^\d+$/.test(lessons) ? `${lessons} Lessons` : lessons}
            </span>
          )}
        </div>
      </div>

      <a
        className="flex items-center justify-between bg-[#061948] px-5 py-4 text-[15px] font-medium leading-none text-white transition duration-200 hover:bg-[#10285e] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#d58a2b]"
        // A course from the panel opens its own page; the built-in cards have none.
        href={id ? `/courses/${id}` : '#courses'}
      >
        <span>View Course</span>
        <ArrowRight className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </a>
    </article>
  );
}

export default function AvailableCoursesSection() {
  const [active, setActive] = useState('all');

  /*
    The offered courses whose website card has been written — a Title set on
    the course in the panel. A course without one is still a real course, but a
    card with no heading is not a card.
  */
  const rows = usePublic('/courses');
  const live = (rows ?? [])
    .filter((course) => course.title)
    .map((course) => ({
      id: course.id,
      title: course.title,
      description: course.subtitle ?? plainText(course.description),
      level: course.level,
      duration: course.duration,
      lessons: course.lessons,
      categories: course.categories ?? [],
      image: fileUrl(course.image),
      imageAlt: course.title,
    }));
  const list = live.length ? live : courses;

  // One button per category, however each course capitalised it.
  const filters = [{ id: 'all', label: 'All Courses', icon: LayoutGrid }];
  for (const name of list.flatMap((course) => course.categories)) {
    const id = name.toLowerCase();
    if (!filters.some((filter) => filter.id === id)) filters.push({ id, label: name, icon: ICONS[id] ?? Gem });
  }
  const current = filters.some((filter) => filter.id === active) ? active : 'all';
  const shown =
    current === 'all'
      ? list
      : list.filter((course) => course.categories.some((name) => name.toLowerCase() === current));

  return (
    <section id="courses" className="bg-white px-4 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <SectionLabel>IIGL Education</SectionLabel>

          <h2 className="relative m-0 mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[24px]">
            Available Courses
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[15px] font-normal leading-[1.65] text-[#4a5265]">
            Explore expert-led courses designed to build your knowledge and skills in gemology, diamonds and jewellery.
          </p>
        </div>

        <div className="mt-7 border-b border-[#e6e8ee] pb-6">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
            {filters.map(({ id, label, icon: Icon }) => {
              const on = id === current;

              return (
                <button
                  aria-pressed={on}
                  className={`inline-flex h-[46px] items-center gap-2.5 rounded-full px-6 text-[15px] font-medium leading-none transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d58a2b] max-[520px]:h-[40px] max-[520px]:px-4 max-[520px]:text-[13px] ${
                    on
                      ? 'bg-[#061948] text-white shadow-[0_12px_24px_rgba(6,25,72,0.18)]'
                      : 'bg-transparent text-[#2c3b64] hover:text-[#bd7724]'
                  }`}
                  key={id}
                  onClick={() => setActive(id)}
                  type="button"
                >
                  <Icon
                    className={`h-[18px] w-[18px] ${on ? 'text-white' : 'text-[#d58a2b]'}`}
                    strokeWidth={1.6}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Phone: the courses auto-advance through a swiper, with a draggable
            bar under them for position. Keyed on the filter so switching
            categories rebuilds the track from the first card. The static grid
            takes over from `sm` up. */}
        <div className="mt-7 sm:hidden">
          <Swiper
            key={current}
            className="w-full !pb-8"
            modules={[A11y, Autoplay, Scrollbar]}
            loop
            speed={600}
            spaceBetween={16}
            slidesPerView={1.15}
            autoplay={{ delay: 3000, disableOnInteraction: false }}
            scrollbar={{ draggable: true }}
            a11y={{ prevSlideMessage: 'Previous course', nextSlideMessage: 'Next course' }}
          >
            {shown.map((course) => (
              <SwiperSlide key={course.title} className="h-auto">
                <CourseCard {...course} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div className="mt-7 hidden gap-5 sm:grid sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((course) => (
            <CourseCard key={course.title} {...course} />
          ))}
        </div>

        <div className="mt-9 flex justify-center">
          <a
            className="inline-flex h-[54px] items-center justify-center gap-4 rounded-lg border border-[#061948] px-8 text-[16px] font-medium leading-none text-[#061948] transition duration-200 hover:bg-[#061948] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d58a2b]"
            href="#courses"
          >
            <span>View All Courses</span>
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </a>
        </div>
      </div>
    </section>
  );
}
