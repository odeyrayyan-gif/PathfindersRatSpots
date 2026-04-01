'use client'

import * as React from 'react'
import {
  HLL_ICON_PRESETS,
  findPresetIconByRoleName,
  type IconPresetCategory,
} from '@/lib/hll-icon-presets'

type IconPickerProps = {
  inputName: string
  initialValue?: string | null
  roleName?: string
  compact?: boolean
}

const categoryLabels: Record<IconPresetCategory | 'all', string> = {
  all: 'All',
  infantry: 'Infantry',
  vehicles: 'Vehicles',
  utility: 'Utility',
}

export default function IconPicker({
  inputName,
  initialValue = '',
  roleName = '',
  compact = false,
}: IconPickerProps) {
  const [value, setValue] = React.useState(initialValue || '')
  const [activeCategory, setActiveCategory] = React.useState<
    IconPresetCategory | 'all'
  >('all')

  const filteredPresets =
    activeCategory === 'all'
      ? HLL_ICON_PRESETS
      : HLL_ICON_PRESETS.filter((preset) => preset.category === activeCategory)

  const suggestedPreset = React.useMemo(() => {
    return findPresetIconByRoleName(roleName || '')
  }, [roleName])

  const showImagePreview =
    value.startsWith('/') ||
    value.startsWith('http://') ||
    value.startsWith('https://')

  return (
    <div className="space-y-3">
      <input type="hidden" name={inputName} value={value} />

      <div className="flex items-center justify-between gap-3">
        <label className="block text-xs uppercase tracking-widest text-zinc-500">
          Default Icon
        </label>

        {suggestedPreset && (
          <button
            type="button"
            onClick={() => setValue(suggestedPreset.url)}
            className="rounded-xl border border-emerald-700 bg-emerald-900/50 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-800/60"
          >
            Auto-fill: {suggestedPreset.label}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'infantry', 'vehicles', 'utility'] as const).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-xl px-3 py-1.5 text-xs transition ${
              activeCategory === category
                ? 'border border-indigo-500 bg-indigo-600 text-white'
                : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {categoryLabels[category]}
          </button>
        ))}
      </div>

      <div
        className={`grid gap-2 ${
          compact ? 'grid-cols-4 md:grid-cols-7' : 'grid-cols-3 md:grid-cols-4 xl:grid-cols-7'
        }`}
      >
        {filteredPresets.map((preset) => {
          const selected = value === preset.url

          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => setValue(preset.url)}
              className={`rounded-2xl border p-2 transition ${
                selected
                  ? 'border-emerald-500 bg-emerald-900/40'
                  : 'border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900'
              }`}
              title={preset.label}
            >
              <div className="flex flex-col items-center gap-2">
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="h-12 w-12 rounded-xl object-contain"
                />
                <span className="text-center text-[10px] leading-4 text-zinc-300">
                  {preset.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="mb-2 text-xs uppercase tracking-widest text-zinc-500">
          Current Value
        </div>

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste emoji, direct image URL, or /icons/hll/..."
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none"
        />

        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900">
            {showImagePreview ? (
              <img
                src={value}
                alt="Selected icon preview"
                className="h-10 w-10 object-contain"
              />
            ) : (
              <span className="text-2xl">{value || '📍'}</span>
            )}
          </div>

          <div className="text-xs leading-5 text-zinc-400">
            Use preset icons, a custom emoji, a Discord emoji tag, or a direct image URL.
          </div>
        </div>
      </div>
    </div>
  )
}