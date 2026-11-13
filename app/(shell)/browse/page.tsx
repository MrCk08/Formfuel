import { Suspense } from "react"
import Link from "next/link"
import { requireUser } from "@/lib/auth"
import { listBrowse } from "@/lib/data"
import { SurveyCard } from "@/components/survey-card"
import { DataError, EmptyState, btnPrimary } from "@/components/ui"

export const metadata = { title: "Browse" }

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-white" />}>
      <BrowseContent />
    </Suspense>
  )
}

async function BrowseContent() {
  const user = await requireUser()
  const result = await listBrowse(user)
  if (!result.ok) return <DataError message={result.message} />
  const { promoted, rest } = result.data
  const empty = promoted.length === 0 && rest.length === 0

  return (
    <div className="space-y-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="pt-2">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Find a survey. Earn credits.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-muted">
            Answer questionnaires from other students, then use credits to get more responses or promote your own.
          </p>
        </div>
        {promoted.length > 0 ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Promoted</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {promoted.map((survey) => (
                <SurveyCard key={survey.id} survey={survey} featured />
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-line bg-cream p-6 text-sm text-muted">
            Promoted surveys show up here. Featuring one costs credits and lasts a week.
          </section>
        )}
      </div>
      <section>
        <h2 className="border-b border-line pb-3 text-sm font-semibold">Browse all surveys</h2>
        {empty ? (
          <div className="mt-4">
            <EmptyState
              title="No open surveys yet"
              body="Publish the first questionnaire and other students can start answering it."
              action={
                <Link href="/create" className={btnPrimary}>
                  Create a survey
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {rest.map((survey) => (
              <SurveyCard key={survey.id} survey={survey} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
