import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Logo } from "@/components/icons"
import { SignInButton } from "@/components/sign-in-button"
import { PreviewBanner } from "@/components/ui"
import { getCurrentUser } from "@/lib/auth"
import { formatMinTime, productConfig } from "@/lib/config"
import { isSupabaseConfigured } from "@/lib/supabase/env"

export default function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <>
      <PreviewBanner />
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Suspense fallback={<Landing error={null} />}>
        <LandingFromSearch searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function RedirectIfSignedIn() {
  if (!isSupabaseConfigured()) return null
  const user = await getCurrentUser()
  if (user) redirect("/browse")
  return null
}

async function LandingFromSearch({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  return <Landing error={params.error ?? null} />
}

function Landing({ error }: { error: string | null }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/browse" className="text-sm font-semibold text-muted">
          Browse
        </Link>
      </header>
      <section className="grid items-center gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-deep">Student survey exchange</p>
          <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Find a survey. Earn credits.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
            A data-driven survey exchange where students post questionnaires and earn rewards by answering others’.
          </p>
          <div className="mt-8">
            <SignInButton />
          </div>
          {error ? (
            <p className="mt-4 max-w-md text-sm text-bad" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="rounded-[28px] border border-line bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-muted">How credits move</p>
          <dl className="mt-4 space-y-3 text-sm">
            <Rule label="Free response cap" value={`${productConfig.defaultResponseCap} responses`} />
            <Rule label="Valid completion" value={`+${productConfig.rewardPerValidCompletion} credits`} />
            <Rule label="Raise cap by 10" value={`${productConfig.raiseCapCost} credits`} />
            <Rule label="Promote a survey" value={`${productConfig.promoteCost} credits for ${productConfig.promoteDays} days`} />
            <Rule label="Free surveys" value={`${productConfig.freeCreateQuota}, then ${productConfig.extraSurveyCost} credits`} />
            <Rule label="Minimum time" value={formatMinTime(productConfig.minCompletionSeconds)} />
          </dl>
        </div>
      </section>
      <section className="grid gap-4 pb-16 md:grid-cols-3">
        <Step n="1" title="Post a survey" body="Write the questions on Formfuel. Single choice, multiple choice, short answer, or a rating scale." />
        <Step n="2" title="Answer others" body="Any signed-in student can answer any open survey except their own. One response each." />
        <Step n="3" title="Spend credits" body="Valid answers earn credits. Use them to raise a response cap or promote your survey." />
      </section>
      <footer className="mt-auto border-t border-line py-6 text-sm text-muted">Built for BUHack 2.0</footer>
    </main>
  )
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/80 pb-3 last:border-0">
      <dt>{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article className="rounded-3xl border border-line bg-white p-5">
      <p className="text-sm font-semibold text-amber-deep">0{n}</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </article>
  )
}
