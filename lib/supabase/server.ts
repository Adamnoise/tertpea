import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Components cannot always write cookies; proxy handles refreshes.
          }
        },
      },
    },
  )
}

export type WinmixDataVersion = {
  version_key: string
  status: string
  is_current: boolean
  season_count: number | null
  match_count: number | null
  source_description: string | null
  sealed_at: string | null
  updated_at: string
}

export async function getWinmixDataVersions() {
  const supabase = await createClient()

  return supabase
    .from('winmix_data_versions')
    .select(
      'version_key, status, is_current, season_count, match_count, source_description, sealed_at, updated_at',
    )
    .order('is_current', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(10)
}

export async function getCurrentWinmixDataVersion() {
  const supabase = await createClient()

  return supabase
    .from('winmix_data_versions')
    .select(
      'version_key, status, is_current, season_count, match_count, source_description, sealed_at, updated_at',
    )
    .eq('is_current', true)
    .maybeSingle()
}
