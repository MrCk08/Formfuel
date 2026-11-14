"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { startResponseAction, submitResponseAction, type ResponseState } from "@/lib/actions"
import { emptyDraft, toSubmission, type AnswerDraft } from "@/lib/answers"
import { answerIssue } from "@/lib/validation"
import { creditWord, formatCountdown, formatMinTime } from "@/lib/config"
import { invalidReasonLabel } from "@/lib/labels"
import type { PublicQuestion } from "@/lib/types"
import { ClockIcon } from "@/components/icons"
import { btnPrimary, btnSecondary } from "@/components/ui"

export function AnswerFlow({
  surveyId,
  title,
  questions,
  minCompletionSeconds,
  reward,
  existing,
  startAt = 0,
  initialDrafts = {},
}: {
  surveyId: string
  title: string
  questions: PublicQuestion[]
  minCompletionSeconds: number
  reward: number
  existing: ResponseState | null
  startAt?: number
  initialDrafts?: Record<string, AnswerDraft>
}) {
  const [phase, setPhase] = useState<ResponseState | null>(existing)
  const [ready, setReady] = useState(Boolean(existing))
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(Math.min(startAt, Math.max(questions.length - 1, 0)))
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>(initialDrafts)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [now, setNow] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (existing) return
    let ignore = false
    startTransition(async () => {
      const result = await startResponseAction(surveyId)
      if (ignore) return
      if (!result.ok) {
        setError(result.message)
        setReady(true)
        return
      }
      setPhase(result.data ?? null)
      setReady(true)
    })
    return () => {
      ignore = true
    }
  }, [existing, surveyId])

  useEffect(() => {
    if (!phase || phase.state !== "in_progress") return
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  if (!ready) {
    return <p className="text-center text-sm text-muted">Opening the survey…</p>
  }

  if (error && !phase) {
    return <ResultCard title={title} body={error} href="/browse" hrefLabel="Back to browse" />
  }

  if (phase && phase.state === "submitted") {
    const valid = phase.status === "valid"
    return (
      <ResultCard
        title={valid ? "Response counted" : "Response saved"}
        body={
          valid
            ? `You earned ${phase.creditsAwarded} credits.`
            : `${invalidReasonLabel(phase.invalidReason)}. This response is saved and does not award credits.`
        }
        href="/browse"
        hrefLabel="Browse more surveys"
      />
    )
  }

  const question = questions[index]
  if (!question || !phase) {
    return <ResultCard title={title} body={error || "This survey has no questions."} href="/browse" hrefLabel="Back to browse" />
  }

  const draft = drafts[question.id] ?? emptyDraft()
  const issue = answerIssue(question, draft)
  const showIssue = Boolean(issue) && Boolean(question.validation) && Boolean(touched[question.id])
  const elapsed =
    now === null || !phase.startedAt ? 0 : Math.max(0, Math.floor((now - new Date(phase.startedAt).getTime()) / 1000))
  const remaining = Math.max(0, minCompletionSeconds - elapsed)
  const progress = ((index + 1) / questions.length) * 100

  function reveal(questionId: string) {
    setTouched((current) => ({ ...current, [questionId]: true }))
  }

  function setDraft(next: AnswerDraft) {
    reveal(question.id)
    setDrafts((current) => ({ ...current, [question.id]: next }))
  }

  function submit() {
    const missing = questions.findIndex((item) => answerIssue(item, drafts[item.id] ?? emptyDraft()))
    if (missing >= 0) {
      const item = questions[missing]
      if (item) reveal(item.id)
      setIndex(missing)
      setError(item?.validation ? null : "Please answer every question.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitResponseAction(surveyId, toSubmission(questions, drafts))
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.data) setPhase(result.data)
    })
  }

  return (
    <article className="mx-auto w-full max-w-2xl rounded-[28px] border border-line bg-white px-5 py-7 shadow-sm sm:px-8">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      <div className="mt-4 flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#efe8dc]" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={questions.length}>
          <div className="h-full rounded-full bg-amber" style={{ width: `${progress}%` }} />
        </div>
        <p className="shrink-0 text-sm text-muted">
          Question {index + 1} of {questions.length}
        </p>
      </div>
      <div
        className={`mt-4 rounded-2xl px-4 py-3 ${remaining > 0 ? "bg-amber-soft" : "bg-ok-soft"}`}
        role="timer"
        aria-label={remaining > 0 ? `${formatCountdown(remaining)} remaining before the minimum time` : "Minimum time met"}
      >
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <ClockIcon className="h-4 w-4" />
          {remaining > 0 ? "Time left before the minimum" : "Minimum time met"}
        </p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-ink">{formatCountdown(remaining)}</p>
        <p className="mt-1 text-sm text-muted">
          {remaining > 0
            ? `Wait ${formatCountdown(remaining)} more. You can still submit early. That response is saved, uses a response slot, and earns 0 credits.`
            : `You have waited at least ${formatMinTime(minCompletionSeconds)}. A valid response earns ${reward} ${creditWord(reward)}.`}
        </p>
      </div>
      <h2 className="mt-6 text-lg font-semibold">{question.prompt}</h2>
      <div className="mt-4" onBlur={() => reveal(question.id)}>
        <QuestionField question={question} draft={draft} invalid={showIssue} onChange={setDraft} />
      </div>
      {showIssue && issue ? (
        <p
          id={`${question.id}-error`}
          className="mt-3 inline-flex rounded-full border border-bad/30 bg-bad-soft px-3 py-1 text-xs font-medium text-bad"
          role="alert"
        >
          {issue.message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-3">
        <button type="button" className={btnSecondary} onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
          Back
        </button>
        {index < questions.length - 1 ? (
          <button
            type="button"
            className={btnPrimary}
            disabled={Boolean(issue)}
            onClick={() => {
              if (issue) {
                reveal(question.id)
                setError(question.validation ? null : "Please answer every question.")
                return
              }
              setError(null)
              setIndex((value) => value + 1)
            }}
          >
            Next
          </button>
        ) : (
          <button type="button" className={btnPrimary} disabled={pending || Boolean(issue)} onClick={submit}>
            {pending ? "Submitting…" : "Submit"}
          </button>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        A valid response earns {reward} {creditWord(reward)}. Submit stays available if you finish early. A question
        that fails its checks has to be fixed before it can be submitted.
      </p>
    </article>
  )
}

function QuestionField({
  question,
  draft,
  invalid,
  onChange,
}: {
  question: PublicQuestion
  draft: AnswerDraft
  invalid: boolean
  onChange: (draft: AnswerDraft) => void
}) {
  if (question.kind === "short") {
    const minLength = question.validation?.minLength
    const maxLength = question.validation?.maxLength
    return (
      <div>
        <textarea
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
          rows={4}
          maxLength={500}
          placeholder="Write a short response"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${question.id}-error` : undefined}
          className="w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none ring-amber focus:ring-2"
        />
        {question.validation && (minLength != null || maxLength != null) ? (
          <p className="mt-2 text-xs text-muted">
            {draft.text.trim().length}
            {maxLength != null ? ` / ${maxLength}` : ""} characters
            {minLength != null ? ` · at least ${minLength}` : ""}
          </p>
        ) : null}
      </div>
    )
  }

  if (question.kind === "rating") {
    const min = question.ratingMin ?? 1
    const max = question.ratingMax ?? 5
    const values: number[] = []
    for (let value = min; value <= max; value += 1) values.push(value)
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {values.map((value) => {
            const selected = draft.rating === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ ...draft, rating: value })}
                className={`h-11 w-11 rounded-xl border text-sm font-semibold ${selected ? "border-amber bg-cream text-ink" : "border-line bg-white"}`}
              >
                {value}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          {min} = {question.ratingMinLabel || "Low"}, {max} = {question.ratingMaxLabel || "High"}
        </p>
      </div>
    )
  }

  const multiple = question.kind === "multiple"
  return (
    <div className="space-y-3">
      {question.options.map((option, optionIndex) => {
        const selected = draft.optionIndexes.includes(optionIndex)
        return (
          <label
            key={option}
            className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${selected ? "border-amber bg-cream" : "border-line bg-white"}`}
          >
            <span>{option}</span>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={question.id}
              checked={selected}
              onChange={() => {
                const optionIndexes = multiple
                  ? selected
                    ? draft.optionIndexes.filter((index) => index !== optionIndex)
                    : [...draft.optionIndexes, optionIndex]
                  : [optionIndex]
                onChange({ ...draft, optionIndexes })
              }}
              className="h-4 w-4 accent-amber"
            />
          </label>
        )
      })}
    </div>
  )
}

function ResultCard({
  title,
  body,
  href,
  hrefLabel,
}: {
  title: string
  body: string
  href: string
  hrefLabel: string
}) {
  return (
    <article className="mx-auto w-full max-w-2xl rounded-[28px] border border-line bg-white px-6 py-10 text-center shadow-sm">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">{body}</p>
      <Link href={href} className={`${btnPrimary} mt-6`}>
        {hrefLabel}
      </Link>
    </article>
  )
}
