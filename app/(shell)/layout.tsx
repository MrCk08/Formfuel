import { Suspense } from "react"
import { Header, HeaderFallback } from "@/components/header"
import { PreviewBanner } from "@/components/ui"

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PreviewBanner />
      <Suspense fallback={<HeaderFallback />}>
        <Header />
      </Suspense>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </>
  )
}
