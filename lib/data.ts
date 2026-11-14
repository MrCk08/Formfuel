import { cache } from "react"
import { creditUnit, defaultRules, type ProductRules } from "@/lib/config"
import { buildDashboard } from "@/lib/dashboard"
import { cleanError } from "@/lib/errors"
import {
  getPreviewSurvey,
  previewCards,
  previewDashboard,
  previewLedger,
  previewOwned,
  toPublicQuestions,
} from "@/lib/preview"
import { createClient } from "@/lib/supabase/server"
import type {
  AppUser,
  DashboardModel,
  LedgerEntry,
  OwnedSurvey,
  PublicQuestion,
  QuestionInput,
  QuestionKind,
  SurveyCardData,
  SurveyStatus,
} from "@/lib/types"

export type LoadResult<T> = { ok: true; data: T } | { ok: false; message: string }

function mapRules(row: {
  starting_credits?: number
  questions_per_credit?: number
  min_seconds_per_question?: number
  default_min_completion_seconds?: number
  promote_cost?: number
  promote_days?: number
}): ProductRules {
  if (
    typeof row.starting_credits !== "number" ||
    typeof row.questions_per_credit !== "number" ||
    typeof row.min_seconds_per_question !== "number" ||
    typeof row.default_min_completion_seconds !== "number" ||
    typeof row.promote_cost !== "number" ||
    typeof row.promote_days !== "number"
  ) {
    return defaultRules
  }
  return {
    startingCredits: row.starting_credits,
    questionsPerCredit: row.questions_per_credit,
    minSecondsPerQuestion: row.min_seconds_per_question,
    defaultMinCompletionSeconds: row.default_min_completion_seconds,
    promoteCost: row.promote_cost,
    promoteDays: row.promote_days,
  }
}

function questionCountOf(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { count?: number } | undefined
    return typeof first?.count === "number" ? first.count : 0
  }
  if (value && typeof value === "object" && "count" in value) {
    const count = (value as { count?: unknown }).count
    return typeof count === "number" ? count : 0
  }
  return 0
}

export const getRules = cache(async (user: AppUser): Promise<ProductRules> => {
  if (user.preview) return defaultRules
  const supabase = await createClient()
  const { data, error } = await supabase.from("product_rules").select("*").eq("id", 1).maybeSingle()
  if (error || !data) return defaultRules
  return mapRules(data)
})

export async function listBrowse(user: AppUser): Promise<
  LoadResult<{ promoted: SurveyCardData[]; rest: SurveyCardData[] }>
> {
  const rules = await getRules(user)
  if (user.preview) {
    return { ok: true, data: previewCards() }
  }

  const supabase = await createClient()
  const [{ data: surveys, error }, { data: responses, error: responseError }, { data: bookmarks, error: bookmarkError }] =
    await Promise.all([
      supabase
        .from("surveys")
        .select("id, title, description, tags, search_code, response_count, response_cap, estimated_minutes, promoted_until, published_at, owner_id, questions(count)")
        .eq("status", "open")
        .order("published_at", { ascending: false }),
      supabase.from("responses").select("survey_id, status").eq("respondent_id", user.id),
      supabase.from("survey_bookmarks").select("survey_id").eq("user_id", user.id),
    ])

  const errorMessage = error?.message || responseError?.message || bookmarkError?.message
  if (errorMessage || !surveys) return { ok: false, message: cleanError(errorMessage || "Could not load surveys") }

  const answered = new Set(
    (responses ?? [])
      .filter((response) => response.status === "valid" || response.status === "invalid")
      .map((response) => response.survey_id),
  )
  const saved = new Set((bookmarks ?? []).map((bookmark) => bookmark.survey_id))
  const now = Date.now()

  const cards: SurveyCardData[] = surveys.map((survey) => ({
    id: survey.id,
    title: survey.title,
    description: survey.description,
    tags: survey.tags ?? [],
    searchCode: survey.search_code,
    responseCount: survey.response_count,
    responseCap: survey.response_cap,
    estimatedMinutes: survey.estimated_minutes,
    reward: creditUnit(questionCountOf(survey.questions), rules.questionsPerCredit),
    isPromoted: survey.promoted_until ? new Date(survey.promoted_until).getTime() > now : false,
    isOwner: survey.owner_id === user.id,
    answered: answered.has(survey.id),
    bookmarked: saved.has(survey.id),
  }))

  cards.sort((a, b) => Number(b.isPromoted) - Number(a.isPromoted))
  return {
    ok: true,
    data: {
      promoted: cards.filter((card) => card.isPromoted),
      rest: cards.filter((card) => !card.isPromoted),
    },
  }
}

export async function listOwned(user: AppUser): Promise<LoadResult<OwnedSurvey[]>> {
  if (user.preview) return { ok: true, data: previewOwned }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("surveys")
    .select("id, title, description, tags, search_code, status, response_count, response_cap, credits_allocated, min_completion_seconds, estimated_minutes, promoted_until, published_at, updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })

  if (error || !data) return { ok: false, message: cleanError(error?.message || "Could not load your surveys") }
  const now = Date.now()
  return {
    ok: true,
    data: data.map((survey) => ({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      tags: survey.tags ?? [],
      searchCode: survey.search_code,
      status: survey.status as SurveyStatus,
      responseCount: survey.response_count,
      responseCap: survey.response_cap,
      creditsAllocated: survey.credits_allocated,
      minCompletionSeconds: survey.min_completion_seconds,
      estimatedMinutes: survey.estimated_minutes,
      isPromoted: survey.promoted_until ? new Date(survey.promoted_until).getTime() > now : false,
      publishedAt: survey.published_at,
      updatedAt: survey.updated_at,
    })),
  }
}

export async function listLedger(user: AppUser): Promise<LoadResult<LedgerEntry[]>> {
  if (user.preview) return { ok: true, data: previewLedger }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("credit_ledger")
    .select("id, amount, balance_after, reason, created_at, survey_id, surveys(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error || !data) return { ok: false, message: cleanError(error?.message || "Could not load credits") }

  return {
    ok: true,
    data: data.map((entry) => {
      const related = entry.surveys as { title: string } | { title: string }[] | null
      const title = Array.isArray(related) ? related[0]?.title : related?.title
      return {
        id: entry.id,
        amount: entry.amount,
        balanceAfter: entry.balance_after,
        reason: entry.reason,
        surveyTitle: title ?? null,
        createdAt: entry.created_at,
      }
    }),
  }
}

export type AnswerPageData = {
  id: string
  title: string
  tags: string[]
  searchCode: string
  minCompletionSeconds: number
  questions: PublicQuestion[]
  responseCount: number
  responseCap: number
  status: SurveyStatus
  isOwner: boolean
  existing: {
    status: "in_progress" | "valid" | "invalid"
    invalidReason: "too_fast" | "failed_screening" | "too_fast_and_failed_screening" | null
    startedAt: string | null
    creditsAwarded: number
  } | null
}

export async function getAnswerPage(user: AppUser, id: string): Promise<LoadResult<AnswerPageData | null>> {
  if (user.preview) {
    if (id === previewDashboard.id) {
      return {
        ok: true,
        data: {
          id,
          title: previewDashboard.title,
          tags: previewDashboard.tags,
          searchCode: previewDashboard.searchCode,
          minCompletionSeconds: previewDashboard.minCompletionSeconds,
          questions: [],
          responseCount: previewDashboard.submitted,
          responseCap: previewDashboard.responseCap,
          status: "open",
          isOwner: true,
          existing: null,
        },
      }
    }
    const survey = getPreviewSurvey(id)
    if (!survey) return { ok: true, data: null }
    return {
      ok: true,
      data: {
        id: survey.id,
        title: survey.title,
        tags: survey.tags,
        searchCode: survey.searchCode,
        minCompletionSeconds: survey.minCompletionSeconds,
        questions: toPublicQuestions(survey.questions),
        responseCount: survey.responseCount,
        responseCap: survey.responseCap,
        status: "open",
        isOwner: false,
        existing: null,
      },
    }
  }

  const supabase = await createClient()
  const { data: survey, error } = await supabase
    .from("surveys")
    .select("id, title, owner_id, status, response_count, response_cap, tags, search_code, min_completion_seconds")
    .eq("id", id)
    .maybeSingle()
  if (error) return { ok: false, message: cleanError(error.message) }
  if (!survey) return { ok: true, data: null }

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("id, position, kind, prompt, options, rating_min, rating_max, rating_min_label, rating_max_label")
    .eq("survey_id", id)
    .order("position")
  if (questionError) return { ok: false, message: cleanError(questionError.message) }

  const { data: response, error: responseError } = await supabase
    .from("responses")
    .select("status, invalid_reason, started_at, id")
    .eq("survey_id", id)
    .eq("respondent_id", user.id)
    .maybeSingle()
  if (responseError) return { ok: false, message: cleanError(responseError.message) }

  let creditsAwarded = 0
  if (response && response.status === "valid") {
    const { data: ledger } = await supabase
      .from("credit_ledger")
      .select("amount")
      .eq("response_id", response.id)
      .eq("reason", "survey_completion")
      .maybeSingle()
    creditsAwarded = ledger?.amount ?? 0
  }

  return {
    ok: true,
    data: {
      id: survey.id,
      title: survey.title,
      tags: survey.tags ?? [],
      searchCode: survey.search_code,
      minCompletionSeconds: survey.min_completion_seconds,
      status: survey.status as SurveyStatus,
      responseCount: survey.response_count,
      responseCap: survey.response_cap,
      isOwner: survey.owner_id === user.id,
      questions: (questions ?? []).map((question) => ({
        id: question.id,
        position: question.position,
        kind: question.kind as QuestionKind,
        prompt: question.prompt,
        options: question.options ?? [],
        ratingMin: question.rating_min,
        ratingMax: question.rating_max,
        ratingMinLabel: question.rating_min_label,
        ratingMaxLabel: question.rating_max_label,
      })),
      existing: response
        ? {
            status: response.status,
            invalidReason: response.invalid_reason,
            startedAt: response.started_at,
            creditsAwarded,
          }
        : null,
    },
  }
}

export async function getDashboard(user: AppUser, id: string): Promise<LoadResult<DashboardModel | null>> {
  if (user.preview) {
    if (id === previewDashboard.id) return { ok: true, data: previewDashboard }
    return { ok: true, data: null }
  }

  const supabase = await createClient()
  const { data: survey, error } = await supabase
    .from("surveys")
    .select("id, title, status, owner_id, response_cap, promoted_until, tags, search_code, credits_allocated, min_completion_seconds")
    .eq("id", id)
    .maybeSingle()
  if (error) return { ok: false, message: cleanError(error.message) }
  if (!survey || survey.owner_id !== user.id) return { ok: true, data: null }

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("id, position, kind, prompt, options, rating_min, rating_max, rating_min_label, rating_max_label")
    .eq("survey_id", id)
    .order("position")
  if (questionError || !questions) return { ok: false, message: cleanError(questionError?.message || "Could not load questions") }

  const { data: responses, error: responseError } = await supabase
    .from("responses")
    .select("id, status, invalid_reason, submitted_at, started_at")
    .eq("survey_id", id)
  if (responseError || !responses) return { ok: false, message: cleanError(responseError?.message || "Could not load responses") }

  const responseIds = responses.map((response) => response.id)
  let answers: { response_id: string; question_id: string; value: unknown }[] = []
  if (responseIds.length > 0) {
    const { data, error: answerError } = await supabase
      .from("answers")
      .select("response_id, question_id, value")
      .in("response_id", responseIds)
    if (answerError) return { ok: false, message: cleanError(answerError.message) }
    answers = data ?? []
  }

  return {
    ok: true,
    data: buildDashboard({
      id: survey.id,
      title: survey.title,
      status: survey.status as SurveyStatus,
      tags: survey.tags ?? [],
      searchCode: survey.search_code,
      responseCap: survey.response_cap,
      creditsAllocated: survey.credits_allocated,
      minCompletionSeconds: survey.min_completion_seconds,
      promotedUntil: survey.promoted_until,
      questions: questions.map((question) => ({
        id: question.id,
        position: question.position,
        kind: question.kind as QuestionKind,
        prompt: question.prompt,
        options: question.options ?? [],
        ratingMin: question.rating_min,
        ratingMax: question.rating_max,
        ratingMinLabel: question.rating_min_label,
        ratingMaxLabel: question.rating_max_label,
      })),
      responses,
      answers,
    }),
  }
}

export type EditorSurvey = {
  id: string
  title: string
  description: string
  tags: string[]
  searchCode: string
  status: SurveyStatus
  responseCap: number
  creditsAllocated: number
  minCompletionSeconds: number
  questions: (QuestionInput & { key: string })[]
}

export async function getEditorSurvey(user: AppUser, id: string): Promise<LoadResult<EditorSurvey | null>> {
  if (user.preview) return { ok: true, data: null }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_own_survey", { p_survey_id: id })
  if (error) {
    if (/not found/i.test(error.message)) return { ok: true, data: null }
    return { ok: false, message: cleanError(error.message) }
  }
  const parsed = parseEditorSurvey(data)
  if (!parsed) return { ok: false, message: "Could not read this survey" }
  return { ok: true, data: parsed }
}

function parseEditorSurvey(data: unknown): EditorSurvey | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.status !== "string") return null
  const questions = Array.isArray(row.questions) ? row.questions : []
  return {
    id: row.id,
    title: row.title,
    description: typeof row.description === "string" ? row.description : "",
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    searchCode: typeof row.searchCode === "string" ? row.searchCode : "",
    status: row.status as SurveyStatus,
    responseCap: typeof row.responseCap === "number" ? row.responseCap : 0,
    creditsAllocated: typeof row.creditsAllocated === "number" ? row.creditsAllocated : 0,
    minCompletionSeconds: typeof row.minCompletionSeconds === "number" ? row.minCompletionSeconds : 0,
    questions: questions.map((question, index) => {
      const item = question as Record<string, unknown>
      const kind = (typeof item.kind === "string" ? item.kind : "short") as QuestionKind
      return {
        key: typeof item.id === "string" ? item.id : `q-${index}`,
        prompt: typeof item.prompt === "string" ? item.prompt : "",
        kind,
        options: Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === "string") : [],
        ratingMin: typeof item.ratingMin === "number" ? item.ratingMin : 1,
        ratingMax: typeof item.ratingMax === "number" ? item.ratingMax : 5,
        ratingMinLabel: typeof item.ratingMinLabel === "string" ? item.ratingMinLabel : "",
        ratingMaxLabel: typeof item.ratingMaxLabel === "string" ? item.ratingMaxLabel : "",
        isScreening: item.isScreening === true,
        correctOptionIndexes: Array.isArray(item.correctOptionIndexes)
          ? item.correctOptionIndexes.filter((value): value is number => typeof value === "number")
          : [],
      }
    }),
  }
}

export async function getCsvRows(user: AppUser, id: string) {
  if (user.preview) return null
  const dashboard = await getDashboard(user, id)
  if (!dashboard.ok || !dashboard.data) return dashboard.ok ? null : dashboard

  const supabase = await createClient()
  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, prompt, position, options")
    .eq("survey_id", id)
    .order("position")
  if (error || !questions) return { ok: false as const, message: cleanError(error?.message || "Could not export") }

  const { data: responses, error: responseError } = await supabase
    .from("responses")
    .select("id, status, invalid_reason, submitted_at")
    .eq("survey_id", id)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: true })
  if (responseError || !responses) return { ok: false as const, message: cleanError(responseError?.message || "Could not export") }

  const ids = responses.map((response) => response.id)
  let answers: { response_id: string; question_id: string; value: unknown }[] = []
  if (ids.length > 0) {
    const { data, error: answerError } = await supabase
      .from("answers")
      .select("response_id, question_id, value")
      .in("response_id", ids)
    if (answerError) return { ok: false as const, message: cleanError(answerError.message) }
    answers = data ?? []
  }

  return {
    ok: true as const,
    title: dashboard.data.title,
    questions,
    responses,
    answers,
  }
}
