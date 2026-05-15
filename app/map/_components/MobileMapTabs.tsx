'use client'

export type MobileMapPanel = 'map' | 'spots' | 'details'

const TABS: Array<{
  id: MobileMapPanel
  label: string
}> = [
  { id: 'map', label: 'Map' },
  { id: 'spots', label: 'Spots' },
  { id: 'details', label: 'Details' },
]

export function MobileMapTabs({
  activePanel,
  detailLabel,
  spotCount,
  hasSelection,
  onPanelChange,
}: {
  activePanel: MobileMapPanel
  detailLabel: string
  spotCount: number
  hasSelection: boolean
  onPanelChange: (panel: MobileMapPanel) => void
}) {
  return (
    <div className="xl:hidden">
      <div
        className="mb-4 grid grid-cols-3 gap-2 rounded-[22px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.94),rgba(8,20,12,0.92))] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl"
        role="tablist"
        aria-label="Mobile map sections"
      >
        {TABS.map((tab) => {
          const selected = activePanel === tab.id
          const label = tab.id === 'details' ? detailLabel : tab.label
          const badge =
            tab.id === 'spots'
              ? `${spotCount}`
              : tab.id === 'details' && hasSelection
                ? '1'
                : null

          return (
            <button
              key={tab.id}
              id={`mobile-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`mobile-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onPanelChange(tab.id)}
              className={`min-h-11 rounded-2xl border px-2 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${
                selected
                  ? 'border-emerald-300/35 bg-emerald-600/85 text-white shadow-[0_8px_20px_rgba(16,185,129,0.16)]'
                  : 'border-emerald-300/12 bg-emerald-950/35 text-zinc-300 hover:bg-emerald-900/45 hover:text-white'
              }`}
            >
              <span>{label}</span>
              {badge && (
                <span className="ml-1 rounded-full border border-white/15 bg-black/20 px-1.5 py-0.5 text-[10px] text-emerald-50">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
