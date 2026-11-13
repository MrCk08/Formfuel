import { Suspense } from "react"
import Link from "next/link"
import { requireUser } from "@/lib/auth"
import { listOwned } from "@/lib/data"
import { statusLabel } from "@/lib/labels"
import { DataError, EmptyState, btnPrimary, btnSecondary } from "@/components/ui"

export const metadata = { title: "My surveys" }

export default function MySurveysPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-white" />}>
      <MySurveysContent />
    </Suspense>
  )
}

async function MySurveysContent() {
  const user = await requireUser()
  const result = await listOwned(user)
  if (!result.ok) return <DataError message={result.message} />

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">My surveys</h1>
          <p className="mt-2 text-sm text-muted">
            {user.freeCreatesRemaining > 0
              ? `You can still publish ${user.freeCreatesRemaining} free ${user.freeCreatesRemaining === 1 ? "survey" : "surveys"}.`
              : "Publishing another survey spends credits."}
          </p>
        </div>
        <Link href="/create" className={btnPrimary}>
          Create
        </Link>
      </div>
      {result.data.length === 0 ? (
        <EmptyState title="No surveys yet" body="Drafts and published surveys will show up here." />
      ) : (
        <div className="grid gap-4">
          {result.data.map((survey) => (
            <article key={survey.id} className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{survey.title}</h2>
                  <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-semibold text-muted">{statusLabel(survey.status)}</span>
                  {survey.isPromoted ? <span className="text-xs font-semibold text-amber-deep">Promoted</span> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{survey.description}</p>
                <p className="mt-2 text-sm text-muted">
                  {survey.responseCount} / {survey.responseCap} responses
                </p>
              </div>
              <div className="flex gap-2">
                {survey.status === "draft" ? (
                  <Link href={`/create/${survey.id}`} className={btnSecondary}>
                    Edit
                  </Link>
                ) : (
                  <Link href={`/surveys/${survey.id}/dashboard`} className={btnPrimary}>
                    Dashboard
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
