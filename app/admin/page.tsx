import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { addAllowedUser, removeAllowedUser } from './actions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AdminSessionUser = {
  role?: string
}

export default async function AdminPage() {
  const session = await auth()
  const user = session?.user as AdminSessionUser | undefined

  if (!session) {
    redirect('/signin')
  }

  if (user?.role !== 'admin') {
    redirect('/denied')
  }

  const { data: users, error } = await supabaseAdmin
    .from('allowed_users')
    .select(
      'id, discord_user_id, role, username, global_name, avatar, created_at'
    )
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-zinc-400">
              Admin Panel
            </p>
            <h1 className="text-3xl font-bold">Pathfinders RatSpots</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Manage Discord access for admins and viewers.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="#invite-user"
              className="rounded-2xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
            >
              Invite User
            </a>

            <a
              href="/"
              className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
            >
              Back to Map
            </a>

            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/signin' })
              }}
            >
              <button
                type="submit"
                className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div
            id="invite-user"
            className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl"
          >
            <h2 className="text-xl font-semibold">Add or Update Access</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Paste a Discord user ID and choose whether they are an admin or a
              viewer.
            </p>

            <form action={addAllowedUser} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
                  Discord User ID
                </label>
                <input
                  name="discord_user_id"
                  placeholder="123456789012345678"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
                  Role
                </label>
                <select
                  name="role"
                  defaultValue="viewer"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                >
                  <option value="viewer">viewer</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl border border-emerald-500 bg-emerald-600 px-4 py-3 text-sm font-medium hover:bg-emerald-500"
              >
                Save Access
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Allowed Users</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Current Discord users with access.
                </p>
              </div>
              <div className="text-sm text-zinc-500">
                {users?.length ?? 0} total
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((row) => (
                    <tr key={row.id} className="bg-zinc-950/60">
                      <td className="rounded-l-2xl px-3 py-3">
                        <div className="flex items-center gap-3">
                          {row.avatar ? (
                            <img
                              src={row.avatar}
                              alt={
                                row.global_name ||
                                row.username ||
                                row.discord_user_id
                              }
                              className="h-10 w-10 rounded-full border border-zinc-700 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs text-zinc-400">
                              ?
                            </div>
                          )}

                          <div>
                            <div className="font-medium">
                              {row.global_name ||
                                row.username ||
                                'Has not logged in yet'}
                            </div>
                            <div className="font-mono text-xs text-zinc-500">
                              {row.username
                                ? `@${row.username}`
                                : row.discord_user_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            row.role === 'admin'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-700 text-white'
                          }`}
                        >
                          {row.role}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-zinc-400">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : '—'}
                      </td>

                      <td className="rounded-r-2xl px-3 py-3">
                        <form action={removeAllowedUser}>
                          <input
                            type="hidden"
                            name="discord_user_id"
                            value={row.discord_user_id}
                          />
                          <button
                            type="submit"
                            className="rounded-xl border border-red-700 bg-red-900/60 px-3 py-2 text-xs font-medium hover:bg-red-800/70"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}

                  {(!users || users.length === 0) && (
                    <tr>
                      <td
                        colSpan={4}
                        className="rounded-2xl bg-zinc-950/60 px-3 py-6 text-center text-zinc-500"
                      >
                        No allowed users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}