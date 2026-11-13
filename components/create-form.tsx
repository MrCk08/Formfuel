"use client"

import { useRef, useState, useTransition } from "react"
import { deleteDraftAction, raiseCapAction, saveSurveyAction } from "@/lib/actions"
import { estimateMinutes, formatMinutes, type ProductRules } from "@/lib/config"
import { questionKindLabel } from "@/lib/labels"
import { blankQuestion, type DraftQuestion, validateSurveyInput } from "@/lib/survey-form"
import type { QuestionKind } from "@/lib/types"
import { btnPrimary, btnSecondary } from "@/components/ui"

const kinds: QuestionKind[] = ["single", "multiple", "short", "rating"]

export function CreateForm({
  rules,
  initial,
}: {
  rules: ProductRules
  initial?: {
    id?: string
    title: string
    description: string
    tags: string[]
    questions: DraftQuestion[]
    responseCap: number
  }
}) {
  const keyRef = useRef(initial?.questions.length ?? 1)
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [tagDraft, setTagDraft] = useState("")
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    initial?.questions?.length ? initial.questions : [blankQuestion("single", "q-1")],
  )
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [cap, setCap] = useState(initial?.responseCap ?? rules.defaultResponseCap)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmRaise, setConfirmRaise] = useState(false)
  const [pending, setPending] = useState<"draft" | "publish" | "raise" | "delete" | null>(null)
  const [, startTransition] = useTransition()
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function nextKey() {
    keyRef.current += 1
    return `q-${keyRef.current}`
  }

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((current) => current.map((question) => (question.key === key ? { ...question, ...patch } : question)))
  }

  function addQuestion(kind: QuestionKind) {
    const question = blankQuestion(kind, nextKey())
    setQuestions((current) => [...current, question])
    setOpenKey(question.key)
  }

  function removeQuestion(key: string) {
    setQuestions((current) => (current.length === 1 ? current : current.filter((question) => question.key !== key)))
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    const next = questions.slice()
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(target, 0, item)
    setQuestions(next)
  }

  function addTag() {
    const tag = tagDraft.trim()
    if (!tag) return
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTagDraft("")
      return
    }
    setTags((current) => [...current, tag])
    setTagDraft("")
  }

  function save(publish: boolean) {
    setError(null)
    setNotice(null)
    const parsed = validateSurveyInput({
      id: initial?.id,
      title,
      description,
      tags,
      publish,
      questions,
    })
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }
    setPending(publish ? "publish" : "draft")
    startTransition(async () => {
      const result = await saveSurveyAction(parsed.value)
      if (result && !result.ok) {
        setError(result.message)
        setPending(null)
      }
    })
  }

  function raise() {
    if (!initial?.id) {
      setNotice("Save a draft first, then raise the cap from here or the dashboard.")
      return
    }
    setPending("raise")
    startTransition(async () => {
      const result = await raiseCapAction(initial.id!)
      setPending(null)
      setConfirmRaise(false)
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.data) setCap(result.data.responseCap)
      setNotice(`Cap is now ${result.data?.responseCap ?? cap + rules.raiseCapStep}.`)
    })
  }

  function removeDraft() {
    if (!initial?.id) return
    setPending("delete")
    startTransition(async () => {
      const result = await deleteDraftAction(initial.id!)
      if (result && !result.ok) {
        setError(result.message)
        setPending(null)
      }
    })
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-6">
        <label className="block">
          <span className="text-sm font-semibold">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Weekend study habits of university students"
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none ring-amber focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="What should respondents know before they start?"
            className="mt-2 w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none ring-amber focus:ring-2"
          />
        </label>
        <div>
          <span className="text-sm font-semibold">Tags</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                className="rounded-full bg-amber-soft px-3 py-1 text-sm text-ink"
              >
                {tag} <span aria-hidden="true">×</span>
                <span className="sr-only">Remove {tag}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addTag()
                }
              }}
              maxLength={24}
              placeholder="Add a tag"
              className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none ring-amber focus:ring-2"
            />
            <button type="button" onClick={addTag} className="rounded-xl border border-line bg-white px-3 text-sm font-semibold">
              + Add tag
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-medium">Response cap: {cap} (included in free quota)</p>
          <p className="mt-1 text-xs text-muted">About {formatMinutes(estimateMinutes(questions.length))} to answer.</p>
          {confirmRaise ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted">
                Spend {rules.raiseCapCost} credits to add {rules.raiseCapStep} responses?
              </p>
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} onClick={raise} disabled={pending !== null}>
                  Confirm
                </button>
                <button type="button" className={btnSecondary} onClick={() => setConfirmRaise(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${btnSecondary} mt-3 w-full`}
              onClick={() => (initial?.id ? setConfirmRaise(true) : setNotice("Save a draft first, then raise the cap."))}
            >
              ↑ Raise cap with credits
            </button>
          )}
        </div>
        {initial?.id ? (
          <button type="button" onClick={removeDraft} disabled={pending !== null} className="text-sm text-muted underline">
            Delete draft
          </button>
        ) : null}
      </div>

      <div>
        <section className="rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Questions</h2>
            <p className="text-xs text-muted">Drag to reorder · Click to edit</p>
          </div>
          <ol className="space-y-3">
            {questions.map((question, index) => (
              <li
                key={question.key}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null || dragIndex === index) return
                  const next = questions.slice()
                  const [item] = next.splice(dragIndex, 1)
                  if (!item) return
                  next.splice(index, 0, item)
                  setQuestions(next)
                  setDragIndex(null)
                }}
                className="rounded-2xl border border-line bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="cursor-grab pt-0.5 text-xs font-semibold text-amber"
                    onClick={() => setOpenKey(openKey === question.key ? null : question.key)}
                  >
                    Q{index + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenKey(openKey === question.key ? null : question.key)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm">
                      <span className="font-semibold text-amber">{questionKindLabel(question.kind)}</span>{" "}
                      <span className="font-medium">{question.prompt || "Untitled question"}</span>
                    </p>
                    {question.kind === "single" || question.kind === "multiple" ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {question.options.filter(Boolean).map((option) => (
                          <span key={option} className="rounded-lg border border-line px-2 py-1 text-xs text-muted">
                            {option}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {question.kind === "rating" ? (
                      <p className="mt-2 text-xs text-muted">
                        {question.ratingMin}–{question.ratingMax}
                        {question.ratingMinLabel ? ` · ${question.ratingMinLabel}` : ""}
                        {question.ratingMaxLabel ? ` → ${question.ratingMaxLabel}` : ""}
                      </p>
                    ) : null}
                    {question.kind === "short" ? (
                      <p className="mt-2 text-xs text-muted">Students will type a short response</p>
                    ) : null}
                    {question.isScreening ? (
                      <p className="mt-3 inline-flex rounded-full border border-amber/40 bg-amber-soft px-3 py-1 text-xs font-medium text-amber-deep">
                        Screening question — wrong answer forfeits credits
                      </p>
                    ) : null}
                  </button>
                  <div className="flex flex-col gap-1">
                    <button type="button" className="text-xs text-muted" onClick={() => moveQuestion(index, -1)} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className="text-xs text-muted" onClick={() => moveQuestion(index, 1)} aria-label="Move down">
                      ↓
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted"
                      onClick={() => removeQuestion(question.key)}
                      aria-label="Delete question"
                    >
                      ···
                    </button>
                  </div>
                </div>
                {openKey === question.key ? (
                  <QuestionEditor question={question} onChange={(patch) => updateQuestion(question.key, patch)} />
                ) : null}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {kinds.map((kind) => (
              <button key={kind} type="button" onClick={() => addQuestion(kind)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                + {questionKindLabel(kind)}
              </button>
            ))}
          </div>
        </section>
        {error ? (
          <p className="mt-4 text-sm text-bad" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="mt-4 text-sm text-muted">{notice}</p> : null}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" className={btnSecondary} disabled={pending !== null} onClick={() => save(false)}>
            {pending === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button type="button" className={btnPrimary} disabled={pending !== null} onClick={() => save(true)}>
            {pending === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
        <p className="mt-3 text-right text-xs text-muted">
          Your first published survey is free. After that, publishing costs {rules.extraSurveyCost} credits.
        </p>
      </div>
    </div>
  )
}

function QuestionEditor({
  question,
  onChange,
}: {
  question: DraftQuestion
  onChange: (patch: Partial<DraftQuestion>) => void
}) {
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <label className="block text-sm">
        Prompt
        <input
          value={question.prompt}
          maxLength={280}
          onChange={(event) => onChange({ prompt: event.target.value })}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none ring-amber focus:ring-2"
        />
      </label>
      <label className="block text-sm">
        Type
        <select
          value={question.kind}
          onChange={(event) => {
            const kind = event.target.value as QuestionKind
            onChange({
              kind,
              isScreening: kind === "single" || kind === "multiple" ? question.isScreening : false,
              options: kind === "single" || kind === "multiple" ? question.options.length ? question.options : ["", ""] : [],
              correctOptionIndexes: [],
            })
          }}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2"
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {questionKindLabel(kind)}
            </option>
          ))}
        </select>
      </label>
      {question.kind === "single" || question.kind === "multiple" ? (
        <div className="space-y-2">
          {question.options.map((option, index) => (
            <div key={`${question.key}-opt-${index}`} className="flex items-center gap-2">
              <input
                value={option}
                maxLength={80}
                aria-label={`Option ${index + 1}`}
                onChange={(event) => {
                  const options = question.options.slice()
                  options[index] = event.target.value
                  onChange({ options })
                }}
                className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none ring-amber focus:ring-2"
              />
              {question.isScreening ? (
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type={question.kind === "single" ? "radio" : "checkbox"}
                    name={`correct-${question.key}`}
                    checked={question.correctOptionIndexes.includes(index)}
                    onChange={(event) => {
                      const correct = question.kind === "single"
                        ? [index]
                        : event.target.checked
                          ? [...question.correctOptionIndexes, index]
                          : question.correctOptionIndexes.filter((item) => item !== index)
                      onChange({ correctOptionIndexes: correct })
                    }}
                  />
                  Correct
                </label>
              ) : null}
              <button
                type="button"
                className="text-xs text-muted"
                onClick={() => onChange({ options: question.options.filter((_, optionIndex) => optionIndex !== index) })}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-amber-deep"
            onClick={() => onChange({ options: [...question.options, ""] })}
          >
            + Add option
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={question.isScreening}
              onChange={(event) =>
                onChange({
                  isScreening: event.target.checked,
                  correctOptionIndexes: event.target.checked ? question.correctOptionIndexes : [],
                })
              }
            />
            Screening question — a wrong answer is saved but earns no credits
          </label>
        </div>
      ) : null}
      {question.kind === "rating" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Low
            <input
              type="number"
              min={0}
              max={9}
              value={question.ratingMin}
              onChange={(event) => onChange({ ratingMin: Number(event.target.value) })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
          <label className="text-sm">
            High
            <input
              type="number"
              min={1}
              max={10}
              value={question.ratingMax}
              onChange={(event) => onChange({ ratingMax: Number(event.target.value) })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Low label
            <input
              value={question.ratingMinLabel}
              maxLength={40}
              onChange={(event) => onChange({ ratingMinLabel: event.target.value })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
          <label className="text-sm">
            High label
            <input
              value={question.ratingMaxLabel}
              maxLength={40}
              onChange={(event) => onChange({ ratingMaxLabel: event.target.value })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
