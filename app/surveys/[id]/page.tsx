import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { getAnswerPage, getRules } from "@/lib/data"
import { AnswerFlow } from "@/components/answer-flow"
import { SurveyMeta } from "@/components/survey-meta"
import { creditUnit } from "@/lib/config"
import { Logo } from "@/components/icons"
import { CreditsPill, DataError, PreviewBanner, UserMenu, btnPrimary } from "@/components/ui"
import type { ResponseState } from "@/lib/actions"
import { emptyDraft } from "@/lib/answers"

export const metadata = { title: "Answer survey" }

export default function AnswerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PreviewBanner />
      <Suspense fallback={<div className="h-16 border-b border-line bg-paper" />}>
        <AnswerHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <Suspense fallback={<p className="text-center text-sm text-muted">Loading survey…</p>}>
          <AnswerContent params={params} />
        </Suspense>
      </main>
    </>
  )
}

async function AnswerHeader() {
  const user = await requireUser()
  return (
    <header className="border-b border-transparent">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        <Link href="/browse">
          <Logo dotted />
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <CreditsPill balance={user.creditBalance} />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  )
}

async function AnswerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const rules = await getRules(user)
  const result = await getAnswerPage(user, id)
  if (!result.ok) return <DataError message={result.message} />
  if (!result.data) notFound()
  const survey = result.data

  if (survey.isOwner) {
    return (
      <div className="space-y-4">
        <SurveyMeta searchCode={survey.searchCode} tags={survey.tags} />
        <Notice
          title="You can’t answer your own survey"
          body="Owners can read results, download a CSV, promote the survey, or add credits to fund more responses."
          href={`/surveys/${survey.id}/dashboard`}
          hrefLabel="Open dashboard"
        />
      </div>
    )
  }

  if (survey.status !== "open" && survey.existing?.status !== "in_progress" && survey.existing?.status !== "valid" && survey.existing?.status !== "invalid") {
    return (
      <div className="space-y-4">
        <SurveyMeta searchCode={survey.searchCode} tags={survey.tags} />
        <Notice title="This survey is closed" body="It is not accepting responses." href="/browse" hrefLabel="Back to browse" />
      </div>
    )
  }

  const submitted = survey.existing && survey.existing.status !== "in_progress"
  if (!submitted && survey.responseCount >= survey.responseCap && survey.existing?.status !== "in_progress") {
    return (
      <div className="space-y-4">
        <SurveyMeta searchCode={survey.searchCode} tags={survey.tags} />
        <Notice
          title="This survey is full"
          body="The owner can add credits to fund more responses."
          href="/browse"
          hrefLabel="Back to browse"
        />
      </div>
    )
  }

  const existing: ResponseState | null = survey.existing
    ? {
        state: survey.existing.status === "in_progress" ? "in_progress" : "submitted",
        startedAt: survey.existing.startedAt ?? "",
        status: survey.existing.status,
        invalidReason: survey.existing.invalidReason,
        creditsAwarded: survey.existing.creditsAwarded,
      }
    : null

  return (
    <div className="space-y-4">
      <SurveyMeta searchCode={survey.searchCode} tags={survey.tags} />
      <AnswerFlow
        surveyId={survey.id}
        title={survey.title}
        questions={survey.questions}
        minCompletionSeconds={survey.minCompletionSeconds}
        reward={creditUnit(survey.questions.length, rules.questionsPerCredit)}
        existing={existing}
        startAt={user.preview && survey.id === "preview-study" ? 2 : 0}
        initialDrafts={
          user.preview && survey.id === "preview-study"
            ? { "study-q3": { ...emptyDraft(), optionIndexes: [1] } }
            : undefined
        }
      />
    </div>
  )
}

function Notice({ title, body, href, hrefLabel }: { title: string; body: string; href: string; hrefLabel: string }) {
  return (
    <article className="mx-auto max-w-xl rounded-[28px] border border-line bg-white px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
      <Link href={href} className={`${btnPrimary} mt-6`}>
        {hrefLabel}
      </Link>
    </article>
  )
}
