import { A11y, Autoplay } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { FileBadge2, Gem, Microscope, ShieldCheck, UsersRound } from 'lucide-react';
import whyChooseBg from '../../../Assets/whychoose_bg.png';
import SectionLabel from '../SectionLabel.jsx';

const reasons = [
  {
    title: 'International Standards',
    description: 'Reports accepted worldwide by leading industries and institutions.',
    icon: Gem,
  },
  {
    title: 'Accurate Certification',
    description: 'Detailed analysis and certification with unmatched accuracy.',
    icon: FileBadge2,
  },
  {
    title: 'Advanced Technology',
    description: 'State-of-the-art equipment and scientific methods for precise results.',
    icon: Microscope,
  },
  {
    title: 'Trusted Worldwide',
    description: 'A name trusted by customers, jewelers and organizations across the globe.',
    icon: ShieldCheck,
  },
  {
    title: 'Expert Professionals',
    description: 'Team of experienced gemologists committed to accuracy and excellence.',
    icon: UsersRound,
  },
];

function ReasonCard({ title, description, icon: Icon }) {
  return (
    <article className="flex min-h-[198px] flex-col items-center justify-start rounded-xl border border-[#e6e8ee] bg-white px-5 py-7 text-center shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
      <span className="icon-gold-outline inline-flex h-[58px] w-[58px]">
        <Icon size={34} strokeWidth={1.6} />
      </span>

      <h3 className="mt-5 text-[15px] font-medium leading-tight tracking-normal text-[#061948]">{title}</h3>

      <p className="mt-3 text-[13px] font-normal leading-[1.55] text-[#30394d]">{description}</p>
    </article>
  );
}

export default function WhyChooseSection() {
  return (
    <section
      className="bg-cover bg-center bg-no-repeat px-4 py-12 text-[#2c3b64] sm:px-8 lg:px-12"
      style={{ backgroundImage: `url(${whyChooseBg})` }}
    >
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[680px] text-center">
          <SectionLabel>Why Choose IIGL?</SectionLabel>

          <h2 className="mt-4 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[24px]">
            Excellence in Gemology,
            <span className="block">Trust in Every Report</span>
          </h2>
        </div>

        {/* Phone: the reasons auto-rotate through a swiper, one and a peek at a
            time. The static grid takes over from `sm` up. */}
        <div className="mt-12 sm:hidden">
          <Swiper
            className="w-full"
            modules={[A11y, Autoplay]}
            loop
            speed={600}
            spaceBetween={12}
            slidesPerView={1.15}
            autoplay={{ delay: 2500, disableOnInteraction: false }}
            a11y={{ prevSlideMessage: 'Previous reason', nextSlideMessage: 'Next reason' }}
          >
            {reasons.map((reason) => (
              <SwiperSlide key={reason.title} className="h-auto">
                <ReasonCard {...reason} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div className="mt-12 hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-5">
          {reasons.map((reason) => (
            <ReasonCard key={reason.title} {...reason} />
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-[610px] text-center text-[15px] font-normal leading-[1.65] text-[#4a5265]">
          We combine international standards, advanced technology, and expertise to deliver reports you can trust with complete confidence.
        </p>
      </div>
    </section>
  );
}
