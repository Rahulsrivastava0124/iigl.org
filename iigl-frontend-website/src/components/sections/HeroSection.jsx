import { A11y, Autoplay, Keyboard, Pagination } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/pagination';
import { fileUrl, usePublic } from '../../lib/api.js';


/**
 * The banners, and nothing else.
 *
 * Full width, one photograph at a time, with the dots in the white strip
 * underneath rather than over the picture. The copy that used to sit here —
 * heading, feature icons, a button — has gone: the sections below say the same
 * things with room to say them, and the banner is stronger carrying only the
 * image.
 */

export default function HeroSection() {
  /*
    The sliders from the panel's Website Setup › Banners — type "slider",
    active — as the old home page read them, with the phone-sized picture
    where one was uploaded. None, and the section is left out rather than
    filled with stock photographs.
  */
  const rows = usePublic('/banners?type=slider');
  const slides = (rows ?? [])
    .map((b) => ({ image: fileUrl(b.path), mobile: fileUrl(b.mobile_slider), alt: b.name ?? '', url: b.url }))
    .filter((b) => b.image);
  if (slides.length === 0) return null;

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
        {slides.map((banner) => {
          const picture = (
            <picture className="block">
              {banner.mobile && <source media="(max-width: 640px)" srcSet={banner.mobile} />}
              <img
                className="h-[clamp(240px,48vw,760px)] w-full object-cover"
                src={banner.image}
                alt={banner.alt}
              />
            </picture>
          );
          return (
            <SwiperSlide key={banner.image}>
              {banner.url ? <a href={banner.url}>{picture}</a> : picture}
            </SwiperSlide>
          );
        })}
      </Swiper>

      <div className="hero-dots flex items-center justify-center gap-2 py-5" />
    </main>
  );
}
