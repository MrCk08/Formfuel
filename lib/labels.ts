import type { InvalidReason, LedgerEntry, SurveyStatus } from "@/lib/types"

export function invalidReasonLabel(reason: InvalidReason | null) {
  switch (reason) {
    case "too_fast":
      return "Too fast"
    case "failed_screening":
      return "Failed screening"
    case "too_fast_and_failed_screening":
      return "Too fast and failed screening"
    default:
      return "Invalid"
  }
}

export function ledgerReasonLabel(reason: LedgerEntry["reason"]) {
  switch (reason) {
    case "survey_completion":
      return "Answered a survey"
    case "raise_cap":
      return "Raised a response cap"
    case "promote":
      return "Promoted a survey"
    case "create_survey":
      return "Published an extra survey"
  }
}

export function statusLabel(status: SurveyStatus) {
  switch (status) {
    case "draft":
      return "Draft"
    case "open":
      return "Open"
    case "closed":
      return "Closed"
  }
}

export function questionKindLabel(kind: string) {
  switch (kind) {
    case "single":
      return "Single choice"
    case "multiple":
      return "Multiple choice"
    case "short":
      return "Short answer"
    case "rating":
      return "Rating scale"
    default:
      return kind
  }
}

export function formatWhen(iso: string) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
