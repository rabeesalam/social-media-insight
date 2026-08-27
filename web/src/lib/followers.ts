import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountMetricSnapshot } from '@/types/database'

// Latest known follower count per platform connection, regardless of any time-range filter —
// followers are a point-in-time account stat, not something to sum/window like content metrics.
export async function latestFollowersByConnection(
  supabase: SupabaseClient,
  connectionIds: string[]
): Promise<Map<string, number | null>> {
  if (connectionIds.length === 0) return new Map()

  const { data: accountSnapshots } = await supabase
    .from('account_metric_snapshots')
    .select('platform_connection_id, captured_at, followers')
    .in('platform_connection_id', connectionIds)
    .returns<AccountMetricSnapshot[]>()

  const latestPerConnection = new Map<string, AccountMetricSnapshot>()
  for (const row of accountSnapshots ?? []) {
    const existing = latestPerConnection.get(row.platform_connection_id)
    if (!existing || row.captured_at > existing.captured_at) latestPerConnection.set(row.platform_connection_id, row)
  }

  return new Map(Array.from(latestPerConnection.entries()).map(([id, s]) => [id, s.followers]))
}
