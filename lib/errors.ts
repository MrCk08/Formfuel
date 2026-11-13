export function cleanError(message: string) {
  const first = message.split("\n")[0]?.trim() || "Something went wrong"
  if (/responses_survey_id_respondent_id|duplicate key/i.test(first)) {
    return "You already responded to this survey"
  }
  if (/credit_balance|not enough credits/i.test(first)) {
    return "Not enough credits"
  }
  const withoutPrefix = first
    .replace(/^PostgrestError:\s*/i, "")
    .replace(/^ERROR:\s*/i, "")
    .replace(/^[A-Z0-9]{5}:\s*/, "")
  if (withoutPrefix.length > 280) return "Something went wrong. Please try again."
  return withoutPrefix
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; message: string }
