import Link from "next/link"
import { requireUser } from "@/lib/auth"
import { Logo } from "@/components/icons"
import { CreditsPill, UserMenu } from "@/components/ui"
import { NavLinks } from "@/components/nav-links"

export async function Header() {
  const user = await requireUser()
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-paper/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center gap-4">
          <Link href="/browse" className="shrink-0">
            <Logo />
          </Link>
          <NavLinks className="hidden md:flex" />
          <div className="ml-auto flex items-center gap-3">
            <CreditsPill balance={user.creditBalance} />
            <UserMenu user={user} />
          </div>
        </div>
        <NavLinks className="flex pb-3 md:hidden" />
      </div>
    </header>
  )
}

export function HeaderFallback() {
  return <div className="h-16 border-b border-line/80 bg-paper" />
}
