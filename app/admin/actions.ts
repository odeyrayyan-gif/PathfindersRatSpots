'use server'

import { auth } from '@/auth'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AdminSessionUser = {
  discordId?: string
  role?: string
}

const VALID_ROLES = ['viewer', 'contributor', 'admin'] as const
type ValidRole = typeof VALID_ROLES[number]

function isValidRole(role: string): role is ValidRole {
  return VALID_ROLES.includes(role as ValidRole)
}

async function requireAdmin() {
  const session = await auth()
  const user = session?.user as AdminSessionUser | undefined

  // Only check role — discordId may not be in older cached tokens
  if (!session || user?.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  return user
}

export async function addAllowedUser(formData: FormData) {
  await requireAdmin()

  const discordUserId = String(formData.get('discord_user_id') || '').trim()
  const role = String(formData.get('role') || '').trim()

  if (!discordUserId) return
  if (!/^\d+$/.test(discordUserId)) return
  if (!isValidRole(role)) return

  const { error } = await supabaseAdmin.from('allowed_users').upsert(
    { discord_user_id: discordUserId, role },
    { onConflict: 'discord_user_id' }
  )

  if (error) throw new Error(error.message)

  redirect('/admin')
}

export async function removeAllowedUser(formData: FormData) {
  await requireAdmin()

  const discordUserId = String(formData.get('discord_user_id') || '').trim()
  if (!discordUserId) return

  const { error } = await supabaseAdmin
    .from('allowed_users')
    .delete()
    .eq('discord_user_id', discordUserId)

  if (error) throw new Error(error.message)

  redirect('/admin')
}

export async function updateAllowedUserRole(formData: FormData) {
  await requireAdmin()

  const discordUserId = String(formData.get('discord_user_id') || '').trim()
  const role = String(formData.get('role') || '').trim()

  if (!discordUserId) return
  if (!isValidRole(role)) return

  const { error } = await supabaseAdmin
    .from('allowed_users')
    .update({ role })
    .eq('discord_user_id', discordUserId)

  if (error) throw new Error(error.message)

  redirect('/admin')
}