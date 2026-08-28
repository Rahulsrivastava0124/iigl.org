import { Autoplay, EffectFade, Pagination } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import { ArrowRight, BadgeCheck, FileCheck2, Gem, Microscope } from 'lucide-react';
import 'swiper/css';
import 'swiper/css/effect-fade';
import 'swiper/css/pagination';
import heroUrl from '../../../Assets/Hero banner 1.png';
import heroAltUrl from '../../../Assets/Hero banner.png';

const featureItems = [
  { label: 'International Standards', icon: Gem },
  { label: 'Accurate Certification', icon: FileCheck2 },
  { label: 'Advanced Technology', icon: Microscope },
  { label: 'Trusted Worldwide', icon: BadgeCheck },
];

const slides = [
  {
    eyebrow: 'TRUSTED. PRECISE. INTERNATIONAL.',
    titleLines: ['Institute of International', 'Gemological Laboratory'],
    body: 'IIGL is a globally recognized gemological laboratory providing accurate, unbiased and internationally accepted gemstone certification.',
    image: heroUrl,
  },
  {
    eyebrow: 'CERTIFIED. RELIABLE. GLOBAL.',
    titleLines: ['Gemstone Reports Built',' on Expert Analysis'],
    body: 'Every report is supported by careful inspection, advanced gem testing technology and a commitment to dependable international standards.',
    image: heroAltUrl,
  },
];

export default function HeroSection() {
  return (
    <main className="relative h-[calc(100svh-62px)] bg-[#f7f8f8] max-[560px]:h-[calc(100svh-60px)]">
      <Swiper
        className="hero-swiper h-full"
        modules={[Autoplay, EffectFade, Pagination]}
        effect="fade"
        loop
        speed={900}
        autoplay={{
          delay: 4500,
          disableOnInteraction: false,
        }}
        pagination={{ clickable: true }}
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.titleLines.join(' ')}>
            <section className="relative h-full overflow-hidden bg-[#f8f9f9]">
              <img className="absolute inset-0 h-full w-full object-cover object-right max-[560px]:object-[68%_center]" src={slide.image} alt="" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.91)_34%,rgba(255,255,255,0.24)_61%,rgba(255,255,255,0.02)_100%),radial-gradient(circle_at_22%_54%,rgba(255,255,255,0.78),rgba(255,255,255,0)_35%)] max-[900px]:bg-[linear-gradient(90deg,rgba(255,255,255,0.97)_0%,rgba(255,255,255,0.86)_58%,rgba(255,255,255,0.34)_100%)] max-[560px]:bg-[rgba(255,255,255,0.84)]" />

              <div className="relative z-2 flex h-full w-[min(760px,52vw)] flex-col justify-center pl-[clamp(48px,5.7vw,108px)] max-[1200px]:w-[min(650px,54vw)] max-[900px]:w-[min(560px,calc(100%-36px))] max-[900px]:pl-[18px]">
                <div className="mb-[18px] flex items-center">
                  <p className="m-0 text-[15px] font-medium leading-none tracking-normal text-[#d58a2b] max-[560px]:text-[11px]">{slide.eyebrow}</p>
                </div>

                <h1 className="m-0 max-w-[760px] font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[46px] font-medium leading-[1.06] tracking-normal text-[#061948] max-[900px]:max-w-[560px] max-[560px]:max-w-[360px] max-[560px]:text-[32px]">
                  {slide.titleLines.map((line) => (
                    <span className="block" key={line}>
                      {line}
                    </span>
                  ))}
                </h1>

                <p className="mt-7 max-w-[510px] text-[15px] font-normal leading-[1.78] text-[#3c4252] max-[900px]:mt-7 max-[900px]:max-w-[480px] max-[560px]:mt-[22px] max-[560px]:max-w-[330px] max-[560px]:text-[13px] max-[560px]:leading-[1.65]">{slide.body}</p>

                <div className="mt-[30px] grid grid-cols-[repeat(4,max-content)] items-center gap-[26px] max-[1200px]:mt-[34px] max-[1200px]:grid-cols-[repeat(2,max-content)] max-[1200px]:gap-x-7 max-[1200px]:gap-y-5 max-[900px]:mt-[30px] max-[900px]:grid-cols-[repeat(2,minmax(0,max-content))] max-[900px]:gap-x-5 max-[900px]:gap-y-4 max-[560px]:mt-6 max-[560px]:w-[min(100%,360px)] max-[560px]:grid-cols-2 max-[560px]:gap-[14px]">
                  {featureItems.map(({ label, icon: Icon }) => (
                    <div className="grid grid-cols-[50px_86px] items-center gap-3 text-[12px] font-medium leading-tight text-[#111827] max-[900px]:grid-cols-[48px_78px] max-[900px]:text-[11px] max-[560px]:grid-cols-[42px_minmax(0,1fr)] max-[560px]:gap-[9px] max-[560px]:text-[10px]" key={label}>
                      <span className="inline-flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white text-[#d58a2b] shadow-[0_14px_32px_rgba(42,45,55,0.08)] max-[900px]:h-12 max-[900px]:w-12 max-[560px]:h-[42px] max-[560px]:w-[42px] [&_svg]:max-[560px]:h-[22px] [&_svg]:max-[560px]:w-[22px]">
                        <Icon size={27} strokeWidth={1.75} />
                      </span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                <a className="mt-[34px] inline-flex h-[54px] w-fit items-center justify-center gap-[18px] rounded-lg bg-[#061948] px-6 text-[13px] font-medium leading-none tracking-normal text-white shadow-[0_16px_24px_rgba(6,25,72,0.16)] max-[1200px]:mt-[38px] max-[1200px]:h-14 max-[560px]:mt-[26px] max-[560px]:h-[50px] max-[560px]:px-5 max-[560px]:text-[11px]" href="#services">
                  <span>EXPLORE OUR SERVICES</span>
                  <ArrowRight size={15} strokeWidth={2.4} />
                </a>
              </div>
            </section>
          </SwiperSlide>
        ))}
      </Swiper>
    </main>
  );
}
