export type IconPresetCategory = 'infantry' | 'vehicles' | 'utility'

export type IconPreset = {
  key: string
  label: string
  category: IconPresetCategory
  url: string
  aliases?: string[]
}

export const HLL_ICON_PRESETS: IconPreset[] = [
  {
    key: 'rifleman',
    label: 'Rifleman',
    category: 'infantry',
    url: '/icons/hll/rifleman.png',
    aliases: ['rifleman', 'rifle', 'rifle man'],
  },
  {
    key: 'anti-tank',
    label: 'Anti-Tank',
    category: 'infantry',
    url: '/icons/hll/anti-tank.png',
    aliases: ['anti-tank', 'antitank', 'at'],
  },
  {
    key: 'sniper',
    label: 'Sniper',
    category: 'infantry',
    url: '/icons/hll/sniper.png',
    aliases: ['sniper', 'marksman'],
  },
  {
    key: 'machine-gunner',
    label: 'Machine Gunner',
    category: 'infantry',
    url: '/icons/hll/machine-gunner.png',
    aliases: ['machine gunner', 'mg', 'machinegunner'],
  },
  {
    key: 'tank',
    label: 'Tank',
    category: 'vehicles',
    url: '/icons/hll/tank.png',
    aliases: ['tank', 'armor', 'armour'],
  },
  {
    key: 'truck',
    label: 'Truck',
    category: 'vehicles',
    url: '/icons/hll/truck.png',
    aliases: ['truck', 'supply truck', 'transport'],
  },
  {
    key: 'anti-tank-gun',
    label: 'Anti-Tank Gun',
    category: 'vehicles',
    url: '/icons/hll/anti-tank-gun.png',
    aliases: ['anti-tank gun', 'at gun', 'antitank gun'],
  },
]

export function findPresetIconByRoleName(roleName: string) {
  const normalized = roleName.trim().toLowerCase()

  return (
    HLL_ICON_PRESETS.find(
      (preset) =>
        preset.label.toLowerCase() === normalized ||
        preset.aliases?.some((alias) => alias.toLowerCase() === normalized)
    ) || null
  )
}