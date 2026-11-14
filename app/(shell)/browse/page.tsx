import { Suspense } from "react"
import { requireUser } from "@/lib/auth"
import { getRules, listBrowse } from "@/lib/data"
import { BrowseBoard } from "@/components/browse-board"
import { DataError } from "@/components/ui"

export const metadata = { title: "Browse" }

export default function BrowsePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-white" />}>
      <BrowseContent searchParams={searchParams} />
    </Suspense>
  )
}

async function BrowseContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams])
  const [rules, result] = await Promise.all([getRules(user), listBrowse(user)])
  if (!result.ok) return <DataError message={result.message} />
  return (
    <BrowseBoard
      promoted={result.data.promoted}
      rest={result.data.rest}
      initialQuery={params.q ?? ""}
      promoteCost={rules.promoteCost}
      promoteDays={rules.promoteDays}
    />
  )
}
