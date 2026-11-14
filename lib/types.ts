export type QuestionKind = "single" | "multiple" | "short" | "rating"

export type SurveyStatus = "draft" | "open" | "closed"

export type ResponseStatus = "in_progress" | "valid" | "invalid"

export type InvalidReason =
  | "too_fast"
  | "failed_screening"
  | "too_fast_and_failed_screening"

export type QuestionInput = {
  prompt: string
  kind: QuestionKind
  options: string[]
  ratingMin: number
  ratingMax: number
  ratingMinLabel: string
  ratingMaxLabel: string
  isScreening: boolean
  correctOptionIndexes: number[]
}

export type SurveyInput = {
  id?: string
  title: string
  description: string
  tags: string[]
  publish: boolean
  /** Whole seconds. Server rejects values above questionCount * 20. */
  minCompletionSeconds: number
  /** Spent only when publish is true. Funds floor(credits / cost per response) slots. */
  creditsToAllocate: number
  questions: QuestionInput[]
}

export type AppUser = {
  id: string
  email: string | null
  displayName: string
  avatarUrl: string | null
  initials: string
  creditBalance: number
  preview: boolean
}

export type PublicQuestion = {
  id: string
  position: number
  kind: QuestionKind
  prompt: string
  options: string[]
  ratingMin: number | null
  ratingMax: number | null
  ratingMinLabel: string | null
  ratingMaxLabel: string | null
}

export type SurveyCardData = {
  id: string
  title: string
  description: string
  tags: string[]
  searchCode: string
  responseCount: number
  responseCap: number
  estimatedMinutes: number
  reward: number
  isPromoted: boolean
  isOwner: boolean
  answered: boolean
  bookmarked: boolean
}

export type OwnedSurvey = {
  id: string
  title: string
  description: string
  tags: string[]
  searchCode: string
  status: SurveyStatus
  responseCount: number
  responseCap: number
  creditsAllocated: number
  minCompletionSeconds: number
  estimatedMinutes: number
  isPromoted: boolean
  publishedAt: string | null
  updatedAt: string
}

export type AnswerValue =
  | { optionIndexes: number[] }
  | { text: string }
  | { rating: number }

export type LedgerEntry = {
  id: string
  amount: number
  balanceAfter: number
  reason:
    | "survey_completion"
    | "raise_cap"
    | "promote"
    | "create_survey"
    | "signup_grant"
    | "fund_survey"
  surveyTitle: string | null
  createdAt: string
}

export type Distribution = {
  questionId: string
  prompt: string
  kind: QuestionKind
  total: number
  rows: { label: string; count: number; percent: number }[]
}

export type RecentAnswer = {
  id: string
  submittedAt: string
  whenLabel: string
  status: "valid" | "invalid"
  invalidReason: InvalidReason | null
  cells: string[]
}

export type DashboardModel = {
  id: string
  title: string
  status: SurveyStatus
  tags: string[]
  searchCode: string
  responseCap: number
  creditsAllocated: number
  minCompletionSeconds: number
  questionCount: number
  started: number
  submitted: number
  valid: number
  invalid: number
  completionRate: number
  isPromoted: boolean
  promotedUntil: string | null
  distributions: Distribution[]
  recent: RecentAnswer[]
  previewColumns: string[]
}
