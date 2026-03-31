import NextAuth from 'next-auth'
import Discord from 'next-auth/providers/discord'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Discord],
  pages: {
    signIn: '/signin',
    error: '/denied',
  },
  callbacks: {
    async signIn({ profile }) {
      const discordId = profile?.id

      if (!discordId || typeof discordId !== 'string') {
        return false
      }

      const { data, error } = await supabaseAdmin
        .from('allowed_users')
        .select('role')
        .eq('discord_user_id', discordId)
        .single()

      if (error || !data) {
        return false
      }

      const username =
        typeof (profile as any)?.username === 'string'
          ? (profile as any).username
          : null

      const globalName =
        typeof (profile as any)?.global_name === 'string'
          ? (profile as any).global_name
          : null

      const avatarHash =
        typeof (profile as any)?.avatar === 'string'
          ? (profile as any).avatar
          : null

      const avatar = avatarHash
        ? `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`
        : null

      await supabaseAdmin
        .from('allowed_users')
        .update({
          username,
          global_name: globalName,
          avatar,
        })
        .eq('discord_user_id', discordId)

      return true
    },

    async jwt({ token, profile }) {
      const discordId =
        profile?.id && typeof profile.id === 'string'
          ? profile.id
          : (token.discordId as string | undefined)

      if (discordId) {
        const { data } = await supabaseAdmin
          .from('allowed_users')
          .select('role, username, global_name, avatar')
          .eq('discord_user_id', discordId)
          .single()

        if (data) {
          token.role = data.role
          token.discordId = discordId
          token.username = data.username
          token.globalName = data.global_name
          token.avatar = data.avatar
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string | undefined
        session.user.discordId = token.discordId as string | undefined
        session.user.username = token.username as string | undefined
        session.user.globalName = token.globalName as string | undefined
        session.user.image =
          (token.avatar as string | undefined) ?? session.user.image
      }

      return session
    },

    authorized({ auth, request }) {
      const { pathname } = request.nextUrl

      const isPublic =
        pathname === '/signin' ||
        pathname === '/denied' ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/_next') ||
        pathname === '/favicon.ico'

      if (isPublic) return true

      return !!auth
    },
  },
})