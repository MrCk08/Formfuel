import { defaultRules } from "@/lib/config"
import { getPreviewSurvey, type PreviewQuestion } from "@/lib/preview"
import type { InvalidReason } from "@/lib/types"

type Submission = {
  questionId?: string
  optionIndexes?: number[]
  text?: string
  rating?: number | null
}

export function scorePreview(surveyId: string, answers: unknown, elapsedSeconds: number) {
  const survey = getPreviewSurvey(surveyId)
  if (!survey) return { ok: false as const, message: "Survey not found" }
  if (!Array.isArray(answers)) return { ok: false as const, message: "Answers are missing" }

  const byId = new Map<string, Submission>()
  for (const answer of answers) {
    if (!answer || typeof answer !== "object") return { ok: false as const, message: "Answers are missing" }
    const row = answer as Submission
    if (!row.questionId || byId.has(row.questionId)) {
      return { ok: false as const, message: "Please answer every question once" }
    }
    byId.set(row.questionId, row)
  }

  let failed = false
  for (const question of survey.questions) {
    const answer = byId.get(question.id)
    if (!answer) return { ok: false as const, message: "Please answer every question" }
    const problem = checkQuestion(question, answer)
    if (problem === "invalid") return { ok: false as const, message: "Please complete every question" }
    if (problem === "screen") failed = true
  }

  const tooFast = elapsedSeconds < defaultRules.minCompletionSeconds
  let status: "valid" | "invalid" = "valid"
  let invalidReason: InvalidReason | null = null
  if (tooFast && failed) {
    status = "invalid"
    invalidReason = "too_fast_and_failed_screening"
  } else if (tooFast) {
    status = "invalid"
    invalidReason = "too_fast"
  } else if (failed) {
    status = "invalid"
    invalidReason = "failed_screening"
  }

  return {
    ok: true as const,
    data: {
      status,
      invalidReason,
      creditsAwarded: status === "valid" ? defaultRules.rewardPerValidCompletion : 0,
      elapsedSeconds,
    },
  }
}

function checkQuestion(question: PreviewQuestion, answer: Submission): "ok" | "invalid" | "screen" {
  if (question.kind === "short") {
    const text = (answer.text ?? "").trim()
    if (text.length < 1 || text.length > 500) return "invalid"
    return "ok"
  }
  if (question.kind === "rating") {
    if (typeof answer.rating !== "number") return "invalid"
    if (answer.rating < (question.ratingMin ?? 1) || answer.rating > (question.ratingMax ?? 5)) return "invalid"
    return "ok"
  }
  const indexes = answer.optionIndexes ?? []
  if (question.kind === "single" && indexes.length !== 1) return "invalid"
  if (question.kind === "multiple" && indexes.length < 1) return "invalid"
  if (indexes.some((index) => index < 0 || index >= question.options.length)) return "invalid"
  if (question.correctOptionIndexes && question.correctOptionIndexes.length > 0) {
    const selected = [...indexes].sort((a, b) => a - b).join(",")
    const correct = [...question.correctOptionIndexes].sort((a, b) => a - b).join(",")
    if (selected !== correct) return "screen"
  }
  return "ok"
}
