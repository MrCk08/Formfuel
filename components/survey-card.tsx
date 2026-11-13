"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { BookmarkIcon } from "@/components/icons"
import { btnPrimary } from "@/components/ui"
import { formatMinutes } from "@/lib/config"
import { toggleBookmarkAction } from "@/lib/actions"
import type { SurveyCardData } from "@/lib/types"

export function SurveyCard({ survey, featured = false }: { survey: SurveyCardData; featured?: boolean }) {
  return (
    <article
      className={`flex h-full flex-col rounded-3xl border border-line p-5 ${featured ? "bg-cream" : "bg-white shadow-sm"}`}
    >
      {featured ? (
        <span className="mb-3 inline-flex w-fit rounded-full bg-amber-soft px-2.5 py-1 text-xs font-semibold text-amber-deep">
          Promoted
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <h3 className="flex-1 text-base font-semibold leading-snug">{survey.title}</h3>
        {featured ? null : <BookmarkButton surveyId={survey.id} initial={survey.bookmarked} />}
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{survey.description}</p>
      {featured ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          {survey.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-chip px-2.5 py-1 text-xs text-muted">
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-muted">
        {formatMinutes(survey.estimatedMinutes)}
        <span className="px-1.5">·</span>
        <span className="font-semibold text-amber-deep">+{survey.reward} credits</span>
      </p>
      {featured ? null : (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-chip">
            <div
              className="h-full rounded-full bg-amber"
              style={{ width: `${Math.min(100, (survey.responseCount / Math.max(survey.responseCap, 1)) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {survey.responseCount} / {survey.responseCap} responses
          </p>
        </>
      )}
      <div className={featured ? "mt-5" : "mt-4"}>
        <CardAction survey={survey} />
      </div>
    </article>
  )
}

function CardAction({ survey }: { survey: SurveyCardData }) {
  if (survey.isOwner) {
    return (
      <Link href={`/surveys/${survey.id}/dashboard`} className={btnPrimary}>
        Your survey
      </Link>
    )
  }
  if (survey.answered) {
    return (
      <span className="inline-flex h-11 items-center text-sm font-semibold text-muted">Answered</span>
    )
  }
  if (survey.responseCount >= survey.responseCap) {
    return <span className="inline-flex h-11 items-center text-sm font-semibold text-muted">Full</span>
  }
  return (
    <Link href={`/surveys/${survey.id}`} className={btnPrimary}>
      Answer
    </Link>
  )
}

function BookmarkButton({ surveyId, initial }: { surveyId: string; initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    startTransition(async () => {
      const result = await toggleBookmarkAction(surveyId, next)
      if (!result.ok) setOn(!next)
    })
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove bookmark" : "Bookmark survey"}
      disabled={pending}
      onClick={toggle}
      className={`rounded-lg p-1 ${on ? "text-amber-deep" : "text-muted hover:text-ink"}`}
    >
      <BookmarkIcon filled={on} className="h-5 w-5" />
    </button>
  )
}
