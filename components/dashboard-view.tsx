"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { closeSurveyAction, fundSurveyAction, promoteSurveyAction } from "@/lib/actions"
import {
  creditUnit,
  creditWord,
  creditsNeededForNextSlot,
  formatMinTime,
  responseCapForCredits,
  type ProductRules,
} from "@/lib/config"
import { invalidReasonLabel, statusLabel } from "@/lib/labels"
import type { DashboardModel } from "@/lib/types"
import { SearchCode, TagList } from "@/components/survey-meta"
import { ArrowIcon, ChartIcon, CheckIcon, CrossIcon, DownloadIcon, MegaphoneIcon, PeopleIcon } from "@/components/icons"

export function DashboardView({
  model,
  rules,
  justPublished = false,
}: {
  model: DashboardModel
  rules: ProductRules
  justPublished?: boolean
}) {
  const unit = creditUnit(model.questionCount, rules.questionsPerCredit)
  const needed = creditsNeededForNextSlot(model.creditsAllocated, model.questionCount, rules.questionsPerCredit)
  const [addCredits, setAddCredits] = useState(needed)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<"promote" | "fund" | "close" | null>(null)
  const [pending, startTransition] = useTransition()
  const nextCap = responseCapForCredits(model.creditsAllocated + addCredits, model.questionCount, rules.questionsPerCredit)
  const addsSlot = nextCap > model.responseCap
  const [chartId, setChartId] = useState(model.distributions[0]?.questionId ?? "")
  const chart = model.distributions.find((item) => item.questionId === chartId) ?? model.distributions[0]
  const axisMax = chart ? Math.max(10, ...chart.rows.map((row) => row.percent)) : 100
  const niceMax = Math.min(100, Math.ceil(axisMax / 10) * 10)

  function run(action: "promote" | "fund" | "close") {
    setError(null)
    startTransition(async () => {
      if (action === "promote") {
        const result = await promoteSurveyAction(model.id)
        if (!result.ok) setError(result.message)
        else setNotice("This survey is promoted.")
      } else if (action === "fund") {
        const result = await fundSurveyAction(model.id, addCredits)
        if (!result.ok) setError(result.message)
        else setNotice(`Response cap is now ${result.data?.responseCap}.`)
      } else {
        const result = await closeSurveyAction(model.id)
        if (!result.ok) setError(result.message)
        else setNotice("Survey closed. It no longer accepts responses.")
      }
      setConfirm(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{model.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SearchCode code={model.searchCode} />
            <TagList tags={model.tags} linked />
          </div>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line">
            <span className={`h-2 w-2 rounded-full ${model.status === "open" ? "bg-amber" : "bg-muted"}`} />
            {statusLabel(model.status)}
            {model.isPromoted ? <span className="text-amber-deep">· Promoted</span> : null}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-80">
          <Link href={`/surveys/${model.id}/export`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold">
            <DownloadIcon /> Download CSV
          </Link>
          <button
            type="button"
            onClick={() => setConfirm("promote")}
            disabled={model.status !== "open" || pending}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amber/30 bg-amber-soft text-sm font-semibold"
          >
            <MegaphoneIcon /> Promote survey · {rules.promoteCost} credits
          </button>
          <div className="rounded-2xl border border-amber/30 bg-[#fbf6ee] p-3 text-sm">
            <p className="font-semibold">Add response credits</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {model.creditsAllocated} {creditWord(model.creditsAllocated)} allocated · cap {model.responseCap}. Each response costs {unit}{" "}
              {creditWord(unit)}. Minimum time is {formatMinTime(model.minCompletionSeconds)}.
            </p>
            <label className="mt-2 block text-xs text-muted">
              Credits to add
              <input
                type="number"
                min={1}
                step={1}
                value={addCredits}
                onChange={(event) => setAddCredits(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </label>
            <p className="mt-2 text-xs text-muted">
              {addsSlot
                ? `New cap: ${nextCap} (${nextCap - model.responseCap} more ${nextCap - model.responseCap === 1 ? "response" : "responses"}).`
                : `Add at least ${needed} ${creditWord(needed)} to fund another response.`}
            </p>
            <button
              type="button"
              onClick={() => setConfirm("fund")}
              disabled={model.status !== "open" || pending || !addsSlot}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber/30 bg-white text-sm font-semibold disabled:opacity-50"
            >
              <ArrowIcon /> Add {addCredits} {creditWord(addCredits)}
            </button>
          </div>
        </div>
      </div>

      {justPublished ? (
        <div className="rounded-2xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm">
          <p className="font-semibold">Survey published</p>
          <p className="mt-1">
            Students can find it by searching for code {model.searchCode}. You allocated {model.creditsAllocated}{" "}
            {creditWord(model.creditsAllocated)}, which funds {model.responseCap}{" "}
            {model.responseCap === 1 ? "response" : "responses"}.
          </p>
        </div>
      ) : null}

      {confirm ? (
        <div className="rounded-2xl border border-line bg-white p-4 text-sm">
          <p>
            {confirm === "promote"
              ? `Spend ${rules.promoteCost} credits to feature this survey for ${rules.promoteDays} days?`
              : confirm === "fund"
                ? `Spend ${addCredits} ${creditWord(addCredits)} to raise the cap from ${model.responseCap} to ${nextCap}?`
                : "Close this survey? People will no longer be able to answer it."}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => run(confirm)} disabled={pending} className="rounded-xl bg-amber px-4 py-2 font-semibold text-white">
              {pending ? "Working…" : "Confirm"}
            </button>
            <button type="button" onClick={() => setConfirm(null)} className="rounded-xl border border-line px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<PeopleIcon />} value={String(model.submitted)} label="responses" />
        <Stat icon={<ChartIcon />} value={`${model.completionRate}%`} label="completion rate" />
        <Stat icon={<CheckIcon />} value={String(model.valid)} label="valid" />
        <Stat icon={<CrossIcon />} value={String(model.invalid)} label="invalid (too fast or failed screening)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-line bg-white p-5">
          {chart ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{chart.prompt}</h2>
                  <p className="mt-1 text-sm text-muted">Option distribution (n = {chart.total})</p>
                </div>
                {model.distributions.length > 1 ? (
                  <label className="text-xs text-muted">
                    Question
                    <select
                      value={chart.questionId}
                      onChange={(event) => setChartId(event.target.value)}
                      className="mt-1 block rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink"
                    >
                      {model.distributions.map((item, index) => (
                        <option key={item.questionId} value={item.questionId}>
                          Q{index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="mt-5 space-y-3">
                {chart.rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className="truncate text-muted">{row.label}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-[#f3eee6]">
                      <div className="h-full rounded-full bg-amber" style={{ width: `${(row.percent / niceMax) * 100}%` }} />
                    </div>
                    <span className="tabular-nums text-muted">
                      {row.percent}% ({row.count})
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between text-xs text-muted">
                <span>0%</span>
                <span>Percentage of responses</span>
                <span>{niceMax}%</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Short answers are listed in the CSV and the recent responses.</p>
          )}
        </section>
        <section className="rounded-3xl border border-line bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent answers</h2>
            <Link href={`/surveys/${model.id}/export`} className="text-sm font-medium text-muted">
              View all responses →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Validity</th>
                  {model.previewColumns.map((column) => (
                    <th key={column} className="pb-2 font-medium">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.recent.length === 0 ? (
                  <tr>
                    <td colSpan={2 + model.previewColumns.length} className="py-6 text-muted">
                      No submitted responses yet.
                    </td>
                  </tr>
                ) : (
                  model.recent.map((row) => (
                    <tr key={row.id} className="border-t border-line/80">
                      <td className="py-3 text-muted">{row.whenLabel}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "valid" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
                          {row.status === "valid" ? "Valid" : "Invalid"}
                        </span>
                        {row.invalidReason ? <span className="sr-only">{invalidReasonLabel(row.invalidReason)}</span> : null}
                      </td>
                      {row.cells.map((cell, cellIndex) => (
                        <td key={`${row.id}-${cellIndex}`} className="py-3">{cell}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {model.status === "open" ? (
        <button type="button" onClick={() => setConfirm("close")} className="text-sm text-muted underline">
          Close survey
        </button>
      ) : null}
    </div>
  )
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-line bg-white p-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-soft text-amber-deep">{icon}</span>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}
