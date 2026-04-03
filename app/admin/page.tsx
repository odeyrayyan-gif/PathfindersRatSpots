export const dynamic = 'force-dynamic'

import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import {
  addAllowedUser,
  removeAllowedUser,
  updateAllowedUserRole,
} from './actions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AdminSessionUser = {
  role?: string
}

const FIXED_ROLES = [
  { name: 'MG', icon: '/icons/hll/machine-gunner.png' },
  { name: 'Infantry', icon: '/icons/hll/rifleman.png' },
  { name: 'Tank', icon: '/icons/hll/tank.png' },
  { name: 'Sniper', icon: '/icons/hll/sniper.png' },
  { name: 'Anti-Tank', icon: '/icons/hll/anti-tank.png' },
  { name: 'Anti-Tank Gun', icon: '/icons/hll/anti-tank-gun.png' },
] as const

export default async function AdminPage() {
  const session = await auth()
  const user = session?.user as AdminSessionUser | undefined

  if (!session) redirect('/signin')
  if (user?.role !== 'admin') redirect('/denied')

  const { data: users, error: usersError } = await supabaseAdmin
    .from('allowed_users')
    .select('id, discord_user_id, role, username, global_name, avatar, created_at')
    .order('created_at', { ascending: true })

  if (usersError) throw new Error(usersError.message)

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-zinc-400">Role Editor &amp; Invite Panel</p>
            <h1 className="text-3xl font-bold">Pathfinders RatSpots</h1>
            <p className="mt-2 text-sm text-zinc-400">Access control plus a locked preset role pack.</p>
          </div>
          <div className="flex gap-2">
            <a href="/" className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
              Back to Map
            </a>
            <form action={async () => { 'use server'; await signOut({ redirectTo: '/signin' }) }}>
              <button type="submit" className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
                Sign Out
              </button>
            </form>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">

          {/* Left column */}
          <div className="space-y-6">

            {/* Add user form */}
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl">
              <h2 className="text-xl font-semibold">Add or Update Access</h2>
              <p className="mt-2 text-sm text-zinc-400">Paste a Discord user ID and choose their role.</p>
              <form action={addAllowedUser} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">Discord User ID</label>
                  <input
                    name="discord_user_id"
                    placeholder="123456789012345678"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">Role</label>
                  <select
                    name="role"
                    defaultValue="viewer"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                  >
                    <option value="viewer">viewer</option>
                    <option value="contributor">contributor</option>
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

            {/* Preset roles */}
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl">
              <h2 className="text-xl font-semibold">Preset Roles</h2>
              <p className="mt-2 text-sm text-zinc-400">These roles are locked and tied directly to their icons.</p>
              <div className="mt-5 space-y-3">
                {FIXED_ROLES.map((role) => (
                  <div key={role.name} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900">
                      <img src={role.icon} alt={role.name} className="h-7 w-7 object-contain" />
                    </div>
                    <div className="text-sm font-medium">{role.name}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right column — users table */}
          <div>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Allowed Users</h2>
                  <p className="mt-1 text-sm text-zinc-400">Current Discord users with access.</p>
                </div>
                <div className="text-sm text-zinc-500">{users?.length ?? 0} total</div>
              </div>

              {/* Role legend */}
              <div className="mb-4 flex flex-wrap gap-3 text-xs">
                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-400">viewer — read only</span>
                <span className="rounded-full border border-blue-700 bg-blue-900/40 px-3 py-1 text-blue-300">contributor — add &amp; edit spots</span>
                <span className="rounded-full border border-emerald-700 bg-emerald-900/40 px-3 py-1 text-emerald-300">admin — full access + delete</span>
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

                        {/* Avatar + name */}
                        <td className="rounded-l-2xl px-3 py-3">
                          <div className="flex items-center gap-3">
                            {row.avatar ? (
                              <img src={row.avatar} alt={row.global_name || row.username || row.discord_user_id}
                                className="h-10 w-10 rounded-full border border-zinc-700 object-cover" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs text-zinc-400">?</div>
                            )}
                            <div>
                              <div className="font-medium">{row.global_name || row.username || 'Has not logged in yet'}</div>
                              <div className="font-mono text-xs text-zinc-500">{row.username ? `@${row.username}` : row.discord_user_id}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role selector — key={row.role} forces remount when role changes */}
                        <td className="px-3 py-3">
                          <form action={updateAllowedUserRole} className="flex items-center gap-2">
                            <input type="hidden" name="discord_user_id" value={row.discord_user_id} />
                            <select
                              key={row.role}
                              name="role"
                              defaultValue={row.role}
                              className="rounded-xl border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs outline-none"
                            >
                              <option value="viewer">viewer</option>
                              <option value="contributor">contributor</option>
                              <option value="admin">admin</option>
                            </select>
                            <button type="submit" className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs hover:bg-zinc-700">
                              Update
                            </button>
                          </form>
                        </td>

                        {/* Created */}
                        <td className="px-3 py-3 text-zinc-400">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                        </td>

                        {/* Remove */}
                        <td className="rounded-r-2xl px-3 py-3">
                          <form action={removeAllowedUser}>
                            <input type="hidden" name="discord_user_id" value={row.discord_user_id} />
                            <button type="submit" className="rounded-xl border border-red-700 bg-red-900/60 px-3 py-2 text-xs font-medium hover:bg-red-800/70">
                              Remove
                            </button>
                          </form>
                        </td>

                      </tr>
                    ))}

                    {(!users || users.length === 0) && (
                      <tr>
                        <td colSpan={4} className="rounded-2xl bg-zinc-950/60 px-3 py-6 text-center text-zinc-500">
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
      </div>
    </main>
  )
}