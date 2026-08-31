import { ArrowRight, BookOpen, Gem, Presentation, UsersRound } from 'lucide-react';
import educationUrl from '../../../Assets/education.png';

const educationHighlights = [
  {
    title: 'World-Class Learning',
    description: 'Access top-rated gemology courses curated by industry experts.',
    icon: Gem,
  },
  {
    title: 'Expert Instructors',
    description: 'Learn from experienced professionals and practitioners.',
    icon: UsersRound,
  },
  {
    title: 'Wide Range of Topics',
    description: 'Explore diamonds, gemstones, grading, and laboratory standards.',
    icon: BookOpen,
  },
  {
    title: 'Industry Certifications',
    description: 'Build confidence with programs aligned to global standards.',
    icon: Presentation,
  },
];

export default function EducationSection() {
  return (
    <section id="education" className="bg-[#f8f9fb] px-5 py-10 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="relative min-h-[560px] overflow-hidden rounded-[26px] bg-white shadow-[0_18px_50px_rgba(44,59,100,0.10)] ring-1 ring-[#e6e8ee] max-[1180px]:min-h-[640px] max-[760px]:min-h-0 max-[760px]:rounded-2xl">
          <img
            className="absolute inset-y-0 left-0 h-full w-[104%] max-w-none object-cover object-left max-[760px]:static max-[760px]:h-[240px] max-[760px]:w-full max-[760px]:object-cover max-[760px]:object-[68%_center]"
            src={educationUrl}
            alt=""
          />

          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.96)_40%,rgba(255,255,255,0.18)_58%,rgba(255,255,255,0)_100%)] max-[1180px]:bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.92)_52%,rgba(255,255,255,0.34)_100%)] max-[760px]:hidden" />

          <div className="relative z-10 w-[min(51%,640px)] px-8 py-11 sm:px-10 lg:px-12 max-[1180px]:w-[min(60%,660px)] max-[760px]:w-full max-[760px]:px-6 max-[760px]:py-7">
            <div className="flex items-center gap-4 text-[#bd7724]">
              <p className="m-0 text-[12px] font-medium uppercase leading-none tracking-[0.08em]">IIGL Education</p>
              <Gem className="h-[24px] w-[24px]" strokeWidth={1.5} />
            </div>

            <h2 className="mt-7 max-w-[560px] font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[760px]:mt-6 max-[760px]:text-[28px]">
              Your Journey to Excellence Starts Here
            </h2>

            <p className="mt-6 max-w-[520px] text-[13px] font-normal leading-[1.7] text-[#3c4252]">
              Enroll in expert-led gemology courses designed to elevate your knowledge, advance your skills, and build
              a successful career.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 max-[760px]:grid-cols-1 max-[760px]:gap-y-5">
              {educationHighlights.map(({ title, description, icon: Icon }) => (
                <article className="grid grid-cols-[52px_1fr] gap-4" key={title}>
                  <span className="icon-gold-outline inline-flex h-12 w-12">
                    <Icon className="h-7 w-7" strokeWidth={1.5} />
                  </span>
                  <div>
                    <h3 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[15px] font-medium leading-tight tracking-normal text-[#061948]">
                      {title}
                    </h3>
                    <p className="mt-2 text-[11.5px] font-normal leading-[1.55] text-[#4a5265]">{description}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-5">
              <a
                className="inline-flex h-12 min-w-[190px] items-center justify-center gap-8 rounded-lg bg-[#061948] px-6 text-[16px] font-medium leading-none text-white shadow-[0_14px_22px_rgba(6,25,72,0.18)] transition duration-200 hover:bg-[#10285e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d58a2b] max-[760px]:min-w-[176px] max-[760px]:text-[14px]"
                href="#education"
              >
                <span>Enroll Now</span>
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
              </a>

              <a
                className="inline-flex flex-col text-[14px] font-medium leading-none text-[#061948] transition duration-200 hover:text-[#bd7724]"
                href="#education"
              >
                <span>Explore Courses</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
