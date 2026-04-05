// app/map/_lib/constants.ts

import type { MarkerShape } from './types'

export const FIXED_ROLES = [
  { name: 'MG', icon: '/icons/hll/machine-gunner.png', color: 'bg-red-500', shape: 'circle' as MarkerShape },
  { name: 'Infantry', icon: '/icons/hll/rifleman.png', color: 'bg-green-500', shape: 'circle' as MarkerShape },
  { name: 'Tank', icon: '/icons/hll/tank.png', color: 'bg-yellow-500', shape: 'square' as MarkerShape },
  { name: 'Truck', icon: '/icons/hll/truck.png', color: 'bg-blue-500', shape: 'square' as MarkerShape },
  { name: 'Sniper', icon: '/icons/hll/sniper.png', color: 'bg-purple-500', shape: 'circle' as MarkerShape },
  { name: 'Anti-Tank', icon: '/icons/hll/anti-tank.png', color: 'bg-orange-500', shape: 'circle' as MarkerShape },
  { name: 'Anti-Tank Gun', icon: '/icons/hll/anti-tank-gun.png', color: 'bg-slate-400', shape: 'triangle' as MarkerShape },
] as const

export const HORIZONTAL_MAPS = new Set([
  'utah beach',
  'carentan',
  'st. marie eglise',
  'el alamein',
  'hill 400',
  'hurtgen forest',
  'mortain',
  'omaha beach',
  'smolensk',
  'stalingrad',
  'tobruk',
])

export const ROUTE_COLORS = [
  { name: 'White', value: '#f4f4f5' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Navy', value: '#1e3a8a' },
  { name: 'Pink', value: '#ec4899' },
] as const

export const ROUTE_LABELS = ['Supply Run', 'WAMO', 'Custom'] as const