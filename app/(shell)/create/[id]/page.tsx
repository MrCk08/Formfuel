import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { getEditorSurvey, getRules } from "@/lib/data"
import { CreateForm } from "@/components/create-form"
import { DataError } from "@/components/ui"

export const metadata = { title: "Edit survey" }

export default function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" />}>
      <EditContent params={params} />
    </Suspense>
  )
}

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const rules = await getRules(user)
  const result = await getEditorSurvey(user, id)
  if (!result.ok) return <DataError message={result.message} />
  if (!result.data) notFound()
  if (result.data.status !== "draft") redirect(`/surveys/${id}/dashboard`)

  return (
    <div>
      <h1 className="mb-6 text-4xl font-semibold tracking-tight">Edit draft</h1>
      <CreateForm
        rules={rules}
        initial={{
          id: result.data.id,
          title: result.data.title,
          description: result.data.description,
          tags: result.data.tags,
          questions: result.data.questions,
          responseCap: result.data.responseCap,
        }}
      />
    </div>
  )
}
