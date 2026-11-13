import { displayAnswer, parseAnswerValue } from "@/lib/answers"
import { formatWhen } from "@/lib/labels"
import type { DashboardModel, PublicQuestion, QuestionKind, RecentAnswer, SurveyStatus } from "@/lib/types"

type ResponseRow = {
  id: string
  status: "in_progress" | "valid" | "invalid"
  invalid_reason: RecentAnswer["invalidReason"]
  submitted_at: string | null
}

type AnswerRow = {
  response_id: string
  question_id: string
  value: unknown
}

export function buildDashboard(input: {
  id: string
  title: string
  status: SurveyStatus
  responseCap: number
  promotedUntil: string | null
  questions: PublicQuestion[]
  responses: ResponseRow[]
  answers: AnswerRow[]
}): DashboardModel {
  const submitted = input.responses.filter((response) => response.status !== "in_progress")
  const valid = submitted.filter((response) => response.status === "valid").length
  const invalid = submitted.filter((response) => response.status === "invalid").length
  const started = input.responses.length
  const completionRate = started === 0 ? 0 : Math.round((submitted.length / started) * 100)
  const answersByResponse = new Map<string, AnswerRow[]>()
  for (const answer of input.answers) {
    const list = answersByResponse.get(answer.response_id) ?? []
    list.push(answer)
    answersByResponse.set(answer.response_id, list)
  }

  const chartable = input.questions.filter((question) => question.kind !== "short")
  const distributions = chartable.map((question) => {
    const counts = new Map<string, number>()
    const labels =
      question.kind === "rating"
        ? range(question.ratingMin ?? 1, question.ratingMax ?? 5).map(String)
        : question.options
    for (const label of labels) counts.set(label, 0)

    for (const response of submitted) {
      const answer = (answersByResponse.get(response.id) ?? []).find((item) => item.question_id === question.id)
      const value = parseAnswerValue(answer?.value)
      if (!value) continue
      if ("rating" in value) {
        const label = String(value.rating)
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      if ("optionIndexes" in value) {
        for (const index of value.optionIndexes) {
          const label = question.options[index]
          if (!label) continue
          counts.set(label, (counts.get(label) ?? 0) + 1)
        }
      }
    }

    const total = submitted.length
    return {
      questionId: question.id,
      prompt: question.prompt,
      kind: question.kind as QuestionKind,
      total,
      rows: labels.map((label) => {
        const count = counts.get(label) ?? 0
        return {
          label,
          count,
          percent: total === 0 ? 0 : Math.round((count / total) * 100),
        }
      }),
    }
  })

  const previewQuestions = input.questions.slice(0, 2)
  const recent = submitted
    .slice()
    .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""))
    .slice(0, 5)
    .map((response) => {
      const answers = answersByResponse.get(response.id) ?? []
      return {
        id: response.id,
        submittedAt: response.submitted_at ?? "",
        whenLabel: response.submitted_at ? formatWhen(response.submitted_at) : "—",
        status: response.status as "valid" | "invalid",
        invalidReason: response.invalid_reason,
        cells: previewQuestions.map((question) => {
          const answer = answers.find((item) => item.question_id === question.id)
          return displayAnswer(question, parseAnswerValue(answer?.value))
        }),
      }
    })

  return {
    id: input.id,
    title: input.title,
    status: input.status,
    responseCap: input.responseCap,
    started,
    submitted: submitted.length,
    valid,
    invalid,
    completionRate,
    isPromoted: input.promotedUntil ? new Date(input.promotedUntil).getTime() > Date.now() : false,
    promotedUntil: input.promotedUntil,
    distributions,
    recent,
    previewColumns: previewQuestions.map((_, index) => `Q${index + 1}`),
  }
}

function range(min: number, max: number) {
  const values: number[] = []
  for (let value = min; value <= max; value += 1) values.push(value)
  return values
}
