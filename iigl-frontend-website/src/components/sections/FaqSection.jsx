import { useState } from 'react';
import {
  ArrowRight,
  Clock,
  FileText,
  Mail,
  MessageCircleQuestion,
  Minus,
  Phone,
  Plus,
} from 'lucide-react';

/**
 * Frequently asked questions.
 *
 * An aside on the left with the ways to reach a person, the questions on the
 * right, and one row open at a time — a page of answers all open at once is a
 * wall of text nobody scans.
 *
 * Open/closed is the section's own state rather than `<details>`: only one row
 * may be open, and a native disclosure has no opinion about its neighbours.
 * Each row is still a real `<button>` with `aria-expanded`, which is what a
 * screen reader and the keyboard need.
 */

const faqs = [
  {
    question: 'What is IIGL’s grading report?',
    answer:
      'IIGL’s grading report is a detailed assessment of a gemstone’s quality based on internationally accepted standards. It includes accurate grading parameters to help you make confident decisions.',
  },
  {
    question: 'Is the grading report the same as a certificate?',
    answer:
      'They are commonly called certificates, but a grading report is an expert opinion on what a stone is and how it grades — not a guarantee of value. IIGL issues grading reports.',
  },
  {
    question: 'How long does it take to get a grading report?',
    answer:
      'Most stones are reported within a few working days of reaching the laboratory. Timing depends on the service, the number of stones and the tests each one needs; the counter confirms it when the stone is collected.',
  },
  {
    question: 'What information is included in the grading report?',
    answer:
      'The report identifies the species and variety, records weight, measurements, colour, clarity and cut where they apply, and discloses any treatment found. Every report carries its own number.',
  },
  {
    question: 'Is the grading report accepted internationally?',
    answer:
      'IIGL grades to internationally accepted standards, and the reports are used by retailers, wholesalers and exporters both in India and abroad.',
  },
  {
    question: 'Can I verify my grading report?',
    answer:
      'Yes. Enter the report number in Verify Your Report at the top of this page and the details on file will be shown, so a report can be checked against the laboratory’s own record.',
  },
  {
    question: 'Do you re-grade stones?',
    answer:
      'A stone can be submitted again — after a re-cut or re-set, or for a second opinion — and it is examined afresh. A re-grade is issued as a new report with its own number.',
  },
];

const contact = [
  { icon: Mail, label: 'Email Us', value: 'support@iiglabs.com', href: 'mailto:support@iiglabs.com' },
  { icon: Phone, label: 'Call Us', value: '+91 12345 67890', href: 'tel:+911234567890' },
  { icon: Clock, label: 'Support Hours', value: 'Mon – Sat : 9:30 AM – 6:30 PM (IST)' },
];

export default function FaqSection() {
  // The first answer is open on arrival: an accordion with everything shut
  // looks like a list of headings nobody thought to fill in.
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1390px]">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-[#bd7724]">
            FAQ
          </p>
          <span aria-hidden className="mx-auto mt-3 block h-px w-14 bg-[#d58a2b]/70" />

          <h2 className="m-0 mt-5 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
            Frequently Asked Questions
          </h2>

          <p className="mx-auto mt-3 max-w-[760px] text-[16px] font-normal leading-[1.7] text-[#4a5265]">
            Find answers to the most common questions about our grading reports and services.
          </p>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,1fr)]">
          {/* ------------------------------------------------- have a question */}
          <aside className="rounded-xl border border-[#e6e8ee] bg-[#fbfbfc] px-6 py-8 text-center">
            <span
              aria-hidden
              className="inline-flex h-[86px] w-[86px] items-center justify-center rounded-full border border-[#e8dccb] bg-white text-[#d58a2b]"
            >
              <MessageCircleQuestion className="h-[38px] w-[38px]" strokeWidth={1.5} />
            </span>

            <h3 className="m-0 mt-5 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[22px] font-medium text-[#061948]">
              Have a Question?
            </h3>
            <p className="mx-auto mt-3 max-w-[300px] text-[14px] font-normal leading-[1.7] text-[#4a5265]">
              Can’t find the answer you’re looking for? Our support team is here to help you.
            </p>

            <ul className="mt-7 space-y-5 border-t border-[#e6e8ee] pt-7 text-left">
              {contact.map(({ icon: Icon, label, value, href }) => (
                <li className="flex items-center gap-3" key={label}>
                  <span
                    aria-hidden
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-[#e8dccb] bg-white text-[#d58a2b]"
                  >
                    <Icon className="h-[19px] w-[19px]" strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-[#061948]">{label}</span>
                    {href ? (
                      <a
                        className="block text-[13.5px] font-normal text-[#4a5265] transition-colors hover:text-[#bd7724]"
                        href={href}
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="block text-[13.5px] font-normal text-[#4a5265]">{value}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </aside>

          {/* ------------------------------------------------------- the answers */}
          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = index === open;

              return (
                <article
                  key={faq.question}
                  className={`overflow-hidden rounded-xl border bg-white transition-colors ${
                    isOpen ? 'border-[#e6e8ee] shadow-[0_15px_38px_rgba(44,59,100,0.08)]' : 'border-[#eceef3]'
                  }`}
                >
                  <h3 className="m-0">
                    <button
                      className="flex w-full items-center gap-4 px-5 py-4 text-left"
                      type="button"
                      aria-expanded={isOpen}
                      // Clicking the open row closes it: a control that only
                      // ever opens is a control that stops responding.
                      onClick={() => setOpen(isOpen ? -1 : index)}
                    >
                      <span
                        aria-hidden
                        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border ${
                          isOpen
                            ? 'order-first border-[#e8dccb] bg-white text-[#d58a2b]'
                            : 'order-last border-[#e6e8ee] bg-white text-[#061948]'
                        }`}
                      >
                        {isOpen ? (
                          <Minus className="h-[15px] w-[15px]" strokeWidth={2} />
                        ) : (
                          <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
                        )}
                      </span>
                      <span className="flex-1 text-[16px] font-medium leading-[1.5] text-[#061948]">
                        {faq.question}
                      </span>
                    </button>
                  </h3>

                  {isOpen && (
                    <p className="m-0 pb-5 pl-[66px] pr-6 text-[15px] font-normal leading-[1.75] text-[#3c4252] max-[560px]:pl-5">
                      {faq.answer}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------- footer */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 rounded-xl border border-[#e6e8ee] bg-[#fbfbfc] px-6 py-5">
          <span
            aria-hidden
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-[#e8dccb] bg-white text-[#d58a2b]"
          >
            <FileText className="h-[19px] w-[19px]" strokeWidth={1.6} />
          </span>
          <p className="m-0 text-[15px] font-normal text-[#3c4252]">
            Still have questions? Contact our support team.
          </p>
          <span aria-hidden className="hidden h-7 w-px bg-[#e6e8ee] sm:block" />
          <a
            className="group inline-flex h-10 w-fit items-center justify-center gap-3 rounded-lg bg-[#061948] px-5 text-[11px] font-medium uppercase leading-none tracking-[0.04em] text-white shadow-[0_12px_20px_rgba(6,25,72,0.14)]"
            href="#contact"
          >
            <span>Contact Us</span>
            <ArrowRight
              className="transition-transform group-hover:translate-x-1"
              size={16}
              strokeWidth={2}
            />
          </a>
        </div>
      </div>
    </section>
  );
}
