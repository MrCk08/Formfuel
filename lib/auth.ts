import { cache } from "react"
import { redirect } from "next/navigation"
import { previewUser } from "@/lib/preview"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import type { AppUser } from "@/lib/types"

function initialsFrom(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
  return letters || "S"
}

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  if (!isSupabaseConfigured()) return previewUser

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (error || !userId) return null

  const email = typeof data.claims.email === "string" ? data.claims.email : null
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, credit_balance, free_creates_remaining")
    .eq("id", userId)
    .maybeSingle()

  const displayName = profile?.display_name || email?.split("@")[0] || "Student"
  return {
    id: userId,
    email,
    displayName,
    avatarUrl: profile?.avatar_url ?? null,
    initials: initialsFrom(displayName),
    creditBalance: profile?.credit_balance ?? 0,
    freeCreatesRemaining: profile?.free_creates_remaining ?? 0,
    preview: false,
  }
})

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  return user
}
