"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Sit" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/integrations", label: "Integrations" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      data-site-nav
      className="site-nav mx-auto flex w-full max-w-2xl flex-wrap gap-x-5 gap-y-2 px-6 pt-6 text-sm"
      aria-label="Stillbench"
    >
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          prefetch={link.href === "/" ? undefined : false}
          className={
            isActive(pathname, link.href)
              ? "text-moss font-medium underline-offset-4"
              : "text-ink/55 underline-offset-4 hover:text-ink hover:underline"
          }
          aria-current={isActive(pathname, link.href) ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
