"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

function getInitials(nameOrEmail: string): string {
  const name = nameOrEmail.split("@")[0]; // strip email domain
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

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

function ProfileMenu({ initials, label }: { initials: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  }

  return (
    <div className="ml-auto flex-shrink-0 pl-2">
      <button
        ref={btnRef}
        onClick={handleOpen}
        title={label}
        className="flex items-center justify-center w-8 h-8 rounded-[8px] bg-stone-900 text-white text-[11px] font-semibold select-none hover:opacity-80 transition-opacity"
      >
        {initials}
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="w-44 bg-white border border-[#e8e4db] rounded-xl shadow-md py-1 z-50"
        >
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
          >
            Settings
          </Link>
          <div className="h-px bg-[#e8e4db] mx-3 my-1" />
          <button
            onClick={() => { setOpen(false); signOut({ callbackUrl: "/login" }); }}
            className="w-full text-left px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const AUTH_PATHS = new Set(["/login", "/reset-password"]);

export function Nav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const { data: session } = useSession();

  if (AUTH_PATHS.has(pathname)) return null;

  return (
    <nav className="flex items-center gap-1 px-4 py-2.5 border-b border-[#e8e4db] bg-white overflow-x-auto">
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

      {session?.user && (
        <ProfileMenu
          initials={getInitials(session.user.name || session.user.email || "?")}
          label={session.user.name || session.user.email || "Profile"}
        />
      )}
    </nav>
  );
}
