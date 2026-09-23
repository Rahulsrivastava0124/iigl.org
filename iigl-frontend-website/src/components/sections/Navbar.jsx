import { useEffect, useState } from "react";
import { ChevronDown, Menu, Search, ShieldCheck, UserRound, X } from "lucide-react";
import logoUrl from "../../../Assets/logo-text.png";
import { getStudent, usePublic } from "../../lib/api.js";

const path = window.location.pathname;

const navItems = [
  { label: "HOME", href: "/", active: path === "/" },
  {
    label: "ABOUT",
    dropdown: true,
    active: ["/about-us", "/affiliation", "/importance-of-certificate"].includes(path),
    children: [
      { label: "About Us", href: "/about-us" },
      { label: "Affiliation", href: "/affiliation" },
      { label: "Importance of Certificate", href: "/importance-of-certificate" },
    ],
  },
  { label: "BRANCH", href: "/#branches", branches: true, active: path.startsWith("/branches/") },
  { label: "EDUCATION", href: "/education", active: path.startsWith("/education") },
  { label: "BLOG", href: "/blog", active: path.startsWith("/blog") },
  { label: "FAQ", href: "/faq", active: path === "/faq" },
  { label: "CONTACT", href: "/contact-us", active: path === "/contact-us" },
];

export default function Navbar() {
  // The laboratories ticked under Website Setup › Branches, each opening its own page.
  const branches = usePublic("/laboratories");
  // The mobile menu, closed until the hamburger is pressed.
  const [open, setOpen] = useState(false);

  // The signed-in student's name in place of "Student Login", cut to ten
  // letters so a long name cannot push the header over. Asked again whenever
  // the portal signs somebody in or out.
  const [student, setStudent] = useState(null);
  useEffect(() => {
    const check = () =>
      getStudent("/me")
        .then(setStudent)
        .catch(() => setStudent(null));
    check();
    window.addEventListener("iigl:student", check);
    return () => window.removeEventListener("iigl:student", check);
  }, []);
  const account = student?.name
    ? student.name.length > 10
      ? `${student.name.slice(0, 10).trimEnd()}…`
      : student.name
    : "Student Login";

  return (
    <header className="sticky top-0 z-50 flex h-[60px] w-full items-center border-b border-[rgba(18,25,68,0.08)] bg-white px-[34px] shadow-[0_11px_26px_rgba(19,28,58,0.10)] max-[900px]:px-[18px] max-[560px]:h-[58px]">
      <a
        className="flex h-[60px] shrink-0 items-center max-[560px]:h-[58px]"
        href="/"
        aria-label="IIGL home"
      >
        <img
          className="block w-[140px] h-auto max-[1200px]:w-[124px] max-[560px]:w-[118px]"
          src={logoUrl}
          alt="IIGL"
        />
      </a>

      <nav
        className="ml-auto flex h-full items-stretch gap-[clamp(18px,2vw,32px)] max-[900px]:hidden"
        aria-label="Primary navigation"
      >
        {navItems.map((item) => {
          const labs = item.branches ? branches ?? [] : [];
          const children = item.children ?? [];
          const hasMenu = labs.length > 0 || children.length > 0;
          return (
            <div className="group relative flex h-full" key={item.label}>
              <a
                className={`relative inline-flex h-full items-center gap-[7px] whitespace-nowrap text-[13px] font-medium leading-none tracking-normal max-[1200px]:text-[11px] ${
                  item.active
                    ? 'text-[#d58a2b] after:absolute after:inset-x-0 after:bottom-[13px] after:h-px after:bg-[#d58a2b] after:content-[""]'
                    : "text-[#2c3b64]"
                }`}
                href={item.href ?? `/#${item.label.toLowerCase()}`}
              >
                <span>{item.label}</span>
                {(item.dropdown || item.branches) && <ChevronDown size={12} strokeWidth={3} />}
              </a>

              {hasMenu && (
                <ul className="invisible absolute left-1/2 top-full m-0 flex max-h-[70vh] min-w-[240px] -translate-x-1/2 list-none flex-col overflow-y-auto rounded-xl border border-[#e6e8ee] bg-white p-2 opacity-0 shadow-[0_18px_44px_rgba(6,25,72,0.16)] transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {/* The About group's own pages. */}
                  {children.map((child) => (
                    <li key={child.href}>
                      <a
                        className="block rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[#061948] hover:bg-[#fdf7ef] focus-visible:bg-[#fdf7ef] focus-visible:outline-none"
                        href={child.href}
                      >
                        {child.label}
                      </a>
                    </li>
                  ))}
                  {/* Or the laboratories, each opening its own page. */}
                  {labs.map((lab) => (
                    <li key={lab.id}>
                      <a
                        className="block rounded-lg px-3 py-2 text-left hover:bg-[#fdf7ef] focus-visible:bg-[#fdf7ef] focus-visible:outline-none"
                        href={`/branches/${lab.id}`}
                      >
                        <span className="block whitespace-nowrap text-[13px] font-medium text-[#061948]">
                          {(lab.fullname ?? "").trim()}
                        </span>
                        {(lab.city || lab.state) && (
                          <span className="block whitespace-nowrap text-[12px] font-normal text-[#4a5265]">
                            {[lab.city, lab.state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ")}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="ml-[32px] flex items-center gap-[24px] max-[1200px]:ml-[24px] max-[1200px]:gap-[18px] max-[900px]:hidden">
        <a
          className="inline-flex h-[38px] min-w-[188px] items-center justify-center gap-2 rounded-full bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-6 text-[13px] font-medium leading-none tracking-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] max-[1200px]:h-[34px] max-[1200px]:min-w-[170px] max-[1200px]:px-[18px] max-[1200px]:text-[12px]"
          href="/verify-report"
        >
          <ShieldCheck size={20} strokeWidth={2.2} />
          <span>VERIFY REPORT</span>
        </a>
        <a
          className="inline-flex items-center gap-[9px] whitespace-nowrap text-[14px] font-medium text-[#2c3b64] max-[1200px]:text[12px]"
          href="/student"
        >
          <UserRound size={23} strokeWidth={2.1} />
          <span title={student?.name}>{account}</span>
        </a>
      </div>

      {/* Search and the hamburger, right-grouped on the small layout. The search
          jumps straight to Verify Report; the menu holds everything else. */}
      <a
        className="ml-auto hidden h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-[#2c3b64] max-[900px]:inline-flex"
        href="/verify-report"
        aria-label="Search a report"
      >
        <Search size={22} strokeWidth={2.1} />
      </a>
      <button
        className="hidden h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#2c3b64] max-[900px]:inline-flex"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* The menu itself, only ever mounted on the small layout the hamburger
          belongs to. A tap on any link closes it. Branches drop to the section
          on the home page rather than repeating the whole laboratory list. */}
      {open && (
        <div className="absolute inset-x-0 top-full hidden border-t border-[rgba(18,25,68,0.08)] bg-white shadow-[0_18px_44px_rgba(6,25,72,0.16)] max-[900px]:block">
          <nav className="flex flex-col p-4" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <div key={item.label}>
                <a
                  className={`block rounded-lg px-3 py-3 text-[14px] font-medium leading-none ${
                    item.active ? "text-[#d58a2b]" : "text-[#2c3b64]"
                  }`}
                  href={item.href ?? `/#${item.label.toLowerCase()}`}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
                {/* The About group's pages, indented under it. */}
                {(item.children ?? []).map((child) => (
                  <a
                    key={child.href}
                    className="block rounded-lg py-2.5 pl-8 pr-3 text-[13.5px] font-normal leading-none text-[#4a5265]"
                    href={child.href}
                    onClick={() => setOpen(false)}
                  >
                    {child.label}
                  </a>
                ))}
              </div>
            ))}

            <div className="mt-3 flex flex-col gap-3 border-t border-[rgba(18,25,68,0.08)] pt-4">
              <a
                className="inline-flex h-[42px] items-center justify-center gap-2 rounded-full bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-6 text-[13px] font-medium leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]"
                href="/verify-report"
                onClick={() => setOpen(false)}
              >
                <ShieldCheck size={20} strokeWidth={2.2} />
                <span>VERIFY REPORT</span>
              </a>
              <a
                className="inline-flex items-center justify-center gap-[9px] text-[14px] font-medium text-[#2c3b64]"
                href="/student"
                onClick={() => setOpen(false)}
              >
                <UserRound size={22} strokeWidth={2.1} />
                <span title={student?.name}>{account}</span>
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
