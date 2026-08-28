import { FileBadge2, Gem, Microscope, ShieldCheck, UsersRound } from 'lucide-react';
import whyChooseBg from '../../../Assets/whychoose_bg.png';

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

export default function WhyChooseSection() {
  return (
    <section
      className="bg-cover bg-center bg-no-repeat px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12"
      style={{ backgroundImage: `url(${whyChooseBg})` }}
    >
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[680px] text-center">
          <p className="m-0 text-[14px] font-medium uppercase leading-none tracking-normal text-[#d58a2b]">
            Why Choose IIGL?
          </p>

          <h2 className="mt-5 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[clamp(30px,3.2vw,46px)] font-medium leading-[1.08] tracking-normal text-[#061948]">
            Excellence in Gemology,
            <span className="block">Trust in Every Report</span>
          </h2>

          <p className="mx-auto mt-4 max-w-[610px] text-[15px] font-normal leading-[1.65] text-[#4a5265]">
            We combine international standards, advanced technology, and expertise to deliver reports you can trust with complete confidence.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {reasons.map(({ title, description, icon: Icon }) => (
            <article
              className="flex min-h-[198px] flex-col items-center justify-start rounded-xl border border-[#e6e8ee] bg-white px-5 py-7 text-center shadow-[0_15px_38px_rgba(44,59,100,0.08)]"
              key={title}
            >
              <span className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#f7efe7] text-[#d58a2b]">
                <Icon size={34} strokeWidth={1.6} />
              </span>

              <h3 className="mt-5 text-[15px] font-medium leading-tight tracking-normal text-[#061948]">
                {title}
              </h3>

              <p className="mt-3 text-[13px] font-normal leading-[1.55] text-[#30394d]">
                {description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
