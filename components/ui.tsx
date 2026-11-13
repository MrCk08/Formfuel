import type { ReactNode } from "react"
import { Flame } from "@/components/icons"
import type { AppUser } from "@/lib/types"
import { isSupabaseConfigured } from "@/lib/supabase/env"

export const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-deep disabled:cursor-not-allowed disabled:opacity-50"
export const btnSecondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-sm font-semibold text-ink transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
export const btnWide = "w-full"

export function PreviewBanner() {
  if (isSupabaseConfigured()) return null
  return (
    <p className="border-b border-amber-soft bg-amber-soft px-4 py-2 text-center text-sm text-ink">
      Preview mode. Add your Supabase URL and anon key to sign in with Google and store surveys.
    </p>
  )
}

export function UserMenu({ user }: { user: AppUser }) {
  return (
    <details className="relative">
      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full bg-[#ece7df] text-xs font-semibold text-ink ring-1 ring-line">
        {user.avatarUrl ? (
          // Google avatars are not always on an allowlisted image host.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          user.initials
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-line bg-white p-3 shadow-lg">
        <p className="truncate text-sm font-semibold">{user.displayName}</p>
        {user.email ? <p className="truncate text-xs text-muted">{user.email}</p> : null}
        {user.preview ? (
          <p className="mt-2 text-xs text-muted">Preview profile. Credits on screen are sample data.</p>
        ) : (
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="text-sm font-medium text-muted hover:text-ink" type="submit">
              Sign out
            </button>
          </form>
        )}
      </div>
    </details>
  )
}

export function CreditsPill({ balance }: { balance: number }) {
  return (
    <a
      href="/credits"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-deep"
    >
      <Flame className="h-4 w-4" />
      Credits {balance}
    </a>
  )
}

export function DataError({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-8">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">{message}</p>
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
