import certificateUrl from '../../../Assets/certificate.png';
import logoTextUrl from '../../../Assets/logo-text.png';

export default function IiglReportsSection() {
  return (
    <section className="bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="grid items-end gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14">
          <div>
            <h2 className="m-0 flex flex-wrap items-end gap-x-4 gap-y-2 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[46px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[34px]">
              <img
                className="h-auto w-[clamp(112px,10vw,154px)] translate-y-[2px]"
                src={logoTextUrl}
                alt="IIGL"
              />
              <span>Reports</span>
            </h2>
          </div>

          <p className="max-w-[650px] text-[17px] font-normal leading-[1.8] text-[#3c4252] lg:pb-1 max-[900px]:text-[15px] max-[900px]:leading-[1.7]">
            What&apos;s commonly called a &lsquo;certificate&rsquo; is actually a grading report. IIGL issues a wide variety
            of reports, grading and authenticating loose diamonds, gemstones, and finished jewelry around the world.
          </p>
        </div>

        <figure className="mt-9 h-[clamp(300px,34vw,520px)] overflow-hidden rounded-[22px] border border-[#e6e8ee] bg-[#edf3f7] shadow-[0_20px_46px_rgba(44,59,100,0.12)] max-[640px]:mt-7 max-[640px]:h-[260px] max-[640px]:rounded-xl">
          <img
            className="h-full w-full object-cover"
            src={certificateUrl}
            alt="IIGL printed grading report booklet and certificate preview"
          />
        </figure>
      </div>
    </section>
  );
}
