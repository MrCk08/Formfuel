export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  if (!url || !key) return false
  const lowered = `${url} ${key}`.toLowerCase()
  if (
    lowered.includes("placeholder") ||
    lowered.includes("your-project") ||
    lowered.includes("your-anon") ||
    lowered.includes("example")
  ) {
    return false
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    )
  }
  return { url, key }
}
