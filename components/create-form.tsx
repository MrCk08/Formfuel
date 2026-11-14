"use client"

import { useState, useRef, useTransition } from "react"
import { deleteDraftAction, saveSurveyAction } from "@/lib/actions"
import {
  creditUnit,
  creditWord,
  defaultMinCompletionSeconds,
  estimateMinutes,
  formatMinutes,
  formatMinTime,
  maxMinCompletionSeconds,
  responseCapForCredits,
  type ProductRules,
} from "@/lib/config"
import { SearchCode } from "@/components/survey-meta"
import { questionKindLabel } from "@/lib/labels"
import { blankQuestion, type DraftQuestion, validateSurveyInput } from "@/lib/survey-form"
import type { FormatType, QuestionKind, QuestionValidation } from "@/lib/types"
import { formatTypes } from "@/lib/types"
import { formatTypeLabel, validationForKind, validationSummary } from "@/lib/validation"
import { btnPrimary, btnSecondary } from "@/components/ui"

const kinds: QuestionKind[] = ["single", "multiple", "short", "rating"]

export function CreateForm({
  rules,
  balance,
  initial,
}: {
  rules: ProductRules
  balance: number
  initial?: {
    id?: string
    title: string
    description: string
    tags: string[]
    searchCode?: string
    minCompletionSeconds?: number
    questions: DraftQuestion[]
  }
}) {
  const startingQuestions = initial?.questions?.length ? initial.questions : [blankQuestion("single", "q-1")]
  const keyRef = useRef(startingQuestions.length)
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [tagDraft, setTagDraft] = useState("")
  const [questions, setQuestions] = useState<DraftQuestion[]>(startingQuestions)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [minTouched, setMinTouched] = useState(initial?.minCompletionSeconds != null)
  const [minSeconds, setMinSeconds] = useState(
    initial?.minCompletionSeconds ??
      defaultMinCompletionSeconds(startingQuestions.length, rules.defaultMinCompletionSeconds, rules.minSecondsPerQuestion),
  )
  const [creditsToAllocate, setCreditsToAllocate] = useState(rules.startingCredits)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<"draft" | "publish" | "delete" | null>(null)
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

  const questionCount = questions.length
  const maxMinSeconds = maxMinCompletionSeconds(questionCount, rules.minSecondsPerQuestion)
  const autoMinSeconds = defaultMinCompletionSeconds(
    questionCount,
    rules.defaultMinCompletionSeconds,
    rules.minSecondsPerQuestion,
  )
  const shownMinSeconds = minTouched ? Math.min(Math.max(0, minSeconds), maxMinSeconds) : autoMinSeconds
  const unit = creditUnit(questionCount, rules.questionsPerCredit)
  const fundedSlots = responseCapForCredits(creditsToAllocate, questionCount, rules.questionsPerCredit)
  const leftover = Math.max(0, creditsToAllocate - fundedSlots * unit)

  function save(publish: boolean) {
    setError(null)
    setNotice(null)
    if (publish && creditsToAllocate > balance) {
      setError(`You have ${balance} ${creditWord(balance)}. Allocate fewer, or answer surveys to earn more.`)
      return
    }
    const parsed = validateSurveyInput(
      {
        id: initial?.id,
        title,
        description,
        tags,
        publish,
        minCompletionSeconds: shownMinSeconds,
        creditsToAllocate,
        questions,
      },
      rules,
    )
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
          {initial?.searchCode ? (
            <div className="mb-3">
              <p className="text-sm font-medium">Search code</p>
              <div className="mt-2">
                <SearchCode code={initial.searchCode} />
              </div>
              <p className="mt-2 text-xs text-muted">People can type this code on Browse to find the survey.</p>
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted">A search code is assigned when you save.</p>
          )}
          <label className="block text-sm font-medium">
            Credits to allocate
            <input
              type="number"
              min={0}
              step={1}
              value={creditsToAllocate}
              onChange={(event) => setCreditsToAllocate(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
              className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-amber focus:ring-2"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-muted">
            1 credit covers {rules.questionsPerCredit} questions. This survey has {questionCount}{" "}
            {questionCount === 1 ? "question" : "questions"}, so each response costs {unit} {creditWord(unit)}.{" "}
            {creditsToAllocate} {creditWord(creditsToAllocate)} fund {fundedSlots}{" "}
            {fundedSlots === 1 ? "response" : "responses"}. A valid answer earns {unit} {creditWord(unit)}.
          </p>
          {leftover > 0 ? (
            <p className="mt-1 text-xs text-muted">
              {leftover} {creditWord(leftover)} {leftover === 1 ? "does" : "do"} not complete another response.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted">You have {balance} {creditWord(balance)}.</p>
          <label className="mt-3 block text-sm font-medium">
            Minimum completion time (seconds)
            <input
              type="number"
              min={0}
              max={maxMinSeconds}
              step={1}
              value={shownMinSeconds}
              onChange={(event) => {
                setMinTouched(true)
                const next = Math.floor(Number(event.target.value) || 0)
                setMinSeconds(Math.min(Math.max(0, next), maxMinSeconds))
              }}
              className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-amber focus:ring-2"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-muted">
            Maximum is {maxMinSeconds} seconds ({rules.minSecondsPerQuestion} seconds per question). Default is{" "}
            {formatMinTime(rules.defaultMinCompletionSeconds)}, or the maximum when the survey is shorter. About{" "}
            {formatMinutes(estimateMinutes(questionCount))} to answer.
          </p>
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
          <p className="mb-4 text-xs leading-5 text-muted">
            A random quality check is added automatically when someone answers. It is not one of your questions and does not
            change the credit cost or the time limit.
          </p>
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
                    {validationSummary(question.kind, question.validation) ? (
                      <p className="mt-3 inline-flex rounded-full border border-amber/40 bg-amber-soft px-3 py-1 text-xs font-medium text-amber-deep">
                        Data validation · {validationSummary(question.kind, question.validation)}
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
          Publishing spends the credits you allocate. Drafts are free. Promotion is separate ({rules.promoteCost} credits for{" "}
          {rules.promoteDays} days).
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
            const screening = kind === "single" || kind === "multiple" ? question.isScreening : false
            onChange({
              kind,
              isScreening: screening,
              options: kind === "single" || kind === "multiple" ? (question.options.length ? question.options : ["", ""]) : [],
              correctOptionIndexes: [],
              validation: validationForKind(kind, screening ? markRequired(question.validation) : question.validation),
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
                  validation: event.target.checked ? validationForKind(question.kind, markRequired(question.validation)) : question.validation,
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
      <ValidationRules question={question} onChange={onChange} />
    </div>
  )
}

function ValidationRules({
  question,
  onChange,
}: {
  question: DraftQuestion
  onChange: (patch: Partial<DraftQuestion>) => void
}) {
  const active = validationSummary(question.kind, question.validation)
  const [open, setOpen] = useState(Boolean(active))
  const rules = question.validation
  const required = question.isScreening || rules?.required !== false
  const formatType = rules?.formatType ?? "none"
  const numeric = formatType === "integer" || formatType === "decimal"

  function update(patch: Partial<QuestionValidation>) {
    const next: QuestionValidation = { ...rules, required: rules?.required !== false, ...patch }
    if (next.formatType !== "custom_regex") delete next.customRegex
    if (next.formatType !== "integer" && next.formatType !== "decimal") {
      if (question.kind === "short") {
        delete next.minValue
        delete next.maxValue
      }
    }
    if (next.formatType === "none") delete next.formatType
    onChange({ validation: validationForKind(question.kind, next) })
  }

  return (
    <div className="rounded-2xl border border-amber/30 bg-amber-soft/70 p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-semibold text-amber-deep"
      >
        {open ? "– Data Validation Rules" : "+ Data Validation Rules"}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              disabled={question.isScreening}
              onChange={(event) => update({ required: event.target.checked })}
            />
            Presence Check (Required)
          </label>
          <p className="text-xs leading-5 text-muted">
            {question.isScreening
              ? "Screening questions stay required."
              : "Turn this off to allow a blank answer. Other checks still apply once the question is filled in."}
          </p>
          {question.kind === "short" ? (
            <>
              <div>
                <p className="text-sm font-medium">Length Check</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Minimum characters"
                    min={1}
                    max={500}
                    value={rules?.minLength}
                    onValue={(minLength) => update({ minLength })}
                  />
                  <NumberField
                    label="Maximum characters"
                    min={1}
                    max={500}
                    value={rules?.maxLength}
                    onValue={(maxLength) => update({ maxLength })}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">Leave blank to keep the 1–500 character limit.</p>
              </div>
              <label className="block text-sm">
                Format / Type Check
                <select
                  value={formatType}
                  onChange={(event) => update({ formatType: event.target.value as FormatType })}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2"
                >
                  {formatTypes.map((format) => (
                    <option key={format} value={format}>
                      {formatTypeLabel(format)}
                    </option>
                  ))}
                </select>
              </label>
              {formatType === "custom_regex" ? (
                <label className="block text-sm">
                  Custom regular expression
                  <input
                    value={rules?.customRegex ?? ""}
                    maxLength={120}
                    placeholder="^[A-Z]{2}[0-9]{4}$"
                    onChange={(event) => update({ customRegex: event.target.value, formatType: "custom_regex" })}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm outline-none ring-amber focus:ring-2"
                  />
                </label>
              ) : null}
              {numeric ? (
                <div>
                  <p className="text-sm font-medium">Range Check</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <NumberField label="Minimum value" value={rules?.minValue} onValue={(minValue) => update({ minValue })} />
                    <NumberField label="Maximum value" value={rules?.maxValue} onValue={(maxValue) => update({ maxValue })} />
                  </div>
                  <p className="mt-2 text-xs text-muted">For example, age 12–25. Leave either box blank if it has no limit.</p>
                </div>
              ) : null}
            </>
          ) : null}
          {question.kind === "multiple" ? (
            <div>
              <p className="text-sm font-medium">Selection Range Check</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Minimum selections"
                  min={0}
                  max={question.options.length}
                  value={rules?.minValue}
                  onValue={(minValue) => update({ minValue })}
                />
                <NumberField
                  label="Maximum selections"
                  min={0}
                  max={question.options.length}
                  value={rules?.maxValue}
                  onValue={(maxValue) => update({ maxValue })}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                Leave blank for the usual rule: at least 1 when the question is required, and no extra maximum.
              </p>
            </div>
          ) : null}
          <label className="block text-sm">
            Custom error message
            <input
              value={rules?.errorMessage ?? ""}
              maxLength={160}
              placeholder="Shown when a check fails. Optional."
              onChange={(event) => update({ errorMessage: event.target.value })}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none ring-amber focus:ring-2"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function NumberField({
  label,
  value,
  onValue,
  min,
  max,
}: {
  label: string
  value: number | undefined
  onValue: (value: number | undefined) => void
  min?: number
  max?: number
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === "") {
            onValue(undefined)
            return
          }
          const next = Number(raw)
          onValue(Number.isFinite(next) ? next : undefined)
        }}
        className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none ring-amber focus:ring-2"
      />
    </label>
  )
}

function markRequired(validation: QuestionValidation | undefined): QuestionValidation | undefined {
  if (!validation) return undefined
  return { ...validation, required: true }
}
