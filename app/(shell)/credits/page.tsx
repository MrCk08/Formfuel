import { Suspense } from "react"
import { requireUser } from "@/lib/auth"
import { getRules, listLedger } from "@/lib/data"
import { creditWord, formatMinTime } from "@/lib/config"
import { ledgerReasonLabel } from "@/lib/labels"
import { DataError } from "@/components/ui"

export const metadata = { title: "Credits" }

export default function CreditsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-white" />}>
      <CreditsContent />
    </Suspense>
  )
}

async function CreditsContent() {
  const user = await requireUser()
  const [rules, ledger] = await Promise.all([getRules(user), listLedger(user)])
  if (!ledger.ok) return <DataError message={ledger.message} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Credits</h1>
        <p className="mt-2 max-w-2xl text-muted">
          New accounts start with {rules.startingCredits} {creditWord(rules.startingCredits)}. One credit covers{" "}
          {rules.questionsPerCredit} questions, so a response costs ceil(questions ÷ {rules.questionsPerCredit}) credits
          and a valid completion earns that same amount. You fund a survey by allocating credits to it.
        </p>
      </div>
      <p className="text-5xl font-semibold text-amber-deep">{user.creditBalance}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Starting balance" value={`${rules.startingCredits} credits, once`} />
        <Info label="Credit size" value={`${rules.questionsPerCredit} questions`} />
        <Info label="Valid answer" value="Same as one response slot" />
        <Info label="Promote" value={`${rules.promoteCost} credits / ${rules.promoteDays} days`} />
        <Info
          label="Minimum time"
          value={`Up to ${rules.minSecondsPerQuestion}s per question, default ${formatMinTime(rules.defaultMinCompletionSeconds)}`}
        />
      </dl>
      <div className="overflow-x-auto rounded-3xl border border-line bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Survey</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-muted">
                  No credit activity yet. Answer a survey to earn some.
                </td>
              </tr>
            ) : (
              ledger.data.map((entry) => (
                <tr key={entry.id} className="border-t border-line">
                  <td className="px-4 py-3 text-muted">{entry.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-3">{ledgerReasonLabel(entry.reason)}</td>
                  <td className="px-4 py-3">{entry.surveyTitle ?? "—"}</td>
                  <td className={`px-4 py-3 font-semibold ${entry.amount > 0 ? "text-ok" : "text-ink"}`}>
                    {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                  </td>
                  <td className="px-4 py-3">{entry.balanceAfter}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  )
}
