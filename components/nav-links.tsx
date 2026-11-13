"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { href: "/browse", label: "Browse" },
  { href: "/create", label: "Create" },
  { href: "/my-surveys", label: "My surveys" },
]

function active(pathname: string, href: string) {
  if (href === "/my-surveys") return pathname.startsWith("/my-surveys") || pathname.endsWith("/dashboard")
  if (href === "/create") return pathname === "/create" || pathname.startsWith("/create/")
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function NavLinks({ className = "" }: { className?: string }) {
  const pathname = usePathname()
  return (
    <nav className={`flex items-center gap-5 text-sm ${className}`}>
      {links.map((link) => {
        const current = active(pathname, link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={`relative whitespace-nowrap py-1 ${current ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}
          >
            {link.label}
            {current ? <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-amber" /> : null}
          </Link>
        )
      })}
    </nav>
  )
}
