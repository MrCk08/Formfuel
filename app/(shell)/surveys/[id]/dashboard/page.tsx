import { Suspense } from "react"
import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { getDashboard, getRules } from "@/lib/data"
import { DashboardView } from "@/components/dashboard-view"
import { DataError } from "@/components/ui"

export const metadata = { title: "Survey dashboard" }

export default function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" />}>
      <DashboardContent params={params} />
    </Suspense>
  )
}

async function DashboardContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const [rules, result] = await Promise.all([getRules(user), getDashboard(user, id)])
  if (!result.ok) return <DataError message={result.message} />
  if (!result.data) notFound()
  return <DashboardView model={result.data} rules={rules} />
}
