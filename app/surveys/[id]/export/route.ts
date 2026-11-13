import { requireUser } from "@/lib/auth"
import { displayAnswer, parseAnswerValue } from "@/lib/answers"
import { toCsv } from "@/lib/csv"
import { getCsvRows } from "@/lib/data"
import { invalidReasonLabel } from "@/lib/labels"
import { previewCsv } from "@/lib/preview"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const user = await requireUser()

  if (user.preview) {
    if (id !== "preview-owned") return new Response("Not found", { status: 404 })
    const sample = previewCsv()
    return csvResponse(sample.title, toCsv(sample.headers, sample.rows))
  }

  const result = await getCsvRows(user, id)
  if (!result) return new Response("Not found", { status: 404 })
  if (!result.ok) return new Response(result.message, { status: 400 })

  const headers = ["Submitted at", "Validity", "Invalid reason", ...result.questions.map((question) => question.prompt)]
  const rows = result.responses.map((response) => {
    const values = result.questions.map((question) => {
      const answer = result.answers.find((item) => item.response_id === response.id && item.question_id === question.id)
      return displayAnswer({ options: question.options ?? [] }, parseAnswerValue(answer?.value))
    })
    return [
      response.submitted_at ?? "",
      response.status,
      response.invalid_reason ? invalidReasonLabel(response.invalid_reason) : "",
      ...values,
    ]
  })

  return csvResponse(result.title, toCsv(headers, rows))
}

function csvResponse(title: string, body: string) {
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "survey"}.csv`
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
