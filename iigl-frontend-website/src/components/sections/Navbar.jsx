import { ChevronDown, Menu, ShieldCheck, UserRound } from "lucide-react";
import logoUrl from "../../../Assets/logo-text.png";

const navItems = [
  { label: "HOME", active: true },
  { label: "ABOUT", dropdown: true },
  { label: "REPORTS", dropdown: true },
  { label: "BRANCH", dropdown: true },
  { label: "EDUCATION", dropdown: true },
  { label: "BLOG" },
];

export default function Navbar() {
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
        {navItems.map((item) => (
          <a
            className={`relative inline-flex h-full items-center gap-[7px] whitespace-nowrap text-[13px] font-medium leading-none tracking-normal max-[1200px]:text-[11px] ${
              item.active
                ? 'text-[#d58a2b] after:absolute after:inset-x-0 after:bottom-[13px] after:h-px after:bg-[#d58a2b] after:content-[""]'
                : "text-[#2c3b64]"
            }`}
            href={item.active ? "/" : `#${item.label.toLowerCase()}`}
            key={item.label}
          >
            <span>{item.label}</span>
            {item.dropdown && <ChevronDown size={12} strokeWidth={3} />}
          </a>
        ))}
      </nav>

      <div className="ml-[32px] flex items-center gap-[24px] max-[1200px]:ml-[24px] max-[1200px]:gap-[18px] max-[900px]:hidden">
        <a
          className="inline-flex h-[38px] min-w-[188px] items-center justify-center gap-2 rounded-full bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-6 text-[13px] font-medium leading-none tracking-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] max-[1200px]:h-[34px] max-[1200px]:min-w-[170px] max-[1200px]:px-[18px] max-[1200px]:text-[12px]"
          href="#verify"
        >
          <ShieldCheck size={20} strokeWidth={2.2} />
          <span>VERIFY YOUR REPORT</span>
        </a>
        <a
          className="inline-flex items-center gap-[9px] whitespace-nowrap text-[14px] font-medium text-[#2c3b64] max-[1200px]:text[12px]"
          href="#login"
        >
          <UserRound size={23} strokeWidth={2.1} />
          <span>Login</span>
        </a>
      </div>

      <button
        className="ml-auto hidden h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#2c3b64] max-[900px]:inline-flex"
        aria-label="Open menu"
        type="button"
      >
        <Menu size={24} />
      </button>
    </header>
  );
}
