"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { cleanError, type ActionResult } from "@/lib/errors"
import { scorePreview } from "@/lib/preview-score"
import { getPreviewSurvey } from "@/lib/preview"
import { validateSurveyInput } from "@/lib/survey-form"
import { createClient } from "@/lib/supabase/server"
import type { InvalidReason, SurveyInput } from "@/lib/types"

export type ResponseState = {
  state: "in_progress" | "submitted"
  startedAt: string
  status: "in_progress" | "valid" | "invalid"
  invalidReason: InvalidReason | null
  creditsAwarded: number
  elapsedSeconds?: number
}

function refreshSurveyPaths(id?: string) {
  revalidatePath("/", "layout")
  revalidatePath("/browse")
  revalidatePath("/my-surveys")
  revalidatePath("/credits")
  if (id) {
    revalidatePath(`/create/${id}`)
    revalidatePath(`/surveys/${id}`)
    revalidatePath(`/surveys/${id}/dashboard`)
  }
}

export async function saveSurveyAction(input: SurveyInput): Promise<ActionResult> {
  const user = await requireUser()
  if (user.preview) {
    return { ok: false, message: "Connect Supabase to save surveys. Preview mode only shows the interface." }
  }
  const parsed = validateSurveyInput(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("save_survey", { p_payload: parsed.value })
  if (error) return { ok: false, message: cleanError(error.message) }
  const id = typeof data === "object" && data && "id" in data ? String(data.id) : ""
  if (!id) return { ok: false, message: "Could not save the survey" }
  refreshSurveyPaths(id)
  if (parsed.value.publish) redirect(`/surveys/${id}/dashboard`)
  redirect(`/create/${id}`)
}

export async function deleteDraftAction(surveyId: string): Promise<ActionResult> {
  const user = await requireUser()
  if (user.preview) return { ok: false, message: "Connect Supabase to delete drafts." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("delete_draft", { p_survey_id: surveyId })
  if (error) return { ok: false, message: cleanError(error.message) }
  refreshSurveyPaths(surveyId)
  redirect("/my-surveys")
}

export async function raiseCapAction(surveyId: string): Promise<ActionResult<{ responseCap: number; creditBalance: number }>> {
  const user = await requireUser()
  if (user.preview) return { ok: false, message: "Connect Supabase to spend credits." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("raise_cap", { p_survey_id: surveyId })
  if (error) return { ok: false, message: cleanError(error.message) }
  refreshSurveyPaths(surveyId)
  const row = data as { responseCap?: number; creditBalance?: number }
  return { ok: true, data: { responseCap: row.responseCap ?? 0, creditBalance: row.creditBalance ?? 0 } }
}

export async function promoteSurveyAction(surveyId: string): Promise<ActionResult<{ promotedUntil: string; creditBalance: number }>> {
  const user = await requireUser()
  if (user.preview) return { ok: false, message: "Connect Supabase to spend credits." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("promote_survey", { p_survey_id: surveyId })
  if (error) return { ok: false, message: cleanError(error.message) }
  refreshSurveyPaths(surveyId)
  const row = data as { promotedUntil?: string; creditBalance?: number }
  return {
    ok: true,
    data: { promotedUntil: row.promotedUntil ?? "", creditBalance: row.creditBalance ?? 0 },
  }
}

export async function closeSurveyAction(surveyId: string): Promise<ActionResult> {
  const user = await requireUser()
  if (user.preview) return { ok: false, message: "Connect Supabase to close surveys." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("close_survey", { p_survey_id: surveyId })
  if (error) return { ok: false, message: cleanError(error.message) }
  refreshSurveyPaths(surveyId)
  return { ok: true }
}

export async function toggleBookmarkAction(surveyId: string, bookmarked: boolean): Promise<ActionResult> {
  const user = await requireUser()
  if (user.preview) return { ok: true }
  const supabase = await createClient()
  const query = bookmarked
    ? supabase.from("survey_bookmarks").insert({ user_id: user.id, survey_id: surveyId })
    : supabase.from("survey_bookmarks").delete().eq("user_id", user.id).eq("survey_id", surveyId)
  const { error } = await query
  if (error) return { ok: false, message: cleanError(error.message) }
  revalidatePath("/browse")
  return { ok: true }
}

function previewStartCookie(id: string) {
  return `ff_preview_start_${id}`
}

function previewDoneCookie(id: string) {
  return `ff_preview_done_${id}`
}

export async function startResponseAction(surveyId: string): Promise<ActionResult<ResponseState>> {
  const user = await requireUser()
  if (user.preview) {
    if (!getPreviewSurvey(surveyId)) return { ok: false, message: "Survey not found" }
    const jar = await cookies()
    const done = jar.get(previewDoneCookie(surveyId))?.value
    if (done) {
      try {
        return { ok: true, data: JSON.parse(done) as ResponseState }
      } catch {
        return { ok: false, message: "Could not read the saved preview response" }
      }
    }
    let startedAt = jar.get(previewStartCookie(surveyId))?.value
    if (!startedAt) {
      startedAt = new Date().toISOString()
      jar.set(previewStartCookie(surveyId), startedAt, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      })
    }
    return {
      ok: true,
      data: {
        state: "in_progress",
        startedAt,
        status: "in_progress",
        invalidReason: null,
        creditsAwarded: 0,
      },
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("start_response", { p_survey_id: surveyId })
  if (error) return { ok: false, message: cleanError(error.message) }
  const row = data as ResponseState
  return { ok: true, data: row }
}

export async function submitResponseAction(surveyId: string, answers: unknown): Promise<ActionResult<ResponseState>> {
  const user = await requireUser()
  if (user.preview) {
    const jar = await cookies()
    const done = jar.get(previewDoneCookie(surveyId))?.value
    if (done) {
      try {
        return { ok: true, data: JSON.parse(done) as ResponseState }
      } catch {
        return { ok: false, message: "You already responded to this survey" }
      }
    }
    const startedAt = jar.get(previewStartCookie(surveyId))?.value
    if (!startedAt) return { ok: false, message: "Start the survey before submitting" }
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    const scored = scorePreview(surveyId, answers, elapsedSeconds)
    if (!scored.ok) return scored
    const state: ResponseState = {
      state: "submitted",
      startedAt,
      status: scored.data.status,
      invalidReason: scored.data.invalidReason,
      creditsAwarded: scored.data.creditsAwarded,
      elapsedSeconds: scored.data.elapsedSeconds,
    }
    jar.set(previewDoneCookie(surveyId), JSON.stringify(state), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    })
    return { ok: true, data: state }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("submit_response", {
    p_survey_id: surveyId,
    p_answers: answers,
  })
  if (error) return { ok: false, message: cleanError(error.message) }
  refreshSurveyPaths(surveyId)
  const row = data as {
    status: "valid" | "invalid"
    invalidReason: InvalidReason | null
    creditsAwarded: number
    elapsedSeconds: number
  }
  return {
    ok: true,
    data: {
      state: "submitted",
      startedAt: "",
      status: row.status,
      invalidReason: row.invalidReason,
      creditsAwarded: row.creditsAwarded,
      elapsedSeconds: row.elapsedSeconds,
    },
  }
}
