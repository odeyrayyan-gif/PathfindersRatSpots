'use server'

import { auth } from '@/auth'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AdminSessionUser = {
  discordId?: string
  role?: string
}

async function requireAdmin() {
  const session = await auth()
  const user = session?.user as AdminSessionUser | undefined

  if (!user?.discordId || user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  return user
}

export async function addAllowedUser(formData: FormData) {
  await requireAdmin()

  const discordUserId = String(formData.get('discord_user_id') || '').trim()
  const role = String(formData.get('role') || '').trim()

  if (!discordUserId) {
    throw new Error('Discord ID is required')
  }

  if (!/^\d+$/.test(discordUserId)) {
    throw new Error('Discord ID must be numbers only')
  }

  if (role !== 'admin' && role !== 'viewer') {
    throw new Error('Role must be admin or viewer')
  }

  const { error } = await supabaseAdmin.from('allowed_users').upsert(
    {
      discord_user_id: discordUserId,
      role,
    },
    { onConflict: 'discord_user_id' }
  )

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/admin')
}

export async function removeAllowedUser(formData: FormData) {
  const user = await requireAdmin()

  const discordUserId = String(formData.get('discord_user_id') || '').trim()

  if (!discordUserId) {
    throw new Error('Discord ID is required')
  }

  if (discordUserId === user.discordId) {
    throw new Error('You cannot remove your own admin access here')
  }

  const { error } = await supabaseAdmin
    .from('allowed_users')
    .delete()
    .eq('discord_user_id', discordUserId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/admin')
}