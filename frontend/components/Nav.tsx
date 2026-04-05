"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/today", label: "Today" },
  { href: "/library", label: "Library" },
  { href: "/calendar", label: "Calendar" },
];

function CapsulePill({ inverted }: { inverted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-[18px] h-[11px] rounded-full relative overflow-hidden flex-shrink-0 transition-colors duration-150 ${
        inverted ? "bg-white" : "bg-stone-900"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-1/2 w-px ${inverted ? "bg-stone-900/25" : "bg-white/25"}`}
      />
    </span>
  );
}

export function Nav() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <nav className="flex gap-1 px-4 py-2.5 border-b border-[#e8e4db] bg-white overflow-x-auto">
      <Link
        href="/"
        aria-current={isHome ? "page" : undefined}
        className={`flex items-center gap-1.5 mr-3 flex-shrink-0 px-2.5 py-1.5 rounded-lg transition-colors duration-150 ${
          isHome
            ? "bg-stone-900"
            : "hover:bg-stone-100"
        }`}
      >
        <CapsulePill inverted={isHome} />
        <span
          className={`font-semibold text-sm transition-colors duration-150 ${
            isHome ? "text-white" : "text-stone-900"
          }`}
        >
          Capsule
        </span>
      </Link>

      {links.map(({ href, label }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 flex-shrink-0 ${
              isActive
                ? "bg-stone-900 text-white"
                : "text-stone-500 hover:text-stone-900 hover:bg-stone-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
