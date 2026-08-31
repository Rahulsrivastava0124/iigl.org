import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Clock,
  Diamond,
  Gem,
  GraduationCap,
  LayoutGrid,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import ac1Url from '../../../Assets/AC1.png';
import ac2Url from '../../../Assets/AC2.png';
import ac3Url from '../../../Assets/AC3.png';
import ac4Url from '../../../Assets/AC4.png';

/**
 * The filter row. `all` is the resting state, so it is first and starts active;
 * every other id is matched against a course's `track`.
 */
const filters = [
  { id: 'all', label: 'All Courses', icon: LayoutGrid },
  { id: 'gemology', label: 'Gemology', icon: Diamond },
  { id: 'jewellery', label: 'Jewellery', icon: Gem },
  { id: 'certification', label: 'Certification', icon: ScrollText },
  { id: 'fundamentals', label: 'Fundamentals', icon: GraduationCap },
];

const courses = [
  {
    title: 'Diamond Basics',
    description: 'Understand the fundamentals of diamonds, the 4Cs, shapes, and their characteristics.',
    level: 'Beginner',
    duration: '6 Hours',
    lessons: '12 Lessons',
    track: 'fundamentals',
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
    track: 'gemology',
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
    track: 'jewellery',
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
    track: 'certification',
    image: ac4Url,
    imageAlt: 'An IIGL certificate with a gold seal',
    // icon: ScrollText,
  },
];

export default function AvailableCoursesSection() {
  const [active, setActive] = useState('all');
  const shown = active === 'all' ? courses : courses.filter((course) => course.track === active);

  return (
    <section id="courses" className="bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          {/* The eyebrow is ruled on both sides in the design, so the rules are
              part of the label rather than a divider under the heading. */}
          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-[60px] bg-[#d58a2b]/45 max-[520px]:w-[34px]" />
            <p className="m-0 text-[12px] font-medium uppercase leading-none tracking-[0.14em] text-[#bd7724]">
              IIGL Education
            </p>
            <span className="h-px w-[60px] bg-[#d58a2b]/45 max-[520px]:w-[34px]" />
          </div>

          <h2 className="relative m-0 mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[46px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[34px]">
            Available Courses
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[15px] font-normal leading-[1.65] text-[#4a5265]">
            Explore expert-led courses designed to build your knowledge and skills in gemology, diamonds and jewellery.
          </p>
        </div>

        <div className="mt-7 border-b border-[#e6e8ee] pb-6">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
            {filters.map(({ id, label, icon: Icon }) => {
              const on = id === active;

              return (
                <button
                  aria-pressed={on}
                  className={`inline-flex h-[46px] items-center gap-2.5 rounded-full px-6 text-[14px] font-medium leading-none transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d58a2b] max-[520px]:h-[40px] max-[520px]:px-4 max-[520px]:text-[13px] ${
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

        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map(({ title, description, level, duration, lessons, image, imageAlt, icon: Icon }) => (
            <article
              className="flex flex-col overflow-hidden rounded-xl border border-[#e6e8ee] bg-white shadow-[0_15px_38px_rgba(44,59,100,0.08)]"
              key={title}
            >
              <div className="relative h-[196px] overflow-hidden bg-[#f8f9fb]">
                <img className="h-full w-full object-cover" src={image} alt={imageAlt} />
                <span className="absolute right-3 top-3 rounded-md bg-[#bd7724] px-2.5 py-1 text-[11px] font-medium leading-none text-white">
                  {level}
                </span>
              </div>

              {/* Padding lives here, not on the article, so the image stays
                  flush with the card edge. */}
              <div className="flex flex-1 flex-col px-5 pb-5 pt-5">
                <div className="flex items-start gap-3.5">
                  {/* <span className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[#f7efe7] text-[#d58a2b]">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.6} />
                  </span> */}
                  <h3 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[19px] font-medium leading-[1.25] tracking-normal text-[#061948]">
                    {title}
                  </h3>
                </div>
                <p className="mt-4 text-[14px] font-normal leading-[1.65] text-[#4a5265]">{description}</p>

                {/* Pushed to the bottom so the meta row lines up across cards
                    whose descriptions run to different lengths. */}
                <div className="mt-auto flex items-center gap-3 pt-6 text-[13px] font-normal leading-none text-[#4a5265]">
                  <span className="inline-flex items-center gap-2">
                    <Clock className="h-[15px] w-[15px] text-[#2c3b64]" strokeWidth={1.6} />
                    {duration}
                  </span>
                  <span className="h-[14px] w-px bg-[#e6e8ee]" />
                  <span className="inline-flex items-center gap-2">
                    <BarChart3 className="h-[15px] w-[15px] text-[#2c3b64]" strokeWidth={1.6} />
                    {lessons}
                  </span>
                </div>
              </div>

              <a
                className="flex items-center justify-between bg-[#061948] px-5 py-4 text-[14px] font-medium leading-none text-white transition duration-200 hover:bg-[#10285e] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#d58a2b]"
                href="#courses"
              >
                <span>View Course</span>
                <ArrowRight className="h-[17px] w-[17px]" strokeWidth={1.8} />
              </a>
            </article>
          ))}
        </div>

        <div className="mt-9 flex justify-center">
          <a
            className="inline-flex h-[54px] items-center justify-center gap-4 rounded-lg border border-[#061948] px-8 text-[15px] font-medium leading-none text-[#061948] transition duration-200 hover:bg-[#061948] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d58a2b]"
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
