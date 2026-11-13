import { productConfig } from "@/lib/config"
import type { AnswerValue, PublicQuestion } from "@/lib/types"

export type AnswerDraft = {
  optionIndexes: number[]
  text: string
  rating: number | null
}

export function emptyDraft(): AnswerDraft {
  return { optionIndexes: [], text: "", rating: null }
}

export function isAnswered(question: PublicQuestion, draft: AnswerDraft | undefined) {
  if (!draft) return false
  if (question.kind === "short") return draft.text.trim().length > 0
  if (question.kind === "rating") return draft.rating !== null
  if (question.kind === "single") return draft.optionIndexes.length === 1
  return draft.optionIndexes.length > 0
}

export function toSubmission(questions: PublicQuestion[], drafts: Record<string, AnswerDraft>) {
  return questions.map((question) => {
    const draft = drafts[question.id] ?? emptyDraft()
    if (question.kind === "short") {
      return { questionId: question.id, text: draft.text.trim() }
    }
    if (question.kind === "rating") {
      return { questionId: question.id, rating: draft.rating }
    }
    return { questionId: question.id, optionIndexes: draft.optionIndexes }
  })
}

export function displayAnswer(question: Pick<PublicQuestion, "options">, value: AnswerValue | null) {
  if (!value) return "—"
  if ("text" in value) return value.text || "—"
  if ("rating" in value) return String(value.rating)
  if ("optionIndexes" in value) {
    if (value.optionIndexes.length === 0) return "—"
    return value.optionIndexes.map((index) => question.options[index] ?? "—").join(", ")
  }
  return "—"
}

export function parseAnswerValue(value: unknown): AnswerValue | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.text === "string") return { text: record.text }
  if (typeof record.rating === "number") return { rating: record.rating }
  if (Array.isArray(record.optionIndexes)) {
    const optionIndexes = record.optionIndexes.filter((item): item is number => typeof item === "number")
    return { optionIndexes }
  }
  return null
}

export function shortAnswerWithinLimit(text: string) {
  const trimmed = text.trim()
  return trimmed.length >= 1 && trimmed.length <= productConfig.shortAnswerMax
}
