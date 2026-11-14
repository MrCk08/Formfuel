import type { PublicQuestion } from "@/lib/types"

/** Stable id for the injected quality check. It is not a row in public.questions. */
export const ATTENTION_QUESTION_ID = "attention"

export type AttentionItem = {
  prompt: string
  options: readonly [string, string, string, string]
  correctOption: string
}

/**
 * Fixed pool of single-choice quality checks. The same five prompts, options,
 * and correct answers are embedded in private.attention_item. Keep them together.
 */
export const ATTENTION_POOL: readonly AttentionItem[] = [
  {
    prompt: "Quality Check: To verify you are reading carefully, please select 'Verified' below.",
    options: ["Skipped", "Verified", "Random", "None"],
    correctOption: "Verified",
  },
  {
    prompt: "Quality Check: To show you are reading each question, please select the color Blue.",
    options: ["Red", "Blue", "Green", "Yellow"],
    correctOption: "Blue",
  },
  {
    prompt: "Quality Check: Please select Wednesday to confirm you are paying attention.",
    options: ["Monday", "Wednesday", "Friday", "Sunday"],
    correctOption: "Wednesday",
  },
  {
    prompt: "Quality Check: Select the number 7 below.",
    options: ["3", "5", "7", "9"],
    correctOption: "7",
  },
  {
    prompt: "Quality Check: If you have read this question, please select 'I understand'.",
    options: ["Skip this", "I understand", "Not sure", "Leave blank"],
    correctOption: "I understand",
  },
]

export type AttentionCheck = {
  id: typeof ATTENTION_QUESTION_ID
  /** Zero-based index in the respondent's combined question list. */
  position: number
  prompt: string
  options: string[]
}

export function attentionCorrectIndex(item: AttentionItem) {
  const index = item.options.indexOf(item.correctOption)
  if (index < 0) throw new Error("Attention check is missing its correct option")
  return index
}

export function pickAttentionCheck(questionCount: number, random: () => number = Math.random): AttentionCheck & { correctIndex: number } {
  const item = ATTENTION_POOL[Math.floor(random() * ATTENTION_POOL.length)] ?? ATTENTION_POOL[0]
  const span = Math.max(0, Math.floor(questionCount)) + 1
  return {
    id: ATTENTION_QUESTION_ID,
    position: Math.floor(random() * span),
    prompt: item.prompt,
    options: [...item.options],
    correctIndex: attentionCorrectIndex(item),
  }
}

export function attentionAsQuestion(check: AttentionCheck): PublicQuestion {
  return {
    id: ATTENTION_QUESTION_ID,
    position: check.position + 1,
    kind: "single",
    prompt: check.prompt,
    options: check.options,
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
    attentionCheck: true,
  }
}

/** Insert the stored quality check without changing the creator question ids. */
export function withAttentionCheck(questions: PublicQuestion[], check: AttentionCheck | null | undefined) {
  if (!check || questions.some((question) => question.id === ATTENTION_QUESTION_ID)) return questions
  const next = questions.slice()
  const at = Math.min(Math.max(0, Math.floor(check.position)), next.length)
  next.splice(at, 0, attentionAsQuestion({ ...check, position: at }))
  return next.map((question, index) => ({ ...question, position: index + 1 }))
}
