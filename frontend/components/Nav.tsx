"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Capture" },
  { href: "/todos", label: "To-Dos" },
  { href: "/ideas", label: "Ideas" },
  { href: "/reading", label: "Reading" },
  { href: "/calendar", label: "Calendar" },
  { href: "/timeline", label: "Timeline" },
  { href: "/organize", label: "Organize" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 px-4 py-2 border-b border-zinc-200 bg-white overflow-x-auto">
      <span className="font-semibold text-zinc-900 mr-4 self-center flex-shrink-0">Capsule</span>
      {links.map(({ href, label }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
              isActive
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
