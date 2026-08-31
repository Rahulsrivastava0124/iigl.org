import { CircleDot, Diamond, Flower2, Gem, MoveRight } from 'lucide-react';
import card1Url from '../../../Assets/card1.png';
import card2Url from '../../../Assets/card2.png';
import card3Url from '../../../Assets/card3.png';
import card4Url from '../../../Assets/card4.png';

const reportCategories = [
  {
    title: 'Gems Stone',
    description:
      'IIGL analyzes every gemstone to identify species and variety, provide detailed information, and disclose any treatments present.',
    image: card1Url,
    imageAlt: 'Colorful polished gemstones',
    icon: Gem,
  },
  {
    title: 'DIAMOND',
    description:
      "IIGL's loose diamond reports clearly identify natural or lab-grown origin and document all aspects of the diamond's value setting 4Cs.",
    image: card2Url,
    imageAlt: 'Diamond being inspected through magnification',
    icon: Diamond,
  },
  {
    title: 'JEWELLERY',
    description:
      'IIGL pioneered grading reports for finished jewelry, providing peace of mind for millions of consumers who purchase jewelry every day.',
    image: card3Url,
    imageAlt: 'Gold jewellery displayed on stands',
    icon: CircleDot,
  },
  {
    title: 'RUDRAKSH',
    description:
      'IIGL provides authentic Rudraksha certification based on scientific analysis of natural beads, ensuring their genuineness, origin, and spiritual significance.',
    image: card4Url,
    imageAlt: 'Natural Rudraksha beads',
    icon: Flower2,
  },
];

function ReportIcon({ category }) {
  const Icon = category.icon;

  return (
    <span className="absolute left-1/2 top-[148px] z-10 inline-flex h-[50px] w-[50px] -translate-x-1/2 items-center justify-center rounded-full bg-white text-[#d58a2b] shadow-[0_12px_26px_rgba(44,59,100,0.10)] ring-1 ring-[#e6e8ee] max-[1260px]:top-[140px] max-[640px]:top-[134px]">
      <Icon className="h-[26px] w-[26px]" strokeWidth={1.6} />
    </span>
  );
}

export default function ReportCategoriesSection() {
  return (
    <section id="reports" className="bg-[#f8f9fb] px-5 py-9 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
            Our Report Categories
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[15px] font-normal leading-[1.65] text-[#4a5265]">
            IIGL laboratory verifies each and every gems, Diamond and Diamond Jewellery with using advanced equipment.
            Experienced geologists show grades of characteristics according to the international system.
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {reportCategories.map((category) => (
            <article
              className="relative flex min-h-[422px] flex-col overflow-hidden rounded-xl border border-[#e6e8ee] bg-white text-center shadow-[0_22px_52px_rgba(44,59,100,0.16)] max-[1260px]:min-h-[416px] max-[640px]:min-h-[436px]"
              key={category.title}
            >
              <div className="h-[166px] overflow-hidden bg-[#f8f9fb] max-[1260px]:h-[158px] max-[640px]:h-[152px]">
                <img className="h-full w-full object-cover" src={category.image} alt={category.imageAlt} />
              </div>

              <ReportIcon category={category} />

              <div className="flex flex-1 flex-col items-center px-5 pb-5 pt-[50px]">
                <h3 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[18px] font-medium uppercase leading-tight tracking-normal text-[#061948]">
                  {category.title}
                </h3>

                <p className="mt-3 max-w-[238px] text-[11.5px] font-normal leading-[1.6] text-[#3c4252]">
                  {category.description}
                </p>

                <a
                  className="mt-auto inline-flex h-10 w-[min(100%,195px)] items-center justify-center gap-3 rounded-lg border border-[#2c3b64] bg-white px-4 text-[11px] font-medium leading-none text-[#061948] transition duration-200 hover:bg-[#061948] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d58a2b]"
                  href="#reports"
                >
                  <span>Explore Reports</span>
                  <MoveRight size={16} strokeWidth={2} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
