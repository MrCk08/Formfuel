"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { SurveyCard } from "@/components/survey-card"
import { EmptyState, btnPrimary } from "@/components/ui"
import type { SurveyCardData } from "@/lib/types"

function matches(survey: SurveyCardData, query: string) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  const compact = text.replace(/\s+/g, "")
  if (survey.searchCode.toLowerCase().includes(compact)) return true
  if (survey.title.toLowerCase().includes(text)) return true
  return survey.tags.some((tag) => tag.toLowerCase().includes(text))
}

export function BrowseBoard({
  promoted,
  rest,
  initialQuery = "",
  promoteCost,
  promoteDays,
}: {
  promoted: SurveyCardData[]
  rest: SurveyCardData[]
  initialQuery?: string
  promoteCost: number
  promoteDays: number
}) {
  const [query, setQuery] = useState(initialQuery)
  const all = useMemo(() => [...promoted, ...rest], [promoted, rest])
  const tags = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const survey of all) {
      for (const tag of survey.tags) {
        const key = tag.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        list.push(tag)
      }
    }
    return list.sort((a, b) => a.localeCompare(b)).slice(0, 16)
  }, [all])
  const searching = query.trim().length > 0
  const results = searching ? all.filter((survey) => matches(survey, query)) : []
  const empty = all.length === 0

  return (
    <div className="space-y-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="pt-2">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Find a survey. Earn credits.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-muted">
            Search by a survey’s code or a tag. A valid answer earns credits based on how many questions you complete.
          </p>
        </div>
        {searching ? (
          <section className="rounded-3xl border border-dashed border-line bg-cream p-6 text-sm text-muted">
            Matches for “{query.trim()}” are listed below, including promoted surveys.
          </section>
        ) : promoted.length > 0 ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Promoted</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {promoted.map((survey) => (
                <SurveyCard key={survey.id} survey={survey} featured />
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-line bg-cream p-6 text-sm text-muted">
            Promoted surveys show up here. Featuring one costs {promoteCost} credits and lasts {promoteDays} days.
          </section>
        )}
      </div>

      <section>
        <div className="flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-sm font-semibold">{searching ? "Search results" : "Browse all surveys"}</h2>
          <label className="block w-full sm:max-w-sm">
            <span className="sr-only">Search by code, tag, or title</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by code, tag, or title"
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none ring-amber focus:ring-2"
            />
          </label>
        </div>
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const selected = query.trim().toLowerCase() === tag.toLowerCase()
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setQuery(selected ? "" : tag)}
                  className={`rounded-full px-2.5 py-1 text-xs ${selected ? "bg-amber-soft font-semibold text-ink" : "bg-chip text-muted"}`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        ) : null}
        {empty ? (
          <div className="mt-4">
            <EmptyState
              title="No open surveys yet"
              body="Publish the first questionnaire and other students can start answering it."
              action={
                <Link href="/create" className={btnPrimary}>
                  Create a survey
                </Link>
              }
            />
          </div>
        ) : searching && results.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No matching surveys" body="Try the full search code, or a tag from the list above." />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(searching ? results : rest).map((survey) => (
              <SurveyCard key={survey.id} survey={survey} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
