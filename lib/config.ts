/**
 * Product rules for Formfuel.
 *
 * The database row `public.product_rules` is what award and spend enforce.
 * It is seeded with these same numbers in supabase/migrations.
 * If you change a rule, update both this module and that row.
 * Signed-in screens prefer the database row when it is available.
 *
 * Credit model: 1 credit covers `questionsPerCredit` questions.
 * Cost of one response slot = ceil(questionCount / questionsPerCredit).
 * Response cap = floor(creditsAllocated / that cost).
 * A valid completion earns the same per-response cost. Invalid responses earn 0.
 *
 * Minimum completion time is chosen per survey. The maximum allowed value is
 * questionCount * minSecondsPerQuestion. The create form defaults to
 * `defaultMinCompletionSeconds` (60) when that fits, and to the cap when the
 * survey is shorter. A 1-question survey therefore defaults to 20 seconds,
 * a 2-question survey to 40, and a survey of 3 or more questions to 60.
 */
export const productConfig = {
  startingCredits: 10,
  questionsPerCredit: 10,
  minSecondsPerQuestion: 20,
  defaultMinCompletionSeconds: 60,
  promoteCost: 12,
  promoteDays: 7,
  maxDrafts: 10,
  maxQuestions: 20,
  maxTags: 5,
  maxTagLength: 24,
  titleMin: 3,
  titleMax: 120,
  descriptionMax: 1000,
  promptMin: 3,
  promptMax: 280,
  optionMax: 80,
  minOptions: 2,
  maxOptions: 8,
  shortAnswerMax: 500,
  ratingLabelMax: 40,
} as const

export type ProductRules = {
  startingCredits: number
  questionsPerCredit: number
  minSecondsPerQuestion: number
  defaultMinCompletionSeconds: number
  promoteCost: number
  promoteDays: number
}

export const defaultRules: ProductRules = {
  startingCredits: productConfig.startingCredits,
  questionsPerCredit: productConfig.questionsPerCredit,
  minSecondsPerQuestion: productConfig.minSecondsPerQuestion,
  defaultMinCompletionSeconds: productConfig.defaultMinCompletionSeconds,
  promoteCost: productConfig.promoteCost,
  promoteDays: productConfig.promoteDays,
}

export function creditUnit(questionCount: number, questionsPerCredit: number = productConfig.questionsPerCredit) {
  const count = Math.max(0, Math.floor(questionCount))
  const per = Math.max(1, Math.floor(questionsPerCredit))
  if (count < 1) return 1
  return Math.ceil(count / per)
}

export function responseCapForCredits(
  credits: number,
  questionCount: number,
  questionsPerCredit: number = productConfig.questionsPerCredit,
) {
  const unit = creditUnit(questionCount, questionsPerCredit)
  if (!Number.isFinite(credits) || credits < unit) return 0
  return Math.floor(credits / unit)
}

export function maxMinCompletionSeconds(
  questionCount: number,
  secondsPerQuestion: number = productConfig.minSecondsPerQuestion,
) {
  return Math.max(0, Math.floor(questionCount)) * Math.max(1, Math.floor(secondsPerQuestion))
}

export function defaultMinCompletionSeconds(
  questionCount: number,
  preferred: number = productConfig.defaultMinCompletionSeconds,
  secondsPerQuestion: number = productConfig.minSecondsPerQuestion,
) {
  return Math.min(Math.max(0, preferred), maxMinCompletionSeconds(questionCount, secondsPerQuestion))
}

/** Credits still required before the cap grows by one response. */
export function creditsNeededForNextSlot(
  creditsAllocated: number,
  questionCount: number,
  questionsPerCredit: number = productConfig.questionsPerCredit,
) {
  const unit = creditUnit(questionCount, questionsPerCredit)
  const allocated = Math.max(0, Math.floor(creditsAllocated))
  const remainder = allocated % unit
  return remainder === 0 ? unit : unit - remainder
}

export function estimateMinutes(questionCount: number) {
  return Math.max(1, Math.ceil(questionCount / 2))
}

export function formatMinutes(minutes: number) {
  return `~${minutes} min`
}

export function formatMinTime(seconds: number) {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    return minutes === 1 ? "1 minute" : `${minutes} minutes`
  }
  return `${seconds} seconds`
}

export function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const remain = safe % 60
  return `${minutes}:${remain.toString().padStart(2, "0")}`
}

export function creditWord(count: number) {
  return count === 1 ? "credit" : "credits"
}
