import { defaultRules, estimateMinutes } from "@/lib/config"
import type {
  AppUser,
  DashboardModel,
  LedgerEntry,
  OwnedSurvey,
  PublicQuestion,
  SurveyCardData,
} from "@/lib/types"

export const previewUser: AppUser = {
  id: "preview-user",
  email: "amina@university.edu",
  displayName: "Amina",
  avatarUrl: null,
  initials: "AM",
  creditBalance: 24,
  freeCreatesRemaining: 0,
  preview: true,
}

export type PreviewQuestion = PublicQuestion & {
  correctOptionIndexes?: number[]
}

export type PreviewSurvey = {
  id: string
  title: string
  description: string
  tags: string[]
  responseCount: number
  responseCap: number
  estimatedMinutes: number
  ownerId: string
  questions: PreviewQuestion[]
}

const studyQuestions: PreviewQuestion[] = [
  {
    id: "study-q1",
    position: 1,
    kind: "single",
    prompt: "Which year of study are you in?",
    options: ["First year", "Second year", "Third year", "Fourth year or later"],
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
  },
  {
    id: "study-q2",
    position: 2,
    kind: "single",
    prompt: "Where do you usually start a weekend study session?",
    options: ["Morning", "Afternoon", "Evening", "Late night"],
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
  },
  {
    id: "study-q3",
    position: 3,
    kind: "single",
    prompt: "How many hours do you study on weekends?",
    options: ["0–2 hours", "3–5 hours", "6–8 hours", "More than 8 hours"],
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
  },
  {
    id: "study-q4",
    position: 4,
    kind: "multiple",
    prompt: "Which study locations do you use on weekends?",
    options: ["Library", "Dorm / Home", "Café", "Other"],
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
  },
  {
    id: "study-q5",
    position: 5,
    kind: "rating",
    prompt: "How productive do you feel when studying on weekends?",
    options: [],
    ratingMin: 1,
    ratingMax: 5,
    ratingMinLabel: "Not productive",
    ratingMaxLabel: "Very productive",
  },
  {
    id: "study-q6",
    position: 6,
    kind: "short",
    prompt: "What helps you stay focused while studying on weekends?",
    options: [],
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
  },
  {
    id: "study-q7",
    position: 7,
    kind: "rating",
    prompt: "How often do weekend plans interrupt your study time?",
    options: [],
    ratingMin: 1,
    ratingMax: 5,
    ratingMinLabel: "Rarely",
    ratingMaxLabel: "Almost always",
  },
  {
    id: "study-q8",
    position: 8,
    kind: "single",
    prompt: "Are you currently enrolled in a university program?",
    options: ["Yes", "No"],
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
    correctOptionIndexes: [0],
  },
]

function choiceSurvey(
  id: string,
  title: string,
  description: string,
  tags: string[],
  responseCount: number,
  responseCap: number,
): PreviewSurvey {
  return {
    id,
    title,
    description,
    tags,
    responseCount,
    responseCap,
    estimatedMinutes: estimateMinutes(4),
    ownerId: "someone-else",
    questions: [
      {
        id: `${id}-q1`,
        position: 1,
        kind: "single",
        prompt: "How familiar are you with this topic?",
        options: ["Not familiar", "Somewhat familiar", "Very familiar"],
        ratingMin: null,
        ratingMax: null,
        ratingMinLabel: null,
        ratingMaxLabel: null,
      },
      {
        id: `${id}-q2`,
        position: 2,
        kind: "multiple",
        prompt: "Which of these have you used this term?",
        options: ["Campus services", "Online resources", "Peer groups", "None of these"],
        ratingMin: null,
        ratingMax: null,
        ratingMinLabel: null,
        ratingMaxLabel: null,
      },
      {
        id: `${id}-q3`,
        position: 3,
        kind: "rating",
        prompt: "How useful would more support in this area be?",
        options: [],
        ratingMin: 1,
        ratingMax: 5,
        ratingMinLabel: "Not useful",
        ratingMaxLabel: "Very useful",
      },
      {
        id: `${id}-q4`,
        position: 4,
        kind: "short",
        prompt: "What should the next version of this survey ask?",
        options: [],
        ratingMin: null,
        ratingMax: null,
        ratingMinLabel: null,
        ratingMaxLabel: null,
      },
    ],
  }
}

export const previewSurveys: PreviewSurvey[] = [
  {
    id: "preview-study",
    title: "Weekend study habits of university students",
    description: "Share how you study on weekends to help improve student support.",
    tags: ["Academic Life", "University"],
    responseCount: 12,
    responseCap: 30,
    estimatedMinutes: 3,
    ownerId: "someone-else",
    questions: studyQuestions,
  },
  choiceSurvey(
    "preview-cafe",
    "Cafeteria food satisfaction",
    "Give feedback on campus dining options and quality.",
    ["Campus Life", "Food"],
    12,
    30,
  ),
  choiceSurvey(
    "preview-intern",
    "Internship application experiences",
    "Share your internship search journey and outcomes.",
    ["Career", "Experiences"],
    12,
    30,
  ),
  choiceSurvey(
    "preview-sleep",
    "Sleep schedule during midterms",
    "Help us understand student sleep patterns during exam season.",
    ["Health", "Wellbeing"],
    12,
    30,
  ),
  {
    ...choiceSurvey(
      "preview-edtech",
      "Student experiences with online learning platforms",
      "Help improve edtech tools by sharing your experiences.",
      ["Academics", "Tools"],
      18,
      40,
    ),
    estimatedMinutes: 5,
  },
  {
    ...choiceSurvey(
      "preview-mental",
      "Campus mental health resources awareness survey",
      "Share your awareness and feedback to support student wellbeing.",
      ["Health", "Campus"],
      9,
      30,
    ),
    estimatedMinutes: 4,
  },
]

const promotedIds = new Set(["preview-edtech", "preview-mental"])

export function previewCards(): { promoted: SurveyCardData[]; rest: SurveyCardData[] } {
  const cards = previewSurveys.map((survey) => ({
    id: survey.id,
    title: survey.title,
    description: survey.description,
    tags: survey.tags,
    responseCount: survey.responseCount,
    responseCap: survey.responseCap,
    estimatedMinutes: survey.estimatedMinutes,
    reward: defaultRules.rewardPerValidCompletion,
    isPromoted: promotedIds.has(survey.id),
    isOwner: false,
    answered: false,
    bookmarked: false,
  }))
  return {
    promoted: cards.filter((card) => card.isPromoted),
    rest: cards.filter((card) => !card.isPromoted),
  }
}

export function getPreviewSurvey(id: string) {
  return previewSurveys.find((survey) => survey.id === id) ?? null
}

export function toPublicQuestions(questions: PreviewQuestion[]): PublicQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    position: question.position,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    ratingMin: question.ratingMin,
    ratingMax: question.ratingMax,
    ratingMinLabel: question.ratingMinLabel,
    ratingMaxLabel: question.ratingMaxLabel,
  }))
}

export const previewOwned: OwnedSurvey[] = [
  {
    id: "preview-owned",
    title: "Weekend study habits of university students",
    description:
      "This survey explores how university students spend their weekends studying, including time spent, study locations, and productivity habits.",
    status: "open",
    responseCount: 28,
    responseCap: 40,
    estimatedMinutes: 3,
    isPromoted: false,
    publishedAt: "2026-11-10T15:00:00.000Z",
    updatedAt: "2026-11-13T14:00:00.000Z",
  },
  {
    id: "preview-draft",
    title: "Library hours pilot feedback",
    description: "A draft about late-night library access.",
    status: "draft",
    responseCount: 0,
    responseCap: 10,
    estimatedMinutes: 2,
    isPromoted: false,
    publishedAt: null,
    updatedAt: "2026-11-12T14:00:00.000Z",
  },
]

export const previewDashboard: DashboardModel = {
  id: "preview-owned",
  title: "Weekend study habits of university students",
  status: "open",
  responseCap: 40,
  started: 34,
  submitted: 28,
  valid: 24,
  invalid: 4,
  completionRate: 82,
  isPromoted: false,
  promotedUntil: null,
  previewColumns: ["Q1", "Q2"],
  distributions: [
    {
      questionId: "hours",
      prompt: "How many hours do you study on weekends?",
      kind: "single",
      total: 28,
      rows: [
        { label: "0–1 hours", count: 11, percent: 39 },
        { label: "1–3 hours", count: 8, percent: 29 },
        { label: "3–5 hours", count: 5, percent: 18 },
        { label: "5–7 hours", count: 2, percent: 7 },
        { label: "7+ hours", count: 2, percent: 7 },
      ],
    },
  ],
  recent: [
    { id: "r1", submittedAt: "2026-11-13T15:12:00.000Z", whenLabel: "2 min ago", status: "valid", invalidReason: null, cells: ["3–5 hours", "Library"] },
    { id: "r2", submittedAt: "2026-11-13T15:07:00.000Z", whenLabel: "7 min ago", status: "valid", invalidReason: null, cells: ["1–3 hours", "Home"] },
    { id: "r3", submittedAt: "2026-11-13T15:02:00.000Z", whenLabel: "12 min ago", status: "valid", invalidReason: null, cells: ["3–5 hours", "Café"] },
    { id: "r4", submittedAt: "2026-11-13T14:56:00.000Z", whenLabel: "18 min ago", status: "invalid", invalidReason: "too_fast", cells: ["—", "—"] },
    { id: "r5", submittedAt: "2026-11-13T14:49:00.000Z", whenLabel: "25 min ago", status: "valid", invalidReason: null, cells: ["5–7 hours", "Library"] },
  ],
}

export const previewLedger: LedgerEntry[] = [
  {
    id: "l1",
    amount: 8,
    balanceAfter: 24,
    reason: "survey_completion",
    surveyTitle: "Cafeteria food satisfaction",
    createdAt: "2026-11-13T13:10:00.000Z",
  },
  {
    id: "l2",
    amount: -12,
    balanceAfter: 16,
    reason: "promote",
    surveyTitle: "Library hours pilot feedback",
    createdAt: "2026-11-12T18:00:00.000Z",
  },
  {
    id: "l3",
    amount: -8,
    balanceAfter: 28,
    reason: "raise_cap",
    surveyTitle: "Weekend study habits of university students",
    createdAt: "2026-11-11T16:20:00.000Z",
  },
]

export function previewCsv() {
  return {
    title: previewDashboard.title,
    headers: ["Submitted at", "Validity", "Invalid reason", "Hours", "Location"],
    rows: previewDashboard.recent.map((row) => [
      row.submittedAt,
      row.status,
      row.invalidReason ?? "",
      row.cells[0] ?? "",
      row.cells[1] ?? "",
    ]),
  }
}
