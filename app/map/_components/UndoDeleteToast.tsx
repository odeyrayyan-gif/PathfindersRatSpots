'use client'

import type { Spot } from '../_lib/types'

export function UndoDeleteToast({
  spot,
  onUndo,
}: {
  spot: Spot | null
  onUndo: () => void
}) {
  if (!spot) return null

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-red-500/30 bg-[rgba(20,5,5,0.95)] px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      style={{ animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)' }}
    >
      <style>{`@keyframes slideUp { from { opacity:0; transform: translate(-50%, 16px); } to { opacity:1; transform: translate(-50%, 0); } }`}</style>
      <span className="text-sm text-zinc-200">
        <span className="font-medium text-white">&quot;{spot.title}&quot;</span> deleted
      </span>
      <button
        onClick={onUndo}
        className="rounded-xl border border-emerald-400/40 bg-emerald-600/80 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500"
      >
        Undo
      </button>
    </div>
  )
}
