'use client'

import type { MapData, Spot } from '../_lib/types'
import { panelClass } from '../_lib/styles'

type ActivityFeedItem = {
  id: number
  spot_id: number
  changed_by_name: string
  changed_at: string
  snapshot?: {
    title?: string
    map_id?: string
  }
}

function formatActivityTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMins / 60)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  return date.toLocaleDateString()
}

export function ActivityPanel({
  feedHasNew,
  feedItems,
  feedLastSeen,
  feedLoading,
  maps,
  onLoadFeed,
  onSelectMap,
  onSelectSpot,
}: {
  feedHasNew: boolean
  feedItems: ActivityFeedItem[]
  feedLastSeen: string
  feedLoading: boolean
  maps: MapData[]
  onLoadFeed: () => void
  onSelectMap: (mapId: string) => void
  onSelectSpot: (spot: Spot) => void
}) {
  return (
    <div className={`${panelClass} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">Activity</span>
        <div className="flex items-center gap-2">
          {feedHasNew && (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-600/60 px-2 py-0.5 text-[10px] text-emerald-100">
              New
            </span>
          )}
          <button
            onClick={onLoadFeed}
            disabled={feedLoading}
            className="text-sm text-zinc-600 transition hover:text-zinc-300"
            title="Refresh"
          >
            {feedLoading ? '...' : '↻'}
          </button>
        </div>
      </div>

      <div className="max-h-[72vh] space-y-px overflow-y-auto">
        {feedLoading && feedItems.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-600">Loading...</div>
        ) : feedItems.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-600">No changes yet.</div>
        ) : (
          feedItems.map((item) => {
            const isNew = feedLastSeen !== '' && item.changed_at > feedLastSeen
            const spotName = item.snapshot?.title ?? `Spot #${item.spot_id}`
            const mapId = item.snapshot?.map_id ?? ''
            const mapLabel = maps.find((m) => m.id === mapId)?.name ?? mapId
            const timeStr = formatActivityTime(item.changed_at)

            return (
              <div
                key={item.id}
                className={`flex gap-2 rounded-xl px-2 py-2.5 transition-colors ${isNew ? 'bg-emerald-500/8' : 'hover:bg-emerald-900/20'}`}
              >
                <div className="mt-1.5 flex-shrink-0">
                  {isNew ? (
                    <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ) : (
                    <span className="block h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] leading-4 text-zinc-400">
                    <span className="font-medium text-emerald-300">{item.changed_by_name || 'Someone'}</span>
                    {' · '}
                    <button
                      onClick={() => {
                        const targetMap = maps.find((m) => m.id === mapId)
                        if (targetMap) {
                          onSelectMap(mapId)
                          const spot = targetMap.spots.find((s) => s.id === item.spot_id)
                          if (spot) setTimeout(() => onSelectSpot(spot), 80)
                        }
                      }}
                      className="text-left font-medium text-white transition hover:text-emerald-300"
                    >
                      {spotName}
                    </button>
                  </div>
                  {mapLabel && <div className="mt-0.5 text-[10px] text-zinc-600">{mapLabel}</div>}
                  <div className="mt-0.5 text-[10px] text-zinc-700">{timeStr}</div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
