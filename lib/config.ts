/**
 * Product rules for Formfuel.
 *
 * The database row `public.product_rules` is what award and spend enforce.
 * It is seeded with these same numbers in supabase/migrations.
 * If you change a rule, update both this module and that row.
 * Signed-in screens prefer the database row when it is available.
 */
export const productConfig = {
  defaultResponseCap: 10,
  rewardPerValidCompletion: 8,
  raiseCapStep: 10,
  raiseCapCost: 8,
  promoteCost: 12,
  promoteDays: 7,
  /** Surveys after the free quota. One valid completion funds one extra survey. */
  extraSurveyCost: 8,
  /** First published survey is free. Further publishes spend extraSurveyCost. */
  freeCreateQuota: 1,
  /** Enforced on the server from the moment the response is started. */
  minCompletionSeconds: 120,
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
  defaultResponseCap: number
  rewardPerValidCompletion: number
  raiseCapStep: number
  raiseCapCost: number
  promoteCost: number
  promoteDays: number
  extraSurveyCost: number
  freeCreateQuota: number
  minCompletionSeconds: number
}

export const defaultRules: ProductRules = {
  defaultResponseCap: productConfig.defaultResponseCap,
  rewardPerValidCompletion: productConfig.rewardPerValidCompletion,
  raiseCapStep: productConfig.raiseCapStep,
  raiseCapCost: productConfig.raiseCapCost,
  promoteCost: productConfig.promoteCost,
  promoteDays: productConfig.promoteDays,
  extraSurveyCost: productConfig.extraSurveyCost,
  freeCreateQuota: productConfig.freeCreateQuota,
  minCompletionSeconds: productConfig.minCompletionSeconds,
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
