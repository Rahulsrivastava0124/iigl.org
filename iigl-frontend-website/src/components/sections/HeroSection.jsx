import { A11y, Autoplay, Keyboard, Pagination } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/pagination';
import heroUrl from '../../../Assets/Hero banner 1.png';
import heroAltUrl from '../../../Assets/Hero banner.png';
import hero2Url from '../../../Assets/Hero banner 3.png';
import hero2AltUrl from '../../../Assets/Hero banner 4.png';


/**
 * The banners, and nothing else.
 *
 * Full width, one photograph at a time, with the dots in the white strip
 * underneath rather than over the picture. The copy that used to sit here —
 * heading, feature icons, a button — has gone: the sections below say the same
 * things with room to say them, and the banner is stronger carrying only the
 * image.
 */
const banners = [
  { image: heroUrl, alt: 'Coloured gemstones being examined with a loupe' },
  { image: heroAltUrl, alt: 'A brilliant-cut diamond beside red gemstones' },
  { image: hero2Url, alt: 'A close-up of a blue sapphire' },
  { image: hero2AltUrl, alt: 'A yellow diamond set in a ring' },
];

export default function HeroSection() {
  return (
    <main className="bg-white">
      <Swiper
        className="hero-swiper w-full"
        modules={[A11y, Autoplay, Keyboard, Pagination]}
        loop
        speed={700}
        spaceBetween={0}
        slidesPerView={1}
        autoplay={{
          // Keeps running after a click — a banner that stops for good on one
          // touch is a banner frozen on slide two — and waits while the pointer
          // is over it.
          delay: 4500,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        // Rendered into the strip below rather than inside the slider: Swiper's
        // own `.swiper` rule zeroes the padding a utility class puts there, so
        // a bullet left inside lands on the photograph.
        pagination={{ el: '.hero-dots', clickable: true }}
        keyboard={{ enabled: true }}
        a11y={{ prevSlideMessage: 'Previous banner', nextSlideMessage: 'Next banner' }}
      >
        {banners.map((banner) => (
          <SwiperSlide key={banner.image}>
            <img
              className="h-[clamp(270px,40vw,600px)] w-full object-cover"
              src={banner.image}
              alt={banner.alt}
            />
          </SwiperSlide>
        ))}
      </Swiper>

      <div className="hero-dots flex items-center justify-center gap-2 py-5" />
    </main>
  );
}
