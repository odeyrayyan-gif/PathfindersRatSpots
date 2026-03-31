import NextAuth from "next-auth"
import Discord from "next-auth/providers/discord"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Discord],

  pages: {
    signIn: "/signin",
    error: "/denied",
  },

  callbacks: {
    async signIn({ profile }) {
      const discordId = profile?.id

      if (!discordId || typeof discordId !== "string") {
        return false
      }

      const { data, error } = await supabaseAdmin
        .from("allowed_users")
        .select("role")
        .eq("discord_user_id", discordId)
        .single()

      if (error || !data) {
        return false
      }

      return true
    },

    async jwt({ token, profile }) {
      if (profile?.id && typeof profile.id === "string") {
        const { data } = await supabaseAdmin
          .from("allowed_users")
          .select("role")
          .eq("discord_user_id", profile.id)
          .single()

        if (data?.role) {
          token.role = data.role
          token.discordId = profile.id
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string | undefined
        session.user.discordId = token.discordId as string | undefined
      }
      return session
    },

    authorized({ auth, request }) {
      const { pathname } = request.nextUrl

      const isPublic =
        pathname === "/signin" ||
        pathname === "/denied" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico"

      if (isPublic) return true

      return !!auth
    },
  },
})