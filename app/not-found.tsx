import Link from "next/link"
import { btnPrimary } from "@/components/ui"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-semibold">That page is not here</h1>
      <p className="mt-3 text-sm text-muted">The survey may be closed, or the link is wrong.</p>
      <Link href="/browse" className={`${btnPrimary} mt-6`}>
        Browse surveys
      </Link>
    </main>
  )
}
