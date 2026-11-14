import { ATTENTION_QUESTION_ID, type AttentionCheck } from "@/lib/attention"
import { creditUnit } from "@/lib/config"
import { getPreviewSurvey, type PreviewQuestion } from "@/lib/preview"
import type { InvalidReason } from "@/lib/types"
import { checkAnswer } from "@/lib/validation"

type Submission = {
  questionId?: string
  optionIndexes?: number[]
  text?: string
  rating?: number | null
}

export function scorePreview(
  surveyId: string,
  answers: unknown,
  elapsedSeconds: number,
  attention?: (AttentionCheck & { correctIndex: number }) | null,
) {
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
    if (problem !== "ok" && problem !== "screen") {
      return { ok: false as const, message: question.validation ? problem : "Please complete every question" }
    }
    if (problem === "screen") failed = true
  }

  if (attention) {
    const chosen = byId.get(ATTENTION_QUESTION_ID)
    const indexes = chosen?.optionIndexes ?? []
    if (indexes.length !== 1 || indexes[0] !== attention.correctIndex) failed = true
  }

  const tooFast = elapsedSeconds < survey.minCompletionSeconds
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
      creditsAwarded: status === "valid" ? creditUnit(survey.questions.length) : 0,
      elapsedSeconds,
    },
  }
}

function checkQuestion(question: PreviewQuestion, answer: Submission): "ok" | "screen" | string {
  const checked = checkAnswer(question, {
    optionIndexes: answer.optionIndexes ?? [],
    text: answer.text ?? "",
    rating: answer.rating ?? null,
  })
  if (!checked.ok) return checked.message
  if (question.correctOptionIndexes && question.correctOptionIndexes.length > 0) {
    const selected = "optionIndexes" in checked.value ? [...checked.value.optionIndexes].sort((a, b) => a - b).join(",") : ""
    const correct = [...question.correctOptionIndexes].sort((a, b) => a - b).join(",")
    if (selected !== correct) return "screen"
  }
  return "ok"
}
