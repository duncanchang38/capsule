"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Capture" },
  { href: "/todos", label: "To-Dos" },
  { href: "/calendar", label: "Calendar" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 px-4 py-2 border-b border-zinc-200 bg-white">
      <span className="font-semibold text-zinc-900 mr-4 self-center">Capsule</span>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            pathname === href
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
