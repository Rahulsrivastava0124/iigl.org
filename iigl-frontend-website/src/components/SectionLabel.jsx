/**
 * The small gold label above a section heading — "Trusted By Many" — with a
 * gold rule on either side that fades out towards its far end.
 *
 * One component so every section's label is the same size, spacing and rule:
 * they were written out by hand in each section and had drifted (a rule under
 * some, rules beside one, none on others, three different trackings).
 *
 * `align="start"` puts it at the left of a left-aligned block, as the
 * Education section's copy is; the rules stay on both sides.
 */
export default function SectionLabel({ children, align = 'center', className = '' }) {
  return (
    <p
      className={`m-0 flex items-center gap-4 text-[12px] font-medium uppercase leading-none tracking-[0.14em] text-[#bd7724] ${
        align === 'start' ? 'justify-start' : 'justify-center'
      } ${className}`}
    >
      <span aria-hidden className="h-px w-16 shrink-0 bg-linear-to-r from-transparent to-[#d58a2b]/80 max-[520px]:w-9" />
      <span>{children}</span>
      <span aria-hidden className="h-px w-16 shrink-0 bg-linear-to-l from-transparent to-[#d58a2b]/80 max-[520px]:w-9" />
    </p>
  );
}
