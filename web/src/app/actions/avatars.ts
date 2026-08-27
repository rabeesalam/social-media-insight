'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type DeleteAvatarState = { error: string } | undefined

// RLS (avatars_admin_write, 0005_rls_policies.sql) is the actual enforcement here — a non-admin
// calling this gets a Postgres permission error, not a UI-level check we could get wrong. The
// delete cascades to platform_connections -> platform_content -> metric_snapshots automatically
// (all declared `on delete cascade` in the schema), so this one call is genuinely everything.
export async function deleteAvatar(_prevState: DeleteAvatarState, formData: FormData): Promise<DeleteAvatarState> {
  const avatarId = formData.get('avatarId')
  if (typeof avatarId !== 'string' || !avatarId) {
    return { error: 'Missing avatar id.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('avatars').delete().eq('id', avatarId)

  if (error) {
    return { error: error.message.includes('permission') ? 'Only admins can delete avatars.' : error.message }
  }

  redirect('/dashboard')
}
