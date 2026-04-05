'use client'

import React from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type MapSummary = {
  id: string
  name: string
  image: string
  previewImage: string
  spotCount: number
  lastActivity: string | null
  lastActivityBy: string | null
}

type FeedItem = {
  id: number
  spot_id: number
  spot_title: string
  map_id: string
  map_name: string
  changed_by_name: string
  changed_at: string
}

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function getPreviewImagePath(imagePath: string): string {
  if (!imagePath) return imagePath
  const clean = imagePath.split('?')[0]
  const match = clean.match(/^(.*)(\.[^.]+)$/)
  if (!match) return imagePath
  return `${match[1]}-preview${match[2]}`
}


export default function HomePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userName  = session?.user?.name ?? ''
  const userRole  = (session?.user as any)?.role ?? 'viewer'

  const [maps,        setMaps]        = React.useState<MapSummary[]>([])
  const [feed,        setFeed]        = React.useState<FeedItem[]>([])
  const [loading,       setLoading]       = React.useState(true)
  const [feedLoading,   setFeedLoading]   = React.useState(true)
  const [enteringMapId, setEnteringMapId] = React.useState<string | null>(null)
  const [, forceRender] = React.useReducer(x => x + 1, 0)

  // Re-render every minute so timestamps stay fresh
  React.useEffect(() => {
    const t = setInterval(forceRender, 60_000)
    return () => clearInterval(t)
  }, [])

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: mapsData }, { data: spotsData }] = await Promise.all([
        supabase.from('maps').select('id, name, image').order('name'),
        supabase.from('spots').select('map_id, created_at').order('created_at', { ascending: false }),
      ])

      const spotsByMap: Record<string, { count: number }> = {}
      for (const s of spotsData || []) {
        if (!spotsByMap[s.map_id]) spotsByMap[s.map_id] = { count: 0 }
        spotsByMap[s.map_id].count++
      }

      // Get last activity per map from spot_history
      const { data: historyData } = await supabase
        .from('spot_history')
        .select('snapshot, changed_by_name, changed_at')
        .order('changed_at', { ascending: false })
        .limit(100)

      const lastActivityByMap: Record<string, { at: string; by: string }> = {}
      for (const h of historyData || []) {
        const mapId = h.snapshot?.map_id
        if (mapId && !lastActivityByMap[mapId]) {
          lastActivityByMap[mapId] = { at: h.changed_at, by: h.changed_by_name }
        }
      }

      const summaries: MapSummary[] = (mapsData || []).map((m) => ({
        id:             m.id,
        name:           m.name,
        image:          m.image,
        previewImage:   getPreviewImagePath(m.image),
        spotCount:      spotsByMap[m.id]?.count ?? 0,
        lastActivity:   lastActivityByMap[m.id]?.at ?? null,
        lastActivityBy: lastActivityByMap[m.id]?.by ?? null,
      }))

      setMaps(summaries)
      setLoading(false)
    }
    load()
  }, [])

  React.useEffect(() => {
    async function loadFeed() {
      setFeedLoading(true)
      const { data } = await supabase
        .from('spot_history')
        .select('id, spot_id, snapshot, changed_by_name, changed_at')
        .order('changed_at', { ascending: false })
        .limit(30)

      const { data: mapsData } = await supabase.from('maps').select('id, name')
      const mapNames: Record<string, string> = {}
      for (const m of mapsData || []) mapNames[m.id] = m.name

      setFeed((data || []).map((h) => ({
        id:             h.id,
        spot_id:        h.spot_id,
        spot_title:     h.snapshot?.title ?? `Spot #${h.spot_id}`,
        map_id:         h.snapshot?.map_id ?? '',
        map_name:       mapNames[h.snapshot?.map_id] ?? h.snapshot?.map_id ?? '',
        changed_by_name: h.changed_by_name || 'Someone',
        changed_at:     h.changed_at,
      })))
      setFeedLoading(false)
    }
    loadFeed()
  }, [])

  const goToMap = (mapId?: string) => {
    if (!mapId) {
      router.push('/map')
      return
    }

    setEnteringMapId(mapId)
    window.setTimeout(() => {
      router.push(`/map?map=${encodeURIComponent(mapId)}`)
    }, 180)
  }

  const goToSpot = (mapId: string, spotId: number) => {
    router.push(`/map?map=${encodeURIComponent(mapId)}&spot=${spotId}`)
  }

  return (
    <div
      className={`min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.06),transparent_40%),linear-gradient(180deg,#050a06_0%,#080e09_100%)] text-white transition-opacity duration-200 ${
        enteringMapId ? 'opacity-95' : 'opacity-100'
      }`}
    >

      {/* Top bar */}
      <div className="border-b border-emerald-400/10 bg-[rgba(8,18,10,0.85)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <img src="/pathfinders-logo.png" alt="Pathfinders" className="h-10 w-auto object-contain" />
            <div className="hidden sm:block h-5 w-px bg-emerald-400/20" />
            <span className="hidden sm:block text-xs uppercase tracking-[0.3em] text-zinc-500">Intel Database</span>
          </div>
          <div className="flex items-center gap-3">
            {userName && (
              <span className="text-xs text-zinc-500">
                <span className="text-zinc-400">{userName}</span>
                {userRole !== 'viewer' && (
                  <span className="ml-2 rounded-full border border-emerald-400/20 bg-emerald-900/30 px-2 py-0.5 text-[10px] text-emerald-400 uppercase tracking-wider">{userRole}</span>
                )}
              </span>
            )}
            {userRole === 'admin' && (
              <a href="/admin" className="rounded-xl border border-emerald-300/15 bg-emerald-900/30 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-800/50">
                Admin
              </a>
            )}
            <button onClick={() => signOut({ callbackUrl: '/signin' })}
              className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-white">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-10">

        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {userName ? `Welcome back, ${userName.split(' ')[0]}.` : 'Welcome back.'}
          </h1>
          <p className="mt-2 text-zinc-500">Select a map to start, or review recent activity below.</p>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1fr_340px]">

          {/* Left — map cards */}
<div>
  <div className="mb-5 flex items-center justify-between">
    <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Maps</h2>
    <span className="text-xs text-zinc-700">{maps.length} maps</span>
  </div>

  {loading ? (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-[20px] bg-emerald-950/30" />
      ))}
    </div>
  ) : (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {maps.map((map) => (
        <button
          key={map.id}
          onClick={() => goToMap(map.id)}
          className={`group relative overflow-hidden rounded-[20px] border border-emerald-400/10 bg-emerald-950/20 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-300/25 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] active:scale-[0.985] ${
            enteringMapId === map.id
              ? 'z-20 scale-[1.04] border-emerald-300/35 ring-1 ring-emerald-300/20 shadow-[0_12px_40px_rgba(16,185,129,0.22)]'
              : ''
          }`}
        >
          {enteringMapId === map.id && (
            <div className="absolute inset-0 z-10 bg-emerald-500/10 backdrop-blur-[1px]" />
          )}

          <div className="relative h-32 w-full overflow-hidden">
            <img
              src={map.previewImage}
              alt={map.name}
              className={`h-full w-full object-cover transition-transform duration-700 ease-out ${
                enteringMapId === map.id ? 'scale-[1.03]' : 'group-hover:scale-[1.08]'
               
              }`}
              onError={(e) => {
                e.currentTarget.src = map.image
                
              }}
            />

            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(5,12,7,0.85)] via-[rgba(5,12,7,0.2)] to-transparent" />
            <div className="absolute inset-0 flex items-end p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
  <div className="w-full rounded-lg bg-black/60 backdrop-blur-md px-3 py-2 text-xs text-white">
    <div className="flex items-center justify-between">
      <span>{map.spotCount} spots</span>

      {map.lastActivity && (
        <span className="text-emerald-300">
          {timeAgo(map.lastActivity)}
        </span>
      )}
    </div>
  </div>
</div>

            <div className="absolute right-3 top-3 rounded-xl border border-emerald-300/20 bg-[rgba(5,12,7,0.8)] px-2.5 py-1 text-xs font-medium text-emerald-300 backdrop-blur-sm">
              {map.spotCount} spot{map.spotCount !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="p-4">
            <div className="font-semibold text-white transition-colors group-hover:text-emerald-100">
              {map.name}
            </div>

            {map.lastActivity ? (
              <div className="mt-1.5 text-[11px] text-zinc-600">
                Last edit {timeAgo(map.lastActivity)}
                {map.lastActivityBy && <span> · {map.lastActivityBy}</span>}
              </div>
            ) : (
              <div className="mt-1.5 text-[11px] text-zinc-700">No activity yet</div>
            )}
          </div>

          <div className="absolute bottom-4 right-4 text-zinc-700 transition-all duration-200 group-hover:text-emerald-400">
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </div>
        </button>
      ))}
    </div>
  )}
</div>
          {/* Right — activity feed */}
          <div className="xl:sticky xl:self-start" style={{ top: '24px' }}>
            <div className="rounded-[24px] border border-emerald-400/12 bg-[linear-gradient(180deg,rgba(18,52,29,0.7),rgba(11,28,16,0.85))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">

              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Recent Activity</h2>
                <span className="text-[10px] text-zinc-700">{feed.length} changes</span>
              </div>

              {feedLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-emerald-950/30" />
                  ))}
                </div>
              ) : feed.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-700">No activity recorded yet.</div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto space-y-px pr-0.5">
                  {feed.map((item, i) => (
                    <div key={item.id}
                      className={`flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-emerald-900/20 ${i === 0 ? 'bg-emerald-500/6' : ''}`}>
                      {/* Dot */}
                      <div className="mt-1.5 flex-shrink-0">
                        <span className={`block h-1.5 w-1.5 rounded-full ${i < 3 ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-4 text-zinc-400">
                          <span className="font-medium text-emerald-300">{item.changed_by_name}</span>
                          {' edited '}
                          <button
                            onClick={() => goToSpot(item.map_id, item.spot_id)}
                            className="font-medium text-white hover:text-emerald-300 transition">
                            {item.spot_title}
                          </button>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <button onClick={() => goToMap(item.map_id)}
                            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition">
                            {item.map_name}
                          </button>
                          <span className="text-zinc-800">·</span>
                          <span className="text-[10px] text-zinc-700">{timeAgo(item.changed_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
