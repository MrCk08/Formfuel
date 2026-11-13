"use client"

import { useState } from "react"
import { GoogleMark } from "@/components/icons"
import { btnPrimary } from "@/components/ui"
import { createClient } from "@/lib/supabase/client"
import { isSupabaseConfigured } from "@/lib/supabase/env"

export function SignInButton({ next = "/browse" }: { next?: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    if (!isSupabaseConfigured()) {
      setError("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then enable Google in Supabase.")
      return
    }
    setPending(true)
    setError(null)
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })
    if (authError) {
      setPending(false)
      setError(authError.message)
    }
  }

  return (
    <div>
      <button type="button" className={btnPrimary} onClick={signIn} disabled={pending}>
        <GoogleMark />
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error ? (
        <p className="mt-3 max-w-sm text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
