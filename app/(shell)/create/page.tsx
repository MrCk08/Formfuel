import { Suspense } from "react"
import { requireUser } from "@/lib/auth"
import { getRules } from "@/lib/data"
import { CreateForm } from "@/components/create-form"
import { exampleSurvey } from "@/lib/survey-form"

export const metadata = { title: "Create" }

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" />}>
      <CreateContent />
    </Suspense>
  )
}

async function CreateContent() {
  const user = await requireUser()
  const rules = await getRules(user)
  const example = user.preview ? exampleSurvey() : null
  return (
    <div>
      <h1 className="mb-6 text-4xl font-semibold tracking-tight">Create a survey</h1>
      <CreateForm
        rules={rules}
        initial={
          example
            ? {
                title: example.title,
                description: example.description,
                tags: example.tags,
                questions: example.questions,
                responseCap: rules.defaultResponseCap,
              }
            : { title: "", description: "", tags: [], questions: [], responseCap: rules.defaultResponseCap }
        }
      />
    </div>
  )
}
