'use client'

import React from 'react'
import { supabase } from '@/lib/supabase'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type SpotSide = 'Axis' | 'Allies' | 'Both'
type RightTab = 'list' | 'details'
type MarkerShape = 'circle' | 'square' | 'triangle'
type ConeSide = 'Axis' | 'Allies'
type SpotSideFilter = 'both' | 'axis' | 'allies'
type MapOrientation = 'horizontal' | 'vertical'
type PlacementMode = null | 'cone_first' | 'cone_second' | 'line_end'

type SpotCone = {
  angle: number
  spread: number
  length: number // stored in % units (meters / 28). 500m ≈ 17.9, 1000m ≈ 35.7
}

type SpotConeSet = {
  Axis?: SpotCone | null
  Allies?: SpotCone | null
}

type SpotLine = {
  endX: number
  endY: number
  midpoint: string // 'Any' = always visible regardless of filter
}

type SpotLineSet = {
  Axis?: SpotLine | null
  Allies?: SpotLine | null
}

type RoutePoint = {
  x: number
  y: number
}

type SpotRoute = {
  id: string
  points: RoutePoint[]
  color: string
  label: string
  strokeWidth: number // 2–8 screen px
  side: ConeSide
  midpoint: string // 'Any' or a specific map midpoint name
  youtube?: string | null
}

type Spot = {
  id: number | string
  map_id: string
  title: string
  role: string
  roles: string[]
  side: SpotSide
  x: number
  y: number
  notes: string
  youtube?: string | null
  images?: string[]
  size: number
  cones?: SpotConeSet | null
  fireLines?: SpotLineSet | null
  routes?: SpotRoute[]
  created_at?: string
  pending?: boolean
}

type MapData = {
  id: string
  name: string
  image: string
  overlay?: string | null
  midpoints: string[] // always exactly 3, populated once in Supabase
  spots: Spot[]
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FIXED_ROLES = [
  { name: 'MG',           icon: '/icons/hll/machine-gunner.png', color: 'bg-red-500',    shape: 'circle'   as MarkerShape },
  { name: 'Infantry',     icon: '/icons/hll/rifleman.png',       color: 'bg-green-500',  shape: 'circle'   as MarkerShape },
  { name: 'Tank',         icon: '/icons/hll/tank.png',           color: 'bg-yellow-500', shape: 'square'   as MarkerShape },
  { name: 'Truck',        icon: '/icons/hll/truck.png',          color: 'bg-blue-500',   shape: 'square'   as MarkerShape },
  { name: 'Sniper',       icon: '/icons/hll/sniper.png',         color: 'bg-purple-500', shape: 'circle'   as MarkerShape },
  { name: 'Anti-Tank',    icon: '/icons/hll/anti-tank.png',      color: 'bg-orange-500', shape: 'circle'   as MarkerShape },
  { name: 'Anti-Tank Gun',icon: '/icons/hll/anti-tank-gun.png',  color: 'bg-slate-400',  shape: 'triangle' as MarkerShape },
] as const

const HORIZONTAL_MAPS = new Set([
  'utah beach', 'carentan', 'st. marie eglise', 'el alamein',
  'hill 400', 'hurtgen forest', 'mortain', 'omaha beach',
  'smolensk', 'stalingrad', 'tobruk',
])

const ROUTE_COLORS = [
  { name: 'White',  value: '#f4f4f5' },
  { name: 'Red',    value: '#ef4444' },
  { name: 'Blue',   value: '#3b82f6' },
  { name: 'Green',  value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Cyan',   value: '#06b6d4' },
  { name: 'Navy',   value: '#1e3a8a' },
  { name: 'Pink',   value: '#ec4899' },
] as const

const ROUTE_LABELS = [
  'Supply Run', 'WAMO', 'Custom',
] as const

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────

function getMapOrientation(mapName: string): MapOrientation {
  return HORIZONTAL_MAPS.has(mapName.trim().toLowerCase()) ? 'horizontal' : 'vertical'
}

// Map is always 2000m × 2000m (10×10 grid squares × 200m each).
// Coordinates are 0–100%, so 1% = 20m. This never changes per map.
function getDistanceMeters(x1: number, y1: number, x2: number, y2: number): number {
  const dx = (x2 - x1) * 28
  const dy = (y2 - y1) * 28
  return Math.round(Math.sqrt(dx * dx + dy * dy))
}

function getRouteTotalDistance(route: SpotRoute): number {
  let total = 0
  for (let i = 1; i < route.points.length; i++) {
    total += getDistanceMeters(
      route.points[i - 1].x, route.points[i - 1].y,
      route.points[i].x, route.points[i].y,
    )
  }
  return total
}

function getMaxRangeMeters(role: string, side: SpotSide | ConeSide): number {
  if (role === 'Tank' || role === 'Anti-Tank Gun') return 1000
  if (role === 'Anti-Tank') return side === 'Axis' ? 950 : 750
  return 500 // MG, Infantry, Sniper
}

function roleSupportsCone(role: string): boolean {
  return ['MG', 'Tank', 'Anti-Tank Gun', 'Sniper', 'Infantry'].includes(role)
}

function roleSupportsLine(role: string): boolean {
  return ['Tank', 'Anti-Tank Gun', 'Anti-Tank'].includes(role)
}

function roleSupportsRoute(role: string): boolean {
  return role === 'Tank' || role === 'Truck'
}

function metersToPercent(meters: number): number {
  return meters / 28
}

// OOB zones: horizontal = top+bottom 20%, vertical = left+right 20%
function getPlayableBounds(orientation: MapOrientation) {
  return orientation === 'horizontal'
    ? { xMin: 0, xMax: 100, yMin: 20, yMax: 80 }
    : { xMin: 20, xMax: 80, yMin: 0, yMax: 100 }
}

function isOutOfBounds(x: number, y: number, orientation: MapOrientation): boolean {
  const b = getPlayableBounds(orientation)
  return x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax
}

function normalizeSide(side: unknown): SpotSide {
  const v = String(side ?? '').toLowerCase()
  if (v === 'axis') return 'Axis'
  if (v === 'allies') return 'Allies'
  return 'Both'
}

function clampSpotSize(size: number): number {
  return Math.max(8, Math.min(20, Number(size || 12)))
}

function normalizeRoles(raw: any): string[] {
  if (Array.isArray(raw.roles) && raw.roles.length > 0) return raw.roles.filter(Boolean)
  if (typeof raw.role === 'string' && raw.role.trim()) return [raw.role.trim()]
  return ['MG']
}

function normalizeCone(rawCone: any): SpotCone | null {
  if (!rawCone || typeof rawCone !== 'object') return null
  const angle  = Number(rawCone.angle)
  const spread = Number(rawCone.spread)
  const length = Number(rawCone.length)
  if (isNaN(angle) || isNaN(spread) || isNaN(length)) return null
  return {
    angle:  ((angle % 360) + 360) % 360,
    spread: Math.max(5, Math.min(180, spread)),
    length: Math.max(0.5, Math.min(100, length)), // clamped to 0–100% (0–2000m)
  }
}

function normalizeConeSet(rawCone: any): SpotConeSet | null {
  if (!rawCone || typeof rawCone !== 'object') return null
  const axis   = normalizeCone(rawCone.Axis)
  const allies = normalizeCone(rawCone.Allies)
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}

function normalizeLine(rawLine: any): SpotLine | null {
  if (!rawLine || typeof rawLine !== 'object') return null
  const endX = Number(rawLine.endX)
  const endY = Number(rawLine.endY)
  if (isNaN(endX) || isNaN(endY)) return null
  return {
    endX:     Math.max(0, Math.min(100, endX)),
    endY:     Math.max(0, Math.min(100, endY)),
    midpoint: typeof rawLine.midpoint === 'string' ? rawLine.midpoint : 'Any',
  }
}

function normalizeLineSet(rawLines: any): SpotLineSet | null {
  if (!rawLines || typeof rawLines !== 'object') return null
  const axis   = normalizeLine(rawLines.Axis)
  const allies = normalizeLine(rawLines.Allies)
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}

function normalizeRoute(raw: any): SpotRoute | null {
  if (!raw || typeof raw !== 'object') return null
  if (!Array.isArray(raw.points) || raw.points.length < 2) return null
  const points = raw.points
    .map((p: any) => ({ x: Number(p.x), y: Number(p.y) }))
    .filter((p: any) => !isNaN(p.x) && !isNaN(p.y))
  if (points.length < 2) return null
  return {
    id:          raw.id || `route-${Math.random().toString(36).slice(2)}`,
    points,
    color:       typeof raw.color === 'string' ? raw.color : '#22c55e',
    label:       typeof raw.label === 'string' ? raw.label : 'WAMO',
    strokeWidth: Math.max(2, Math.min(8, Number(raw.strokeWidth) || 4)),
    side:        raw.side === 'Allies' ? 'Allies' : 'Axis',
    midpoint:    typeof raw.midpoint === 'string' ? raw.midpoint : 'Any',
    youtube:     raw.youtube ?? null,
  }
}

function normalizeRoutes(raw: any): SpotRoute[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeRoute).filter((r): r is SpotRoute => r !== null)
}

function normalizeSpot(raw: any): Spot {
  const roles = normalizeRoles(raw)
  return {
    id:         raw.id,
    map_id:     raw.map_id,
    title:      raw.title ?? '',
    role:       roles[0] || 'MG',
    roles,
    side:       normalizeSide(raw.side),
    x:          Number(raw.x ?? 0),
    y:          Number(raw.y ?? 0),
    notes:      raw.notes ?? '',
    youtube:    raw.youtube ?? null,
    images:     Array.isArray(raw.images) ? raw.images : [],
    size:       clampSpotSize(raw.size ?? 12),
    cones:      normalizeConeSet(raw.cone),
    fireLines:  normalizeLineSet(raw.fire_lines),
    routes:     normalizeRoutes(raw.routes),
    created_at: raw.created_at,
    pending:    false,
  }
}

function buildMapsWithSpots(mapsData: any[], spotsData: any[]): MapData[] {
  const spots = (spotsData || []).map(normalizeSpot)
  return (mapsData || []).map((map) => ({
    id:         map.id,
    name:       map.name,
    image:      map.image,
    overlay:    map.overlay,
    midpoints:  Array.isArray(map.midpoints) ? map.midpoints : [],
    spots:      spots.filter((s) => s.map_id === map.id),
  }))
}

function parseIcon(icon?: string | null) {
  const trimmed = icon?.trim()
  if (!trimmed) return { type: 'emoji' as const, value: '📍' }
  const discordMatch = trimmed.match(/^<a?:\w+:(\d+)>$/)
  if (discordMatch) return { type: 'image' as const, value: `https://cdn.discordapp.com/emojis/${discordMatch[1]}.png` }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return { type: 'image' as const, value: trimmed }
  }
  return { type: 'emoji' as const, value: trimmed }
}

function getSideClasses(side: SpotSide | ConeSide) {
  if (side === 'Axis') return {
    marker:     'bg-red-600/95',
    glow:       'bg-red-500',
    badge:      'bg-red-700/90 text-white border border-red-300/40',
    border:     'border-red-300',
    coneFill:   'rgba(239,68,68,0.22)',
    coneStroke: 'rgba(255,200,200,0.80)',
    lineStroke: 'rgba(255,180,180,0.95)',
    lineGlow:   'rgba(239,68,68,0.40)',
  }
  if (side === 'Allies') return {
    marker:     'bg-blue-600/95',
    glow:       'bg-blue-500',
    badge:      'bg-blue-700/90 text-white border border-blue-300/40',
    border:     'border-blue-300',
    coneFill:   'rgba(59,130,246,0.22)',
    coneStroke: 'rgba(200,230,255,0.80)',
    lineStroke: 'rgba(180,210,255,0.95)',
    lineGlow:   'rgba(59,130,246,0.40)',
  }
  return {
    marker:     'bg-violet-600/95',
    glow:       'bg-violet-500',
    badge:      'bg-violet-700/90 text-white border border-violet-300/40',
    border:     'border-violet-300',
    coneFill:   'rgba(139,92,246,0.22)',
    coneStroke: 'rgba(230,210,255,0.80)',
    lineStroke: 'rgba(220,200,255,0.95)',
    lineGlow:   'rgba(139,92,246,0.40)',
  }
}

function getYouTubeEmbedUrl(url?: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.replace(/^www\./, '')
    let id: string | null = null
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      id = parsed.searchParams.get('v')
      if (!id) {
        const parts = parsed.pathname.split('/').filter(Boolean)
        const ei = parts.indexOf('embed')
        if (ei !== -1 && parts[ei + 1]) id = parts[ei + 1]
      }
    } else if (host === 'youtu.be') {
      id = parsed.pathname.split('/').filter(Boolean)[0] || null
    }
    if (!id) return null
    id = id.split('?')[0].split('&')[0]
    return `https://www.youtube.com/embed/${id}`
  } catch {
    return null
  }
}

// FIXED: uses actual click distance capped at role max — spread and range are now independent
function createConeFromEdges(
  spot: { x: number; y: number; roles: string[]; side: SpotSide },
  edgeA: { x: number; y: number },
  edgeB: { x: number; y: number },
  coneSide: ConeSide,
): SpotCone {
  const dx1 = edgeA.x - spot.x
  const dy1 = edgeA.y - spot.y
  const dx2 = edgeB.x - spot.x
  const dy2 = edgeB.y - spot.y

  const a1 = Math.atan2(dy1, dx1)
  const a2 = Math.atan2(dy2, dx2)
  const diff   = ((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const center = a1 + diff / 2

  // actual radial distance from spot to the further click, in % units
  const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
  const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
  const raw    = Math.max(d1, d2)
  const maxPct = metersToPercent(getMaxRangeMeters(spot.roles?.[0] || 'MG', coneSide))

  return {
    angle:  ((center * 180) / Math.PI + 360) % 360,
    spread: Math.max(5, Math.min(180, Math.abs(diff) * (180 / Math.PI))),
    length: Math.min(raw, maxPct),
  }
}

function cleanupConeSet(cones: SpotConeSet | null | undefined): SpotConeSet | null {
  if (!cones) return null
  const axis = cones.Axis ?? null; const allies = cones.Allies ?? null
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}

function cleanupLineSet(lines: SpotLineSet | null | undefined): SpotLineSet | null {
  if (!lines) return null
  const axis = lines.Axis ?? null; const allies = lines.Allies ?? null
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}

// ─── SVG OVERLAY COMPONENTS ───────────────────────────────────────────────────
// All rendered inside a single viewBox="0 0 100 100" SVG.
// Coordinates are identical to the % system used everywhere else.
// 1 SVG unit = 1% of map = 20m.

function ConeShape({
  cx, cy, cone, side, preview = false,
}: {
  cx: number; cy: number; cone: SpotCone; side: ConeSide; preview?: boolean
}) {
  const styles   = getSideClasses(side)
  const r        = cone.length // % units — radius is already in the right space
  const startRad = (cone.angle - cone.spread / 2) * (Math.PI / 180)
  const endRad   = (cone.angle + cone.spread / 2) * (Math.PI / 180)
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  const largeArc = cone.spread > 180 ? 1 : 0
  const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

  // Label sits at the arc midpoint
  const labelRad = cone.angle * (Math.PI / 180)
  const lx = cx + r * Math.cos(labelRad)
  const ly = cy + r * Math.sin(labelRad)
  const distM = Math.round(cone.length * 28)

  return (
    <g>
      <path
        d={d}
        fill={styles.coneFill}
        stroke={styles.coneStroke}
        strokeWidth={0.35}
        strokeDasharray={preview ? '1.5 0.8' : undefined}
        vectorEffect="non-scaling-stroke"
        opacity={preview ? 0.82 : 1}
      />
      <circle cx={cx} cy={cy} r={0.35} fill={styles.coneStroke} />
      {!preview && (
        <text x={lx} y={ly + 0.4} textAnchor="middle" fontSize={0.8}
          fill="rgba(0,0,0,0.85)"
          fontWeight="700" style={{ userSelect: 'none' }}>
          {distM}m
        </text>
      )}
    </g>
  )
}

function SnipeLineShape({
  startX, startY, endX, endY, side, distanceM, outOfRange, oob, preview = false,
}: {
  startX: number; startY: number; endX: number; endY: number
  side: ConeSide; distanceM: number; outOfRange: boolean; oob: boolean; preview?: boolean
}) {
  const styles    = getSideClasses(side)
  const lineColor = (outOfRange || oob) ? 'rgba(245,158,11,0.95)' : styles.lineStroke
  const midX      = (startX + endX) / 2
  const midY      = (startY + endY) / 2
  const label = `${distanceM}m${oob ? ' OOB' : outOfRange ? ' OUT' : ''}`

  return (
    <g>
      <line x1={startX} y1={startY} x2={endX} y2={endY}
        stroke={lineColor} strokeWidth={1.5}
        strokeDasharray={preview ? '1.5 0.8' : undefined}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke" />
      <circle cx={startX} cy={startY} r={0.25} fill="rgba(255,255,255,0.90)" />
      <circle cx={endX}   cy={endY}   r={0.35}
        fill={(outOfRange || oob) ? '#f59e0b' : 'rgba(255,255,255,0.90)'} />
      <text x={midX} y={midY - 0.4} textAnchor="middle" fontSize={0.8}
        fill={(outOfRange || oob) ? 'rgba(180,80,0,0.9)' : 'rgba(0,0,0,0.85)'}
        fontWeight="700" style={{ userSelect: 'none' }}>
        {label}
      </text>
    </g>
  )
}

function RouteShape({
  route, preview = false, previewPoints,
}: {
  route?: SpotRoute; preview?: boolean; previewPoints?: RoutePoint[]
}) {
  const pts = preview ? (previewPoints || []) : (route?.points || [])
  if (pts.length < 2) return null

  const color       = preview ? 'rgba(255,255,255,0.85)' : (route?.color || '#22c55e')
  const strokeWidth = preview ? 3 : (route?.strokeWidth || 4)
  const label       = route?.label
  const ptsStr      = pts.map((p) => `${p.x},${p.y}`).join(' ')

  // Arrowhead — use a reference point a few samples back for a stable angle
  const last   = pts[pts.length - 1]
  const refIdx = Math.max(0, pts.length - Math.min(8, Math.ceil(pts.length * 0.15) + 2))
  const ref    = pts[refIdx]
  const ang    = Math.atan2(last.y - ref.y, last.x - ref.x)
  const as     = 1.2
  const ax1 = last.x - as * Math.cos(ang - Math.PI / 6)
  const ay1 = last.y - as * Math.sin(ang - Math.PI / 6)
  const ax2 = last.x - as * Math.cos(ang + Math.PI / 6)
  const ay2 = last.y - as * Math.sin(ang + Math.PI / 6)

  // Label at midpoint of path
  const mid = pts[Math.floor(pts.length / 2)]

  return (
    <g opacity={preview ? 0.75 : 1}>
      <polyline points={ptsStr} stroke={color} strokeWidth={strokeWidth}
        fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={preview ? '2 1' : undefined}
        vectorEffect="non-scaling-stroke" />
      <polygon points={`${last.x},${last.y} ${ax1},${ay1} ${ax2},${ay2}`} fill={color} />
      {!preview && label && (
        <text x={mid.x} y={mid.y - 0.3} textAnchor="middle" fontSize={0.8}
          fill="rgba(0,0,0,0.85)" fontWeight="700" style={{ userSelect: 'none' }}>
          {label}
        </text>
      )}
    </g>
  )
}

// ─── MARKER COMPONENTS ────────────────────────────────────────────────────────

function MarkerIcon({ icon, className = '', sizePx = 16 }: {
  icon?: string | null; className?: string; sizePx?: number
}) {
  const parsed = parseIcon(icon || '📍')
  if (parsed.type === 'image') {
    return (
      <img src={parsed.value} alt="icon"
        className={`object-contain ${className}`}
        style={{ width: sizePx, height: sizePx }}
        onError={(e) => { e.currentTarget.style.display = 'none' }} />
    )
  }
  return (
    <span className={`flex items-center justify-center text-white leading-none ${className}`}
      style={{ fontSize: `${sizePx}px`, width: `${sizePx}px`, height: `${sizePx}px` }}>
      {parsed.value}
    </span>
  )
}

function ShapeMarker({ shape, sideClass, borderClass, icon, size, isActive }: {
  shape: MarkerShape; sideClass: string; borderClass: string
  icon: string; size: number; isActive: boolean
}) {
  const common = `relative flex items-center justify-center border-2 ${sideClass} ${borderClass} shadow-[0_10px_25px_rgba(0,0,0,0.35)] ` +
    (isActive ? 'scale-125' : 'group-hover:scale-110')

  if (shape === 'square') {
    return (
      <span className={`${common} rounded-[6px]`} style={{ width: `${size}px`, height: `${size}px` }}>
        <MarkerIcon icon={icon} sizePx={Math.max(6, Math.round(size * 0.5))} />
      </span>
    )
  }
  if (shape === 'triangle') {
    return (
      <span className={`relative flex items-center justify-center ${isActive ? 'scale-125' : 'group-hover:scale-110'}`}
        style={{ width: `${size}px`, height: `${size}px` }}>
        <span className="absolute inset-0" style={{ clipPath: 'polygon(50% 6%, 8% 92%, 92% 92%)' }}>
          <span className={`absolute inset-0 ${sideClass}`} />
          <span className={`absolute inset-0 border-2 ${borderClass}`} style={{ clipPath: 'polygon(50% 6%, 8% 92%, 92% 92%)' }} />
        </span>
        <span className="relative mt-1">
          <MarkerIcon icon={icon} sizePx={Math.max(6, Math.round(size * 0.42))} />
        </span>
      </span>
    )
  }
  return (
    <span className={`${common} rounded-full`} style={{ width: `${size}px`, height: `${size}px` }}>
      <MarkerIcon icon={icon} sizePx={Math.max(6, Math.round(size * 0.5))} />
    </span>
  )
}

// ─── STYLE CONSTANTS ──────────────────────────────────────────────────────────

const panelClass      = 'rounded-3xl border border-emerald-400/15 bg-[linear-gradient(180deg,rgba(18,52,29,0.84),rgba(11,28,16,0.9))] shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl'
const inputClass      = 'w-full rounded-2xl border border-emerald-300/15 bg-emerald-950/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-emerald-100/30 focus:border-emerald-300/50 focus:bg-emerald-950/50'
const buttonClass     = 'rounded-2xl border border-emerald-300/25 bg-emerald-600/90 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 hover:border-emerald-200/40'
const softButtonClass = 'rounded-2xl border border-emerald-300/15 bg-emerald-900/40 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55'
const tabButtonClass  = 'rounded-2xl px-4 py-2 text-sm font-medium transition'
const tinyInputClass  = 'rounded-xl border border-emerald-300/15 bg-emerald-950/35 px-2 py-1.5 text-xs text-white outline-none transition focus:border-emerald-300/50'

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function IntelMap() {
  // ── data state
  const [maps,          setMaps]          = React.useState<MapData[]>([])
  const [selectedMapId, setSelectedMapId] = React.useState<string>('utah')
  const [isLoading,     setIsLoading]     = React.useState(true)

  // ── selection state
  const [selectedSpot,   setSelectedSpot]   = React.useState<Spot | null>(null)
  const [editingSpotId,  setEditingSpotId]  = React.useState<number | null>(null)
  const [rightTab,       setRightTab]       = React.useState<RightTab>('list')
  const [selectedRouteId,setSelectedRouteId]= React.useState<string | null>(null)

  // ── list filter state
  const [roleFilter,      setRoleFilter]      = React.useState<string>('All')
  const [spotSideFilter,  setSpotSideFilter]  = React.useState<SpotSideFilter>('both')
  const [sortMode,        setSortMode]        = React.useState<'alphabetical' | 'role'>('alphabetical')
  const [searchTerm,      setSearchTerm]      = React.useState('')
  const [activeMidpoint,  setActiveMidpoint]  = React.useState('All') // session-only, resets on map change

  // ── layer toggle state (replaces old losFilter)
  const [showMarkers,      setShowMarkers]      = React.useState(true)
  const [showCones,        setShowCones]        = React.useState(true)
  const [coneSideFilter,   setConeSideFilter]   = React.useState<'all' | 'axis' | 'allies'>('all')
  const [showFireLines,    setShowFireLines]     = React.useState(true)
  const [showRoutes,       setShowRoutes]        = React.useState(true)
  const [showTruckRoutes,  setShowTruckRoutes]   = React.useState(true)
  const [showTankRoutes,   setShowTankRoutes]    = React.useState(true)
  const [routeLabelFilter, setRouteLabelFilter]  = React.useState('All')

  // ── spot add state
  const [showAddSpot,     setShowAddSpot]     = React.useState(false)
  const [isSavingNewSpot, setIsSavingNewSpot] = React.useState(false)
  const [pendingPlacement,setPendingPlacement]= React.useState<{ x: number; y: number } | null>(null)
  const [newSpot,         setNewSpot]         = React.useState({
    title: '', roles: ['MG'] as string[], side: 'Both' as SpotSide,
    notes: '', youtube: '', images: [] as string[], imageFiles: [] as File[], size: 12,
  })

  // ── spot edit state
  const [editSpot, setEditSpot] = React.useState({
    title: '', roles: ['MG'] as string[], side: 'Both' as SpotSide,
    notes: '', youtube: '', size: 12,
    images:    [] as string[],
    cones:     null as SpotConeSet | null,
    fireLines: null as SpotLineSet | null,
    routes:    [] as SpotRoute[],
  })
  const [editSpotNewFiles,    setEditSpotNewFiles]    = React.useState<File[]>([])
  const [editSpotNewPreviews, setEditSpotNewPreviews] = React.useState<string[]>([])
  const editFileInputRef = React.useRef<HTMLInputElement | null>(null)

  // ── cone/line placement state
  const [placementMode,   setPlacementMode]   = React.useState<PlacementMode>(null)
  const [placementSpotId, setPlacementSpotId] = React.useState<number | string | null>(null)
  const [coneFirstEdge,   setConeFirstEdge]   = React.useState<{ x: number; y: number } | null>(null)
  const [previewPoint,    setPreviewPoint]     = React.useState<{ x: number; y: number } | null>(null)
  const [editingConeSide, setEditingConeSide]  = React.useState<ConeSide>('Axis')
  const [toolMode,        setToolMode]         = React.useState<'cone' | 'line'>('cone')
  const [snipeLineMidpoint, setSnipeLineMidpoint] = React.useState('Any')

  // ── route drawing state
  const [routeDrawMode,  setRouteDrawMode]  = React.useState(false)
  const [drawingPoints,  setDrawingPoints]  = React.useState<RoutePoint[]>([])
  const [newRouteConfig, setNewRouteConfig] = React.useState({
    color:       '#22c55e',
    label:       'WAMO' as string,
    strokeWidth: 4,
    side:        'Axis' as ConeSide,
    midpoint:    'Any',
    youtube:     '',
  })
  const isRouteDrawingRef    = React.useRef(false)
  const drawingPointsRef     = React.useRef<RoutePoint[]>([])
  const lastSampledPointRef  = React.useRef<RoutePoint | null>(null)

  // ── map viewport state
  const [scale,       setScale]       = React.useState(1)
  const [position,    setPosition]    = React.useState({ x: 0, y: 0 })
  const [isDragging,  setIsDragging]  = React.useState(false)

  // ── satellite overlay state
  const [showSatellite,  setShowSatellite]  = React.useState(false)
  const [overlayOpacity, setOverlayOpacity] = React.useState(55)
  const [overlayBroken,  setOverlayBroken]  = React.useState<Record<string, boolean>>({})

  // ── lightbox
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null)

  // ── refs
  const viewportRef      = React.useRef<HTMLDivElement | null>(null) // outer overflow div (wheel events)
  const mapContainerRef  = React.useRef<HTMLDivElement | null>(null) // inner aspect-square div (coordinates)
  const fileInputRef     = React.useRef<HTMLInputElement | null>(null)
  const dragRef = React.useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })

  // ── derived values
  const selectedMap     = maps.find((m) => m.id === selectedMapId) || null
  const mapOrientation  = selectedMap ? getMapOrientation(selectedMap.name) : 'horizontal'
  const hasSatellite    = Boolean(selectedMap?.overlay) && !overlayBroken[selectedMapId]
  const currentSpots    = selectedMap?.spots || []
  const selectedSpotEmbedUrl = getYouTubeEmbedUrl(selectedSpot?.youtube)
  const roleNames       = FIXED_ROLES.map((r) => r.name)

  const getRoleColor  = (r: string) => FIXED_ROLES.find((f) => f.name === r)?.color || 'bg-emerald-500'
  const getRoleIcon   = (r: string) => FIXED_ROLES.find((f) => f.name === r)?.icon  || '📍'
  const getRoleShape  = (r: string): MarkerShape => FIXED_ROLES.find((f) => f.name === r)?.shape || 'circle'

  const getRenderedSpotSize = (spot: Spot) => {
    const r = spot.roles?.[0] || spot.role || 'MG'
    return r === 'Tank' ? Math.max(5, Math.round(spot.size * 0.6)) : spot.size
  }

  const primaryEditRole = editSpot.roles?.[0] || 'MG'
  const canUseCone  = roleSupportsCone(primaryEditRole)
  const canUseLine  = roleSupportsLine(primaryEditRole)
  const canUseRoute = roleSupportsRoute(primaryEditRole)

  const availableConeSides: ConeSide[] =
    editSpot.side === 'Both' ? ['Axis', 'Allies'] :
    editSpot.side === 'Axis' ? ['Axis'] : ['Allies']

  // ── filtered + sorted spots
  const filteredSpots = React.useMemo(() =>
    currentSpots.filter((spot) => {
      const roleMatch = roleFilter === 'All' || (spot.roles || []).includes(roleFilter)
      const sideMatch =
        spotSideFilter === 'both' ||
        (spotSideFilter === 'axis'   && (spot.side === 'Axis'   || spot.side === 'Both')) ||
        (spotSideFilter === 'allies' && (spot.side === 'Allies' || spot.side === 'Both'))
      const search = searchTerm.trim().toLowerCase()
      const textMatch = search === '' ||
        spot.title.toLowerCase().includes(search) ||
        (spot.roles || []).some((r) => r.toLowerCase().includes(search)) ||
        spot.notes.toLowerCase().includes(search) ||
        spot.side.toLowerCase().includes(search)
      return roleMatch && sideMatch && textMatch
    }),
  [currentSpots, roleFilter, spotSideFilter, searchTerm])

  const sortedSpots = React.useMemo(() =>
    [...filteredSpots].sort((a, b) => {
      if (sortMode === 'role') {
        const rc = (a.roles?.[0] || '').localeCompare(b.roles?.[0] || '')
        if (rc !== 0) return rc
      }
      return a.title.localeCompare(b.title)
    }),
  [filteredSpots, sortMode])

  // ── visible routes helper
  function getVisibleRoutes(spot: Spot): SpotRoute[] {
    if (!showRoutes) return []
    const primaryRole = spot.roles?.[0] || spot.role || 'MG'
    if (!roleSupportsRoute(primaryRole)) return []
    if (primaryRole === 'Truck' && !showTruckRoutes) return []
    if (primaryRole === 'Tank'  && !showTankRoutes)  return []
    return (spot.routes || []).filter((r) =>
      (activeMidpoint === 'All' || r.midpoint === 'Any' || r.midpoint === activeMidpoint) &&
      (routeLabelFilter === 'All' || r.label === routeLabelFilter)
    )
  }

  // ── viewport clamping
  const clampPosition = React.useCallback((x: number, y: number, s = scale) => {
    const mc = mapContainerRef.current
    if (!mc) return { x, y }
    const rect = mc.getBoundingClientRect()
    const maxX = ((s - 1) * rect.width)  / 2
    const maxY = ((s - 1) * rect.height) / 2
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
  }, [scale])

  // ── helpers
  const resetNewSpotState = React.useCallback(() => {
    setNewSpot({ title: '', roles: ['MG'], side: 'Both', notes: '', youtube: '', images: [], imageFiles: [], size: 12 })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const revokeUrls = React.useCallback((urls: string[]) => {
    urls.forEach((u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u) })
  }, [])

  const addSpotToMaps = React.useCallback((spot: Spot) => {
    setMaps((prev) => prev.map((map) => {
      if (map.id !== spot.map_id) return map
      if (map.spots.some((s) => s.id === spot.id)) return map
      return { ...map, spots: [...map.spots, spot] }
    }))
  }, [])

  const replaceSpotInMaps = React.useCallback((tempId: string, saved: Spot) => {
    setMaps((prev) => prev.map((map) => {
      if (map.id !== saved.map_id) return { ...map, spots: map.spots.filter((s) => s.id !== tempId) }
      const without = map.spots.filter((s) => s.id !== tempId)
      return { ...map, spots: without.some((s) => s.id === saved.id) ? without : [...without, saved] }
    }))
  }, [])

  const removeSpotFromMaps = React.useCallback((spotId: number | string) => {
    setMaps((prev) => prev.map((map) => ({ ...map, spots: map.spots.filter((s) => s.id !== spotId) })))
  }, [])

  const patchSpotInMaps = React.useCallback((spotId: number | string, patch: Partial<Spot>) => {
    setMaps((prev) => prev.map((map) => ({
      ...map,
      spots: map.spots.map((s) => s.id === spotId ? { ...s, ...patch } : s),
    })))
  }, [])

  // ── effects: initial load
  React.useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      const [{ data: mapsData, error: me }, { data: spotsData, error: se }] = await Promise.all([
        supabase.from('maps').select('*').order('name', { ascending: true }),
        supabase.from('spots').select('*').order('id',  { ascending: true }),
      ])
      if (me) console.error('Maps load error:', me)
      if (se) console.error('Spots load error:', se)
      const built = buildMapsWithSpots(mapsData || [], spotsData || [])
      setMaps(built)
      if (built.length > 0) {
        setSelectedMapId((prev) => built.some((m) => m.id === prev) ? prev : built[0].id)
      }
      setIsLoading(false)
    }
    loadData()
  }, [])

  // ── effects: realtime
  React.useEffect(() => {
    const channel = supabase.channel('spots-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          addSpotToMaps(normalizeSpot(payload.new))
        }
        if (payload.eventType === 'UPDATE') {
          const incoming = normalizeSpot(payload.new)
          setMaps((prev) => prev.map((map) => ({
            ...map,
            spots: map.id === incoming.map_id
              ? map.spots.map((s) => s.id === incoming.id ? incoming : s)
              : map.spots.filter((s) => s.id !== incoming.id),
          })))
          setSelectedSpot((prev) => prev && prev.id === incoming.id ? incoming : prev)
        }
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id as number
          removeSpotFromMaps(id)
          setSelectedSpot((prev) => prev && prev.id === id ? null : prev)
        }
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [addSpotToMaps, removeSpotFromMaps])

  // ── effects: map change resets
  React.useEffect(() => {
    const currentMap = maps.find((m) => m.id === selectedMapId)
    setSelectedSpot(null)
    setSearchTerm(''); setRoleFilter('All'); setSortMode('alphabetical')
    setScale(1); setPosition({ x: 0, y: 0 })
    setShowAddSpot(false); setPendingPlacement(null); setShowSatellite(false)
    setEditingSpotId(null); setRightTab('list')
    setPlacementMode(null); setPlacementSpotId(null); setConeFirstEdge(null); setPreviewPoint(null)
    setRouteDrawMode(false); setDrawingPoints([])
    setActiveMidpoint('All')
    setSelectedRouteId(null)
    void currentMap // suppress unused warning
  }, [selectedMapId])

  // ── effects: keep selectedSpot in sync with maps
  React.useEffect(() => {
    const currentMap = maps.find((m) => m.id === selectedMapId)
    if (!currentMap) { setSelectedSpot(null); return }
    setSelectedSpot((prev) => {
      if (!prev) return null
      return currentMap.spots.find((s) => s.id === prev.id) || null
    })
  }, [maps, selectedMapId])

  // ── effects: cleanup blob URLs
  React.useEffect(() => {
    return () => { revokeUrls(newSpot.images) }
  }, [newSpot.images, revokeUrls])

  // ── effects: wheel zoom
  React.useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const prevOverflow = document.body.style.overflow
    const lockScroll   = () => { document.body.style.overflow = 'hidden' }
    const unlockScroll = () => { document.body.style.overflow = prevOverflow }
    const handleWheel  = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation()
      const mc   = mapContainerRef.current
      if (!mc) return
      const rect = mc.getBoundingClientRect()
      const mX   = e.clientX - rect.left
      const mY   = e.clientY - rect.top
      setScale((prevScale) => {
        const next      = e.deltaY < 0 ? Math.min(prevScale + 0.12, 3) : Math.max(prevScale - 0.12, 1)
        const zoomRatio = next / prevScale
        setPosition((prevPos) => {
          const cX   = rect.width  / 2
          const cY   = rect.height / 2
          const nx   = prevPos.x - (mX - cX) * (zoomRatio - 1)
          const ny   = prevPos.y - (mY - cY) * (zoomRatio - 1)
          const maxX = ((next - 1) * rect.width)  / 2
          const maxY = ((next - 1) * rect.height) / 2
          return { x: Math.max(-maxX, Math.min(maxX, nx)), y: Math.max(-maxY, Math.min(maxY, ny)) }
        })
        return next
      })
    }
    el.addEventListener('mouseenter', lockScroll)
    el.addEventListener('mouseleave', unlockScroll)
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('mouseenter', lockScroll)
      el.removeEventListener('mouseleave', unlockScroll)
      el.removeEventListener('wheel', handleWheel)
      document.body.style.overflow = prevOverflow
    }
  }, [scale])

  // ── coordinate helper
  // Must use mapContainerRef (the inner aspect-square div), not viewportRef (outer div).
  // The outer div may be wider than the map area when max-h kicks in, causing a systematic offset.
  const getMapPercent = (e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null => {
    if (!mapContainerRef.current) return null
    const rect = mapContainerRef.current.getBoundingClientRect()
    const vx   = e.clientX - rect.left
    const vy   = e.clientY - rect.top
    const cx   = rect.width  / 2
    const cy   = rect.height / 2
    const contentX = (vx - position.x - cx) / scale + cx
    const contentY = (vy - position.y - cy) / scale + cy
    return {
      x: Math.max(0, Math.min(100, Number(((contentX / rect.width)  * 100).toFixed(2)))),
      y: Math.max(0, Math.min(100, Number(((contentY / rect.height) * 100).toFixed(2)))),
    }
  }

  // ── zoom controls
  const zoomIn  = () => setScale((p) => Math.min(p + 0.2, 3))
  const zoomOut = () => setScale((p) => { const n = Math.max(p - 0.2, 1); setPosition((o) => clampPosition(o.x, o.y, n)); return n })
  const resetView = () => { setScale(1); setPosition({ x: 0, y: 0 }) }

  // ── mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Route drawing
    if (routeDrawMode && editingSpotId) {
      const pt = getMapPercent(e)
      if (pt) {
        isRouteDrawingRef.current   = true
        drawingPointsRef.current    = [pt]
        lastSampledPointRef.current = pt
        setDrawingPoints([pt])
      }
      return
    }
    if (showAddSpot || placementMode) return
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Route drawing
    if (isRouteDrawingRef.current) {
      const pt = getMapPercent(e)
      if (pt && lastSampledPointRef.current) {
        const dx   = pt.x - lastSampledPointRef.current.x
        const dy   = pt.y - lastSampledPointRef.current.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist >= 0.4) {
          const next = [...drawingPointsRef.current, pt]
          drawingPointsRef.current    = next
          lastSampledPointRef.current = pt
          setDrawingPoints(next)
        }
      }
      return
    }
    // Placement preview
    if (placementMode === 'cone_second' || placementMode === 'line_end') {
      const pt = getMapPercent(e); if (pt) setPreviewPoint(pt)
    }
    // Pan
    if (!isDragging) return
    const dx   = e.clientX - dragRef.current.startX
    const dy   = e.clientY - dragRef.current.startY
    setPosition(clampPosition(dragRef.current.originX + dx, dragRef.current.originY + dy))
  }

  const handleMouseUp = () => {
    // Finish route draw
    if (isRouteDrawingRef.current) {
      if (drawingPointsRef.current.length >= 2 && selectedSpot) {
        const newRoute: SpotRoute = {
          id:          `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          points:      [...drawingPointsRef.current],
          color:       newRouteConfig.color,
          label:       newRouteConfig.label,
          strokeWidth: newRouteConfig.strokeWidth,
          side:        newRouteConfig.side,
          midpoint:    newRouteConfig.midpoint,
          youtube:     newRouteConfig.youtube.trim() || null,
        }
        const nextRoutes = [...(editSpot.routes || []), newRoute]
        setEditSpot((p) => ({ ...p, routes: nextRoutes }))
        setSelectedSpot((p) => p ? { ...p, routes: nextRoutes } : p)
        patchSpotInMaps(selectedSpot.id, { routes: nextRoutes })
      }
      isRouteDrawingRef.current   = false
      drawingPointsRef.current    = []
      lastSampledPointRef.current = null
      setDrawingPoints([])
      setRouteDrawMode(false) // exit draw mode after each stroke; user can click again for more
      return
    }
    setIsDragging(false)
  }

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (routeDrawMode) return // handled in mouse down/up
    const pt = getMapPercent(e)
    if (!pt) return

    if (placementMode && placementSpotId != null && selectedSpot) {
      e.preventDefault(); e.stopPropagation()

      if (placementMode === 'cone_first') {
        setConeFirstEdge(pt); setPreviewPoint(pt); setPlacementMode('cone_second'); return
      }
      if (placementMode === 'cone_second' && coneFirstEdge) {
        const nextCone  = createConeFromEdges(
          { x: selectedSpot.x, y: selectedSpot.y, roles: selectedSpot.roles, side: selectedSpot.side },
          coneFirstEdge, pt, editingConeSide,
        )
        const nextCones = cleanupConeSet({ ...(editSpot.cones || {}), [editingConeSide]: nextCone })
        setEditSpot((p) => ({ ...p, cones: nextCones }))
        setSelectedSpot((p) => p ? { ...p, cones: nextCones } : p)
        patchSpotInMaps(selectedSpot.id, { cones: nextCones })
        setPlacementMode(null); setPlacementSpotId(null); setConeFirstEdge(null); setPreviewPoint(null)
        return
      }
      if (placementMode === 'line_end') {
        const nextLines = cleanupLineSet({ ...(editSpot.fireLines || {}), [editingConeSide]: { endX: pt.x, endY: pt.y, midpoint: snipeLineMidpoint } })
        setEditSpot((p) => ({ ...p, fireLines: nextLines }))
        setSelectedSpot((p) => p ? { ...p, fireLines: nextLines } : p)
        patchSpotInMaps(selectedSpot.id, { fireLines: nextLines })
        setPlacementMode(null); setPlacementSpotId(null); setPreviewPoint(null)
        return
      }
    }
    if (showAddSpot) setPendingPlacement(pt)
  }

  // ── image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const limited     = files.slice(0, 5 - newSpot.imageFiles.length)
    if (!limited.length) { if (fileInputRef.current) fileInputRef.current.value = ''; return }
    const previews    = limited.map((f) => URL.createObjectURL(f))
    setNewSpot((p) => ({ ...p, imageFiles: [...p.imageFiles, ...limited], images: [...p.images, ...previews] }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeNewSpotImage = (idx: number) => {
    setNewSpot((p) => {
      const url = p.images[idx]; if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      return { ...p, images: p.images.filter((_, i) => i !== idx), imageFiles: p.imageFiles.filter((_, i) => i !== idx) }
    })
  }

  const toggleRole = (roles: string[], role: string): string[] => {
    if (roles.includes(role)) { const n = roles.filter((r) => r !== role); return n.length > 0 ? n : roles }
    return [...roles, role]
  }

  // ── image upload to storage
  const uploadImage = async (file: File): Promise<string> => {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`
    const { error } = await supabase.storage.from('spot-images').upload(name, file)
    if (error) throw error
    return supabase.storage.from('spot-images').getPublicUrl(name).data.publicUrl
  }

  // ── save new spot
  const saveNewSpot = async () => {
    if (isSavingNewSpot) return
    if (!pendingPlacement) { alert('Click on the map first to place the spot.'); return }
    if (!newSpot.title.trim()) { alert('Enter a title before saving.'); return }
    if (!newSpot.roles.length) { alert('Choose at least one role.'); return }
    if (!selectedMapId)        { alert('No map selected.'); return }

    const primaryRole = newSpot.roles[0] || 'MG'
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Spot = {
      id: tempId, map_id: selectedMapId,
      title: newSpot.title.trim(), role: primaryRole, roles: newSpot.roles,
      side: newSpot.side, notes: newSpot.notes, youtube: newSpot.youtube.trim() || null,
      images: newSpot.images, x: pendingPlacement.x, y: pendingPlacement.y,
      size: clampSpotSize(newSpot.size), cones: null, fireLines: null, routes: [], pending: true,
    }

    setIsSavingNewSpot(true)
    addSpotToMaps(optimistic)
    setSelectedSpot(optimistic); setShowAddSpot(false); setPendingPlacement(null)
    setRightTab('details'); resetNewSpotState()

    try {
      const uploadedUrls = await Promise.all(newSpot.imageFiles.map(uploadImage))
      const { data, error } = await supabase.from('spots').insert({
        map_id: selectedMapId, title: newSpot.title.trim(),
        role: primaryRole, roles: newSpot.roles, side: newSpot.side,
        notes: newSpot.notes.trim(), youtube: newSpot.youtube.trim() || null,
        images: uploadedUrls, x: pendingPlacement.x, y: pendingPlacement.y,
        size: clampSpotSize(newSpot.size), cone: null, fire_lines: null, routes: [],
      }).select().single()
      if (error) throw error
      const saved = normalizeSpot(data)
      replaceSpotInMaps(tempId, saved); setSelectedSpot(saved)
      revokeUrls(newSpot.images)
    } catch (err: any) {
      console.error('Save error:', err)
      removeSpotFromMaps(tempId); setSelectedSpot((p) => p?.id === tempId ? null : p)
      revokeUrls(newSpot.images); alert(err?.message || 'Failed to save spot.')
    } finally {
      setIsSavingNewSpot(false)
    }
  }

  // ── spot editing
  const startEditingSpot = () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    const initSide: ConeSide = selectedSpot.side === 'Allies' ? 'Allies' : 'Axis'
    const primaryRole = selectedSpot.roles?.[0] || selectedSpot.role || 'MG'
    setEditingConeSide(initSide)
    setToolMode(roleSupportsCone(primaryRole) ? 'cone' : roleSupportsLine(primaryRole) ? 'line' : 'cone')
    setNewRouteConfig((p) => ({ ...p, side: initSide }))
    setEditingSpotId(selectedSpot.id)
    setEditSpot({
      title: selectedSpot.title,
      roles: selectedSpot.roles?.length ? selectedSpot.roles : [selectedSpot.role || 'MG'],
      side:  selectedSpot.side, notes: selectedSpot.notes,
      youtube: selectedSpot.youtube || '', size: clampSpotSize(selectedSpot.size),
      images: selectedSpot.images || [],
      cones: selectedSpot.cones || null, fireLines: selectedSpot.fireLines || null,
      routes: selectedSpot.routes || [],
    })
    setEditSpotNewFiles([])
    setEditSpotNewPreviews([])
    if (editFileInputRef.current) editFileInputRef.current.value = ''
    setRightTab('details')
  }

  const saveEditedSpot = async () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    const primaryRole   = editSpot.roles[0] || 'MG'
    const cleanedCones  = cleanupConeSet(editSpot.cones)
    const cleanedLines  = cleanupLineSet(editSpot.fireLines)
    const cleanedRoutes = editSpot.routes.filter((r) => r.points.length >= 2)

    // Upload any newly added files then combine with kept existing images
    let uploadedUrls: string[] = []
    if (editSpotNewFiles.length > 0) {
      try { uploadedUrls = await Promise.all(editSpotNewFiles.map(uploadImage)) }
      catch (err: any) { console.error('Image upload error:', err); return }
    }
    const finalImages = [...editSpot.images, ...uploadedUrls]

    const { error } = await supabase.from('spots').update({
      title: editSpot.title.trim(), role: primaryRole, roles: editSpot.roles,
      side: editSpot.side, notes: editSpot.notes.trim(),
      youtube: editSpot.youtube.trim() || null, size: clampSpotSize(editSpot.size),
      images: finalImages,
      cone: cleanedCones, fire_lines: cleanedLines, routes: cleanedRoutes,
    }).eq('id', selectedSpot.id)

    if (error) { console.error('Update error:', error); return }
    revokeUrls(editSpotNewPreviews)
    setEditSpotNewFiles([])
    setEditSpotNewPreviews([])
    setEditingSpotId(null); setRouteDrawMode(false); resetPlacementState()
  }

  const deleteSelectedSpot = async () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    if (!window.confirm(`Delete "${selectedSpot.title}"? This cannot be undone.`)) return
    // Optimistic: remove from UI immediately so it feels instant
    const deletedId = selectedSpot.id
    setSelectedSpot(null)
    setEditingSpotId(null)
    setRightTab('list')
    removeSpotFromMaps(deletedId)
    const { error } = await supabase.from('spots').delete().eq('id', deletedId)
    if (error) {
      console.error('Delete error:', error)
      // Re-fetch to restore state if the DB delete failed
      const { data } = await supabase.from('spots').select('*').eq('id', deletedId).single()
      if (data) addSpotToMaps(normalizeSpot(data))
    }
  }

  const cancelEditSpot = () => {
    if (selectedSpot && typeof selectedSpot.id === 'number') {
      const orig = maps.find((m) => m.id === selectedMapId)?.spots.find((s) => s.id === selectedSpot.id)
      if (orig) setSelectedSpot(orig)
    }
    revokeUrls(editSpotNewPreviews)
    setEditSpotNewFiles([])
    setEditSpotNewPreviews([])
    if (editFileInputRef.current) editFileInputRef.current.value = ''
    setEditingSpotId(null); resetPlacementState()
    setRouteDrawMode(false); setDrawingPoints([])
  }

  const resetPlacementState = () => {
    setPlacementMode(null); setPlacementSpotId(null)
    setConeFirstEdge(null); setPreviewPoint(null)
  }

  // ── size update (debounced via storing edit locally, only DB write on save)
  const updateSelectedSpotSize = async (newSize: number) => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    const clamped = clampSpotSize(newSize)
    setSelectedSpot((p) => p ? { ...p, size: clamped } : p)
    patchSpotInMaps(selectedSpot.id, { size: clamped })
    const { error } = await supabase.from('spots').update({ size: clamped }).eq('id', selectedSpot.id)
    if (error) console.error('Size update error:', error)
  }

  const updateEditSpotSize = (newSize: number) => {
    const clamped = clampSpotSize(newSize)
    setEditSpot((p) => ({ ...p, size: clamped }))
    if (selectedSpot) {
      setSelectedSpot((p) => p ? { ...p, size: clamped } : p)
      patchSpotInMaps(selectedSpot.id, { size: clamped })
    }
  }

  // ── cone placement
  const beginConePlacement = () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    setPlacementSpotId(selectedSpot.id); setPlacementMode('cone_first')
    setConeFirstEdge(null); setPreviewPoint(null)
  }

  const clearCone = () => {
    if (!selectedSpot) return
    const nextCones = cleanupConeSet({ ...(editSpot.cones || {}), [editingConeSide]: null })
    setEditSpot((p) => ({ ...p, cones: nextCones }))
    setSelectedSpot((p) => p ? { ...p, cones: nextCones } : p)
    patchSpotInMaps(selectedSpot.id, { cones: nextCones })
    resetPlacementState()
  }

  // ── line placement
  const beginLinePlacement = () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    setPlacementSpotId(selectedSpot.id); setPlacementMode('line_end')
    setPreviewPoint(null)
  }

  const clearLine = () => {
    if (!selectedSpot) return
    const nextLines = cleanupLineSet({ ...(editSpot.fireLines || {}), [editingConeSide]: null })
    setEditSpot((p) => ({ ...p, fireLines: nextLines }))
    setSelectedSpot((p) => p ? { ...p, fireLines: nextLines } : p)
    patchSpotInMaps(selectedSpot.id, { fireLines: nextLines })
    resetPlacementState()
  }

  // ── route management
  const deleteRoute = (routeId: string) => {
    const nextRoutes = editSpot.routes.filter((r) => r.id !== routeId)
    setEditSpot((p) => ({ ...p, routes: nextRoutes }))
    if (selectedSpot) {
      setSelectedSpot((p) => p ? { ...p, routes: nextRoutes } : p)
      patchSpotInMaps(selectedSpot.id, { routes: nextRoutes })
    }
  }

  // ── spot selection
  const selectSpot = (spot: Spot) => {
    setSelectedSpot(spot); setShowAddSpot(false); setEditingSpotId(null)
    setRightTab('details'); resetPlacementState()
    setRouteDrawMode(false); setDrawingPoints([])
    setSelectedRouteId(null)
  }

  const openAddSpot = () => {
    if (showAddSpot) {
      revokeUrls(newSpot.images); resetNewSpotState()
      setPendingPlacement(null); setShowAddSpot(false); setEditingSpotId(null)
      setRightTab('details'); return
    }
    setShowAddSpot(true); setEditingSpotId(null); setRightTab('details'); setPendingPlacement(null)
  }

  // ── preview computations
  const previewCone = selectedSpot && placementMode === 'cone_second' && coneFirstEdge && previewPoint
    ? createConeFromEdges(
        { x: selectedSpot.x, y: selectedSpot.y, roles: selectedSpot.roles, side: selectedSpot.side },
        coneFirstEdge, previewPoint, editingConeSide,
      )
    : null

  const previewDistM = selectedSpot && previewPoint
    ? getDistanceMeters(selectedSpot.x, selectedSpot.y, previewPoint.x, previewPoint.y)
    : null

  const previewMaxM = selectedSpot
    ? getMaxRangeMeters(selectedSpot.roles?.[0] || selectedSpot.role || 'MG', editingConeSide)
    : null

  const previewOutOfRange = placementMode === 'line_end' && previewDistM != null && previewMaxM != null
    ? previewDistM > previewMaxM : false

  const previewOOB = placementMode === 'line_end' && previewPoint
    ? isOutOfBounds(previewPoint.x, previewPoint.y, mapOrientation) : false

  const currentEditingCone = editSpot.cones?.[editingConeSide] || null
  const currentEditingLine = editSpot.fireLines?.[editingConeSide] || null

  const selectedRoute      = selectedSpot?.routes?.find((r) => r.id === selectedRouteId) || null
  const selectedRouteEmbed = getYouTubeEmbedUrl(selectedRoute?.youtube)

  // ── cursor style for map
  const mapCursor = isDragging ? 'cursor-grabbing'
    : (showAddSpot || placementMode || routeDrawMode) ? 'cursor-crosshair'
    : 'cursor-grab'

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,#060906_0%,#0a0f0b_100%)] text-white">
      <div className="mx-auto max-w-[1800px] px-4 pb-6 pt-3 md:px-6">

        {/* ── Logo bar */}
        <div className="sticky top-0 z-40 mb-4 overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex items-center justify-center px-4 py-3 md:py-4">
            <img src="/pathfinders-logo.png" alt="Pathfinders"
              className="max-h-[65px] w-auto object-contain md:max-h-[85px]" />
          </div>
        </div>

        {/* ── Row 1: data filters */}
        <div className="sticky top-[94px] z-30 mb-2 grid gap-3 rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl md:grid-cols-2 xl:grid-cols-8">
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Map</label>
            <select value={selectedMapId} onChange={(e) => setSelectedMapId(e.target.value)} className={inputClass}>
              {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Search</label>
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search spots..." className={inputClass} />
          </div>
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputClass}>
              <option>All</option>
              {roleNames.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Side</label>
            <select value={spotSideFilter} onChange={(e) => setSpotSideFilter(e.target.value as SpotSideFilter)} className={inputClass}>
              <option value="both">Both</option>
              <option value="axis">Axis</option>
              <option value="allies">Allies</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Midpoint</label>
            <select value={activeMidpoint} onChange={(e) => setActiveMidpoint(e.target.value)} className={inputClass}>
              <option value="All">All Midpoints</option>
              {(selectedMap?.midpoints || []).map((mp) => <option key={mp} value={mp}>{mp}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Sort</label>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as 'alphabetical' | 'role')} className={inputClass}>
              <option value="alphabetical">Alphabetical</option>
              <option value="role">By Role</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={openAddSpot} className={`w-full ${showAddSpot ? buttonClass : softButtonClass}`}>
              {showAddSpot ? 'Cancel Add Spot' : 'Add Spot'}
            </button>
          </div>
          <div className="flex items-end">
            <a href="/admin" className={`${buttonClass} flex w-full items-center justify-center`}>
              Admin Panel
            </a>
          </div>
        </div>

        {/* ── Row 2: layer toggles */}
        <div className="sticky top-[178px] z-30 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[24px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.40)] backdrop-blur-xl">
          <span className="text-[10px] uppercase tracking-[0.30em] text-zinc-500">Layers</span>
          {/* Markers */}
          <button onClick={() => setShowMarkers((p) => !p)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${showMarkers ? 'border-emerald-300/30 bg-emerald-600/80 text-white' : 'border-emerald-400/15 bg-emerald-950/40 text-zinc-400 hover:text-white'}`}>
            Markers
          </button>
          <div className="h-5 w-px bg-emerald-800/50" />
          {/* Cones */}
          <button onClick={() => setShowCones((p) => !p)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${showCones ? 'border-emerald-300/30 bg-emerald-600/80 text-white' : 'border-emerald-400/15 bg-emerald-950/40 text-zinc-400 hover:text-white'}`}>
            Cones
          </button>
          {showCones && (
            <select value={coneSideFilter} onChange={(e) => setConeSideFilter(e.target.value as any)}
              className="rounded-xl border border-emerald-300/15 bg-emerald-950/35 px-2 py-1.5 text-xs text-white outline-none">
              <option value="all">All</option>
              <option value="axis">Axis</option>
              <option value="allies">Allies</option>
            </select>
          )}
          <div className="h-5 w-px bg-emerald-800/50" />
          {/* Snipe Lines */}
          <button onClick={() => setShowFireLines((p) => !p)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${showFireLines ? 'border-emerald-300/30 bg-emerald-600/80 text-white' : 'border-emerald-400/15 bg-emerald-950/40 text-zinc-400 hover:text-white'}`}>
            Snipe Lines
          </button>
          <div className="h-5 w-px bg-emerald-800/50" />
          {/* Routes */}
          <button onClick={() => setShowRoutes((p) => !p)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${showRoutes ? 'border-emerald-300/30 bg-emerald-600/80 text-white' : 'border-emerald-400/15 bg-emerald-950/40 text-zinc-400 hover:text-white'}`}>
            Routes
          </button>
          {showRoutes && (
            <>
              <button onClick={() => setShowTruckRoutes((p) => !p)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${showTruckRoutes ? 'border-blue-300/30 bg-blue-700/70 text-white' : 'border-emerald-400/15 bg-emerald-950/40 text-zinc-400 hover:text-white'}`}>
                Trucks
              </button>
              <button onClick={() => setShowTankRoutes((p) => !p)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${showTankRoutes ? 'border-yellow-300/30 bg-yellow-700/60 text-white' : 'border-emerald-400/15 bg-emerald-950/40 text-zinc-400 hover:text-white'}`}>
                Tanks
              </button>
              <select value={routeLabelFilter} onChange={(e) => setRouteLabelFilter(e.target.value)}
                className="rounded-xl border border-emerald-300/15 bg-emerald-950/35 px-2 py-1.5 text-xs text-white outline-none">
                <option value="All">All Labels</option>
                {ROUTE_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </>
          )}
          <div className="ml-auto text-[10px] uppercase tracking-[0.20em] text-zinc-600">
            {filteredSpots.length} spot{filteredSpots.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* ── Main grid */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_390px]">

          {/* ── Map panel */}
          <div className={`${panelClass} p-4 md:p-5`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {selectedMap?.name || (isLoading ? 'Loading maps...' : 'No map selected')}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Scroll to zoom · drag to pan
                  {showAddSpot && ' · Click to place new spot'}
                  {placementMode === 'cone_first'  && ` · Click 1st edge of ${editingConeSide} cone`}
                  {placementMode === 'cone_second' && ` · Move to preview, click 2nd edge`}
                  {placementMode === 'line_end'    && ` · Move to preview, click impact point`}
                  {routeDrawMode && ' · Hold mouse to draw route'}
                  {hasSatellite && showSatellite && ' · Satellite active'}
                </p>
              </div>
            </div>

            <div ref={viewportRef}
              className="relative w-full select-none overflow-hidden rounded-[28px] border border-emerald-400/12 bg-emerald-950/12"
              style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}>

              {/* Zoom + satellite controls */}
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2">
                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.94),rgba(8,20,12,0.92))] px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <button onClick={zoomIn}    className="rounded-xl border border-emerald-300/15 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55">+</button>
                  <button onClick={zoomOut}   className="rounded-xl border border-emerald-300/15 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55">−</button>
                  <button onClick={resetView} className="rounded-xl border border-emerald-300/15 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55">Reset</button>
                  <span className="ml-1 text-xs text-zinc-300">{scale.toFixed(1)}x</span>
                </div>
                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.94),rgba(8,20,12,0.92))] px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <button onClick={() => { if (hasSatellite) setShowSatellite((p) => !p) }} disabled={!hasSatellite}
                    className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${hasSatellite ? showSatellite ? 'border-emerald-300/40 bg-emerald-600/90 text-white hover:bg-emerald-500' : 'border-emerald-300/15 bg-emerald-900/40 text-emerald-50 hover:bg-emerald-800/55' : 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500'}`}>
                    {hasSatellite ? (showSatellite ? 'Sat On' : 'Sat Off') : 'No Sat'}
                  </button>
                  {hasSatellite && showSatellite && (
                    <>
                      <input type="range" min="0" max="100" value={overlayOpacity}
                        onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                        className="w-24 accent-emerald-500" />
                      <span className="w-9 text-xs text-zinc-300">{overlayOpacity}%</span>
                    </>
                  )}
                </div>
                {/* Distance preview HUD */}
                {previewDistM !== null && (placementMode === 'cone_second' || placementMode === 'line_end') && (
                  <div className="pointer-events-auto rounded-2xl border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.94),rgba(8,20,12,0.92))] px-3 py-2 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    <span className="text-zinc-400">Distance: </span>
                    <span className="font-bold text-white">{previewDistM}m</span>
                    {previewMaxM !== null && (
                      <span className="text-zinc-500"> / max {previewMaxM}m</span>
                    )}
                    {placementMode === 'line_end' && previewOOB && (
                      <span className="ml-2 rounded-full bg-orange-700/90 px-2 py-0.5 text-[10px] font-bold text-white">OOB</span>
                    )}
                    {placementMode === 'line_end' && !previewOOB && previewOutOfRange && (
                      <span className="ml-2 rounded-full bg-yellow-600/90 px-2 py-0.5 text-[10px] font-bold text-white">OUT</span>
                    )}
                  </div>
                )}
              </div>

              {/* Map content */}
              <div ref={mapContainerRef} className="relative mx-auto aspect-square w-full max-h-[78vh] bg-black/30">
                {selectedMap ? (
                  <div className={`absolute inset-0 ${mapCursor}`}
                    onMouseDown={handleMouseDown}
                    onClick={handleMapClick}
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transformOrigin: 'center center' }}>

                    {/* Map image */}
                    <img src={selectedMap.image} alt={selectedMap.name}
                      className="pointer-events-none absolute inset-0 h-full w-full object-contain" draggable={false} />

                    {/* Satellite overlay */}
                    {hasSatellite && showSatellite && selectedMap.overlay && (
                      <img src={selectedMap.overlay} alt={`${selectedMap.name} satellite`}
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                        draggable={false} style={{ opacity: overlayOpacity / 100 }}
                        onError={() => setOverlayBroken((p) => ({ ...p, [selectedMap.id]: true }))} />
                    )}

                    {/* ── Single SVG overlay for all annotations ── */}
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                      className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>

                      {filteredSpots.map((spot) => {
                        const primaryRole = spot.roles?.[0] || spot.role || 'MG'

                        return (
                          <React.Fragment key={`svg-${spot.id}`}>
                            {/* Cones */}
                            {showCones && spot.cones?.Axis && (coneSideFilter === 'all' || coneSideFilter === 'axis') && (
                              <ConeShape cx={spot.x} cy={spot.y} cone={spot.cones.Axis} side="Axis" />
                            )}
                            {showCones && spot.cones?.Allies && (coneSideFilter === 'all' || coneSideFilter === 'allies') && (
                              <ConeShape cx={spot.x} cy={spot.y} cone={spot.cones.Allies} side="Allies" />
                            )}

                            {/* Fire lines */}
                            {showFireLines && roleSupportsLine(primaryRole) && spot.fireLines?.Axis && (() => {
                              const l = spot.fireLines.Axis!
                              if (activeMidpoint !== 'All' && l.midpoint !== 'Any' && l.midpoint !== activeMidpoint) return null
                              const dm = getDistanceMeters(spot.x, spot.y, l.endX, l.endY)
                              const maxM = getMaxRangeMeters(primaryRole, 'Axis')
                              return (
                                <SnipeLineShape startX={spot.x} startY={spot.y} endX={l.endX} endY={l.endY}
                                  side="Axis" distanceM={dm} outOfRange={dm > maxM}
                                  oob={isOutOfBounds(l.endX, l.endY, mapOrientation)} />
                              )
                            })()}
                            {showFireLines && roleSupportsLine(primaryRole) && spot.fireLines?.Allies && (() => {
                              const l = spot.fireLines.Allies!
                              if (activeMidpoint !== 'All' && l.midpoint !== 'Any' && l.midpoint !== activeMidpoint) return null
                              const dm = getDistanceMeters(spot.x, spot.y, l.endX, l.endY)
                              const maxM = getMaxRangeMeters(primaryRole, 'Allies')
                              return (
                                <SnipeLineShape startX={spot.x} startY={spot.y} endX={l.endX} endY={l.endY}
                                  side="Allies" distanceM={dm} outOfRange={dm > maxM}
                                  oob={isOutOfBounds(l.endX, l.endY, mapOrientation)} />
                              )
                            })()}

                            {/* Routes */}
                            {getVisibleRoutes(spot).map((route) => (
                              <RouteShape key={route.id} route={route} />
                            ))}
                          </React.Fragment>
                        )
                      })}

                      {/* Preview cone */}
                      {previewCone && selectedSpot && (
                        <ConeShape cx={selectedSpot.x} cy={selectedSpot.y}
                          cone={previewCone} side={editingConeSide} preview />
                      )}

                      {/* Preview fire line */}
                      {placementMode === 'line_end' && selectedSpot && previewPoint && (
                        <SnipeLineShape
                          startX={selectedSpot.x} startY={selectedSpot.y}
                          endX={previewPoint.x} endY={previewPoint.y}
                          side={editingConeSide}
                          distanceM={previewDistM ?? 0}
                          outOfRange={previewOutOfRange}
                          oob={previewOOB}
                          preview />
                      )}

                      {/* In-progress route drawing */}
                      {routeDrawMode && drawingPoints.length >= 2 && (
                        <RouteShape preview previewPoints={drawingPoints} />
                      )}
                    </svg>

                    {/* ── Spot markers (kept as HTML buttons for click handling) */}
                    {showMarkers && filteredSpots.map((spot) => {
                      const isActive     = selectedSpot?.id === spot.id
                      const sideStyles   = getSideClasses(spot.side)
                      const primaryRole  = spot.roles?.[0] || spot.role || 'MG'
                      const shape        = getRoleShape(primaryRole)
                      const renderedSize = getRenderedSpotSize(spot)

                      return (
                        <button key={spot.id}
                          onClick={(e) => { e.stopPropagation(); selectSpot(spot) }}
                          className="group absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `${spot.x}%`, top: `${spot.y}%`,
                            opacity: spot.pending ? 0.68 : 1,
                            pointerEvents: (placementMode || routeDrawMode) ? 'none' : undefined,
                          }}
                          aria-label={spot.title}>
                          <span className={`absolute inset-0 blur-sm opacity-70 ${sideStyles.glow} ${shape === 'circle' ? 'rounded-full' : shape === 'square' ? 'rounded-[6px]' : ''}`}
                            style={{ width: `${renderedSize}px`, height: `${renderedSize}px`,
                              clipPath: shape === 'triangle' ? 'polygon(50% 6%, 8% 92%, 92% 92%)' : undefined }} />
                          <ShapeMarker shape={shape}
                            sideClass={spot.pending ? 'bg-emerald-500/90' : sideStyles.marker}
                            borderClass={spot.pending ? 'border-emerald-200' : sideStyles.border}
                            icon={getRoleIcon(primaryRole)} size={renderedSize} isActive={isActive} />
                          {spot.pending && (
                            <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-300/20 bg-emerald-950/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                              Saving
                            </span>
                          )}
                        </button>
                      )
                    })}

                    {/* Pending placement preview */}
                    {pendingPlacement && (
                      <div className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${pendingPlacement.x}%`, top: `${pendingPlacement.y}%` }}>
                        <ShapeMarker shape={getRoleShape(newSpot.roles?.[0] || 'MG')}
                          sideClass="bg-emerald-600/90" borderClass="border-emerald-300"
                          icon={getRoleIcon(newSpot.roles?.[0] || 'MG')}
                          size={Math.max(8, newSpot.roles?.[0] === 'Tank' ? Math.round(clampSpotSize(newSpot.size) * 0.6) : clampSpotSize(newSpot.size))}
                          isActive={false} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    {isLoading ? 'Loading maps...' : 'No maps found'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right panel */}
          <div className="xl:sticky xl:top-[268px] xl:self-start">
            <div className={`${panelClass} p-4 md:p-5`}>
              {/* Tab bar */}
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  {(['list', 'details'] as RightTab[]).map((tab) => (
                    <button key={tab} onClick={() => setRightTab(tab)}
                      className={`${tabButtonClass} ${rightTab === tab
                        ? 'border border-emerald-300/25 bg-emerald-600/90 text-white'
                        : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>
                      {tab === 'list' ? 'Spot List' : 'Spot Details'}
                    </button>
                  ))}
                </div>
                <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  {placementMode === 'cone_first'  ? `${editingConeSide} 1st Edge` :
                   placementMode === 'cone_second' ? `${editingConeSide} 2nd Edge` :
                   placementMode === 'line_end'    ? `${editingConeSide} Line End` :
                   routeDrawMode                   ? 'Drawing Route' :
                   rightTab === 'list'             ? `${sortedSpots.length} Spots` :
                   showAddSpot                     ? 'New Spot' :
                   editingSpotId                   ? 'Editing' :
                   selectedSpot?.pending           ? 'Saving' :
                   selectedSpot                    ? 'Selected' : 'Idle'}
                </span>
              </div>

              {/* ── LIST TAB */}
              {rightTab === 'list' ? (
                <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                  {sortedSpots.length > 0 ? sortedSpots.map((spot) => {
                    const sd          = getSideClasses(spot.side)
                    const primaryRole = spot.roles?.[0] || spot.role || 'MG'
                    const listSize    = Math.max(12, getRenderedSpotSize(spot))
                    return (
                      <button key={spot.id} onClick={() => selectSpot(spot)}
                        className={`w-full rounded-[22px] border p-3 text-left transition ${selectedSpot?.id === spot.id ? 'border-emerald-300/35 bg-emerald-500/10' : 'border-emerald-400/8 bg-emerald-950/18 hover:bg-emerald-900/30'} ${spot.pending ? 'opacity-75' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center">
                            <ShapeMarker shape={getRoleShape(primaryRole)}
                              sideClass={spot.pending ? 'bg-emerald-500/90' : sd.marker}
                              borderClass={spot.pending ? 'border-emerald-200' : sd.border}
                              icon={getRoleIcon(primaryRole)} size={listSize}
                              isActive={selectedSpot?.id === spot.id} />
                          </span>
                          <span className="font-medium text-white">{spot.title}</span>
                          {spot.pending && <span className="rounded-full border border-emerald-300/20 bg-emerald-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-100">Saving</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          <span>{spot.roles.join(', ')}</span>
                          <span>•</span><span>{spot.side}</span>
                          {spot.cones?.Axis   && <><span>•</span><span>Axis Cone</span></>}
                          {spot.cones?.Allies && <><span>•</span><span>Allies Cone</span></>}
                          {spot.fireLines?.Axis   && <><span>•</span><span>Axis Snipe</span></>}
                          {spot.fireLines?.Allies && <><span>•</span><span>Allies Snipe</span></>}
                          {(spot.routes || []).length > 0 && <><span>•</span><span>{spot.routes!.length} Route{spot.routes!.length !== 1 ? 's' : ''}</span></>}
                        </div>
                      </button>
                    )
                  }) : (
                    <div className="rounded-[22px] border border-dashed border-emerald-400/8 bg-emerald-950/18 p-4 text-sm text-zinc-500">
                      No spots match the current filters.
                    </div>
                  )}
                </div>

              /* ── ADD SPOT TAB */
              ) : showAddSpot ? (
                <div className="flex h-full flex-col gap-3">
                  <p className="text-sm text-zinc-400">1. Click map to place. 2. Fill out. 3. Save.</p>
                  <input value={newSpot.title} onChange={(e) => setNewSpot((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Spot title" className={inputClass} />
                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Roles</label>
                    <div className="grid grid-cols-2 gap-2">
                      {roleNames.map((role) => {
                        const checked = newSpot.roles.includes(role)
                        return (
                          <label key={role} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${checked ? 'border-emerald-300/35 bg-emerald-600/20 text-white' : 'border-emerald-300/10 bg-emerald-950/20 text-zinc-300 hover:bg-emerald-900/30'}`}>
                            <input type="checkbox" checked={checked} className="accent-emerald-500"
                              onChange={() => setNewSpot((p) => ({ ...p, roles: toggleRole(p.roles, role) }))} />
                            <span>{role}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <select value={newSpot.side} onChange={(e) => setNewSpot((p) => ({ ...p, side: e.target.value as SpotSide }))} className={inputClass}>
                    <option value="Axis">Axis</option><option value="Allies">Allies</option><option value="Both">Both</option>
                  </select>
                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Spot Size</label>
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                      <input type="range" min="8" max="20" value={clampSpotSize(newSpot.size)}
                        onChange={(e) => setNewSpot((p) => ({ ...p, size: clampSpotSize(Number(e.target.value)) }))}
                        className="w-full accent-emerald-500" />
                      <span className="w-8 text-xs text-zinc-300">{clampSpotSize(newSpot.size)}</span>
                    </div>
                  </div>
                  <textarea value={newSpot.notes} onChange={(e) => setNewSpot((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Notes / purpose / cautions" rows={3} className={inputClass} />
                  <input value={newSpot.youtube} onChange={(e) => setNewSpot((p) => ({ ...p, youtube: e.target.value }))}
                    placeholder="YouTube link" className={inputClass} />
                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-sm text-zinc-300">Upload up to 5 images</label>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload}
                      className="text-sm text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-900/60 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-emerald-800" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {newSpot.images.map((img, idx) => (
                        <div key={idx} className="relative">
                          <img src={img} alt={`Preview ${idx + 1}`} className="h-24 w-full rounded-xl border border-zinc-800 object-cover" />
                          <button onClick={() => removeNewSpotImage(idx)} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white">✕</button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">{newSpot.images.length}/5 images</div>
                  </div>
                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3 text-sm text-zinc-400">
                    {pendingPlacement ? <>Placed at <span className="text-white">{pendingPlacement.x}%</span>, <span className="text-white">{pendingPlacement.y}%</span></> : 'Click the map to place the spot.'}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveNewSpot} disabled={isSavingNewSpot}
                      className={`${buttonClass} ${isSavingNewSpot ? 'cursor-not-allowed opacity-70' : ''}`}>
                      {isSavingNewSpot ? 'Saving...' : 'Save Spot'}
                    </button>
                    <button onClick={() => { revokeUrls(newSpot.images); setPendingPlacement(null); setShowAddSpot(false); resetNewSpotState() }} className={softButtonClass}>Cancel</button>
                  </div>
                </div>

              /* ── EDIT SPOT TAB */
              ) : editingSpotId && selectedSpot ? (
                <div className="flex h-full flex-col gap-3 overflow-y-auto max-h-[78vh] pr-0.5">
                  <input value={editSpot.title} onChange={(e) => setEditSpot((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Spot title" className={inputClass} />

                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Roles</label>
                    <div className="grid grid-cols-2 gap-2">
                      {roleNames.map((role) => {
                        const checked = editSpot.roles.includes(role)
                        return (
                          <label key={role} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${checked ? 'border-emerald-300/35 bg-emerald-600/20 text-white' : 'border-emerald-300/10 bg-emerald-950/20 text-zinc-300 hover:bg-emerald-900/30'}`}>
                            <input type="checkbox" checked={checked} className="accent-emerald-500"
                              onChange={() => setEditSpot((p) => ({ ...p, roles: toggleRole(p.roles, role) }))} />
                            <span>{role}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <select value={editSpot.side} onChange={(e) => {
                    const nextSide = e.target.value as SpotSide
                    setEditSpot((p) => ({ ...p, side: nextSide }))
                    setEditingConeSide(nextSide === 'Allies' ? 'Allies' : 'Axis')
                  }} className={inputClass}>
                    <option value="Axis">Axis</option><option value="Allies">Allies</option><option value="Both">Both</option>
                  </select>

                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Spot Size</label>
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                      <input type="range" min="8" max="20" value={clampSpotSize(editSpot.size)}
                        onChange={(e) => updateEditSpotSize(Number(e.target.value))} className="w-full accent-emerald-500" />
                      <span className="w-8 text-xs text-zinc-300">{clampSpotSize(editSpot.size)}</span>
                    </div>
                  </div>

                  {/* Cone / Line tool panel */}
                  {(canUseCone || canUseLine) && (
                    <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-3 flex flex-wrap gap-2">
                        {availableConeSides.map((s) => (
                          <button key={s} onClick={() => setEditingConeSide(s)}
                            className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${editingConeSide === s ? s === 'Axis' ? 'border border-red-300/30 bg-red-600/80 text-white' : 'border border-blue-300/30 bg-blue-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {canUseCone && <button onClick={() => setToolMode('cone')} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${toolMode === 'cone' ? 'border border-emerald-300/30 bg-emerald-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>Cone</button>}
                        {canUseLine && <button onClick={() => setToolMode('line')} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${toolMode === 'line' ? 'border border-emerald-300/30 bg-emerald-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>Snipe Line</button>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {toolMode === 'cone' && canUseCone && (
                          <>
                            <button onClick={beginConePlacement} className={softButtonClass}>
                              {placementMode ? `Placing ${editingConeSide}...` : `Mark ${editingConeSide} Cone`}
                            </button>
                            <button onClick={clearCone} className={softButtonClass}>Clear {editingConeSide}</button>
                          </>
                        )}
                        {toolMode === 'line' && canUseLine && (
                          <>
                            <div className="mb-2 w-full">
                              <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Midpoint</label>
                              <select value={snipeLineMidpoint} onChange={(e) => setSnipeLineMidpoint(e.target.value)}
                                className={tinyInputClass + ' w-full'}>
                                <option value="Any">Any (always visible)</option>
                                {(selectedMap?.midpoints || []).map((mp) => <option key={mp} value={mp}>{mp}</option>)}
                              </select>
                            </div>
                            <button onClick={beginLinePlacement} className={softButtonClass}>
                              {placementMode === 'line_end' ? `Placing ${editingConeSide}...` : `Mark ${editingConeSide} Snipe`}
                            </button>
                            <button onClick={clearLine} className={softButtonClass}>Clear {editingConeSide}</button>
                          </>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {toolMode === 'cone' && !placementMode && (currentEditingCone ? `${editingConeSide} cone set — ${Math.round(currentEditingCone.length * 28)}m range, ${Math.round(currentEditingCone.spread)}° spread` : `No ${editingConeSide} cone yet.`)}
                        {toolMode === 'cone' && placementMode === 'cone_first'  && `Click the first outer edge of the ${editingConeSide} cone.`}
                        {toolMode === 'cone' && placementMode === 'cone_second' && `Move mouse to preview, click the second edge.`}
                        {toolMode === 'line' && !placementMode && (currentEditingLine ? `${editingConeSide} snipe — ${selectedSpot ? getDistanceMeters(selectedSpot.x, selectedSpot.y, currentEditingLine.endX, currentEditingLine.endY) : 0}m / max ${getMaxRangeMeters(primaryEditRole, editingConeSide)}m` : `No ${editingConeSide} snipe yet.`)}
                        {toolMode === 'line' && placementMode === 'line_end' && `Move mouse to preview, click impact, click the impact point.`}
                      </div>
                    </div>
                  )}

                  {/* Route drawing panel */}
                  {canUseRoute && (
                    <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <label className="mb-3 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Routes</label>

                      {/* Side selector */}
                      <div className="mb-3 flex gap-2">
                        {(['Axis', 'Allies'] as ConeSide[]).map((s) => (
                          <button key={s} onClick={() => setNewRouteConfig((p) => ({ ...p, side: s }))}
                            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${newRouteConfig.side === s ? s === 'Axis' ? 'border border-red-300/30 bg-red-600/80 text-white' : 'border border-blue-300/30 bg-blue-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>
                            {s}
                          </button>
                        ))}
                      </div>

                      {/* Midpoint */}
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Midpoint</label>
                        <select value={newRouteConfig.midpoint} onChange={(e) => setNewRouteConfig((p) => ({ ...p, midpoint: e.target.value }))}
                          className={tinyInputClass + ' w-full'}>
                          <option value="Any">Any Midpoint</option>
                          {(selectedMap?.midpoints || []).map((mp) => <option key={mp} value={mp}>{mp}</option>)}
                        </select>
                      </div>

                      {/* Color picker */}
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Color</label>
                        <div className="flex flex-wrap gap-2">
                          {ROUTE_COLORS.map((c) => (
                            <button key={c.value} onClick={() => setNewRouteConfig((p) => ({ ...p, color: c.value }))}
                              title={c.name}
                              className={`h-7 w-7 rounded-full border-2 transition ${newRouteConfig.color === c.value ? 'border-white scale-125' : 'border-transparent hover:border-white/50'}`}
                              style={{ backgroundColor: c.value }} />
                          ))}
                        </div>
                      </div>

                      {/* Label */}
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Label</label>
                        <select value={newRouteConfig.label} onChange={(e) => setNewRouteConfig((p) => ({ ...p, label: e.target.value }))}
                          className={tinyInputClass + ' w-full'}>
                          {ROUTE_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>

                      {/* Stroke width */}
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Line Width — {newRouteConfig.strokeWidth}px</label>
                        <input type="range" min="2" max="8" value={newRouteConfig.strokeWidth}
                          onChange={(e) => setNewRouteConfig((p) => ({ ...p, strokeWidth: Number(e.target.value) }))}
                          className="w-full accent-emerald-500" />
                      </div>

                      {/* YouTube */}
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Route Video (optional)</label>
                        <input value={newRouteConfig.youtube} onChange={(e) => setNewRouteConfig((p) => ({ ...p, youtube: e.target.value }))}
                          placeholder="YouTube link" className={tinyInputClass + ' w-full'} />
                      </div>

                      {/* Draw button */}
                      <button onClick={() => setRouteDrawMode((p) => !p)}
                        className={`w-full ${routeDrawMode ? buttonClass : softButtonClass}`}>
                        {routeDrawMode ? 'Drawing — hold mouse on map' : 'Draw Route'}
                      </button>
                      {routeDrawMode && <p className="mt-1.5 text-xs text-zinc-500">Hold mouse button down on the map and drag to draw. Release to finish.</p>}

                      {/* Existing routes list */}
                      {editSpot.routes.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <label className="block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Saved Routes ({editSpot.routes.length})</label>
                          {editSpot.routes.map((r) => (
                            <div key={r.id} className="flex items-center gap-2 rounded-xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                              <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                              <span className="flex-1 text-xs text-zinc-300">
                                <span className="font-medium text-white">{r.label}</span>
                                {' · '}{r.side}{' · '}{r.midpoint}
                                {' · '}{getRouteTotalDistance(r)}m
                              </span>
                              <button onClick={() => deleteRoute(r.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <textarea value={editSpot.notes} onChange={(e) => setEditSpot((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Notes" rows={3} className={inputClass} />
                  <input value={editSpot.youtube} onChange={(e) => setEditSpot((p) => ({ ...p, youtube: e.target.value }))}
                    placeholder="YouTube link" className={inputClass} />

                  {/* ── Photo management */}
                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                      Photos ({editSpot.images.length + editSpotNewPreviews.length}/5)
                    </label>

                    {/* Existing photos */}
                    {editSpot.images.length > 0 && (
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {editSpot.images.map((img, idx) => (
                          <div key={idx} className="relative">
                            <img src={img} alt={`Photo ${idx + 1}`}
                              className="h-24 w-full rounded-xl border border-zinc-800 object-cover" />
                            <button
                              onClick={() => setEditSpot((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                              className="absolute right-1 top-1 rounded-full bg-black/80 px-2 py-0.5 text-xs text-white hover:bg-red-900/90"
                              title="Remove photo">✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New photo previews */}
                    {editSpotNewPreviews.length > 0 && (
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {editSpotNewPreviews.map((url, idx) => (
                          <div key={idx} className="relative">
                            <img src={url} alt={`New ${idx + 1}`}
                              className="h-24 w-full rounded-xl border border-emerald-600/40 object-cover" />
                            <span className="absolute left-1 top-1 rounded-full bg-emerald-700/90 px-1.5 py-0.5 text-[10px] text-white">New</span>
                            <button
                              onClick={() => {
                                URL.revokeObjectURL(editSpotNewPreviews[idx])
                                setEditSpotNewPreviews((p) => p.filter((_, i) => i !== idx))
                                setEditSpotNewFiles((p) => p.filter((_, i) => i !== idx))
                              }}
                              className="absolute right-1 top-1 rounded-full bg-black/80 px-2 py-0.5 text-xs text-white hover:bg-red-900/90"
                              title="Remove">✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Upload more */}
                    {editSpot.images.length + editSpotNewPreviews.length < 5 && (
                      <>
                        <input ref={editFileInputRef} type="file" accept="image/*" multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || [])
                            const slots = 5 - editSpot.images.length - editSpotNewPreviews.length
                            const limited = files.slice(0, slots)
                            if (!limited.length) return
                            const previews = limited.map((f) => URL.createObjectURL(f))
                            setEditSpotNewFiles((p) => [...p, ...limited])
                            setEditSpotNewPreviews((p) => [...p, ...previews])
                            if (editFileInputRef.current) editFileInputRef.current.value = ''
                          }}
                          className="text-sm text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-900/60 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-emerald-800" />
                        <p className="mt-1.5 text-xs text-zinc-600">
                          {5 - editSpot.images.length - editSpotNewPreviews.length} slot{5 - editSpot.images.length - editSpotNewPreviews.length !== 1 ? 's' : ''} remaining
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={saveEditedSpot} className={buttonClass}>Save Changes</button>
                    <button onClick={cancelEditSpot} className={softButtonClass}>Cancel</button>
                  </div>
                </div>

              /* ── VIEW SPOT TAB */
              ) : selectedSpot ? (
                <div className="flex h-full flex-col overflow-y-auto max-h-[78vh] pr-0.5">
                  {/* Images */}
                  {selectedSpot.images && selectedSpot.images.length > 0 ? (
                    <>
                      <img src={selectedSpot.images[0]} alt={selectedSpot.title}
                        className="h-48 w-full cursor-pointer rounded-[24px] border border-zinc-800 object-cover"
                        onClick={() => setLightboxImage(selectedSpot.images![0])} />
                      {selectedSpot.images.length > 1 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {selectedSpot.images.map((img, idx) => (
                            <img key={idx} src={img} alt={`${selectedSpot.title} ${idx + 1}`}
                              className="h-16 w-full cursor-pointer rounded-xl border border-zinc-800 object-cover"
                              onClick={() => setLightboxImage(img)} />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center rounded-[24px] border border-dashed border-emerald-400/10 bg-emerald-950/18 text-zinc-500">No images</div>
                  )}

                  {/* Badges */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-400">
                    {selectedSpot.roles.map((r) => (
                      <span key={r} className={`rounded-full px-3 py-1 text-white ${getRoleColor(r)}`}>{r}</span>
                    ))}
                    <span className={`rounded-full px-3 py-1 ${getSideClasses(selectedSpot.side).badge}`}>{selectedSpot.side}</span>
                    {selectedSpot.cones?.Axis    && <span className="rounded-full border border-red-300/15 bg-red-900/35 px-3 py-1 text-white">Axis Cone</span>}
                    {selectedSpot.cones?.Allies  && <span className="rounded-full border border-blue-300/15 bg-blue-900/35 px-3 py-1 text-white">Allies Cone</span>}
                    {selectedSpot.fireLines?.Axis    && <span className="rounded-full border border-red-300/15 bg-red-900/35 px-3 py-1 text-white">Axis Snipe</span>}
                    {selectedSpot.fireLines?.Allies  && <span className="rounded-full border border-blue-300/15 bg-blue-900/35 px-3 py-1 text-white">Allies Snipe</span>}
                    {selectedSpot.pending && <span className="rounded-full border border-emerald-300/20 bg-emerald-950/70 px-3 py-1 text-emerald-100">Saving...</span>}
                  </div>

                  <h3 className="mt-4 text-2xl font-bold text-white">{selectedSpot.title}</h3>
                  {selectedSpot.notes && <p className="mt-3 text-sm leading-6 text-zinc-300">{selectedSpot.notes}</p>}

                  {/* Spot size slider */}
                  {!selectedSpot.pending && (
                    <div className="mt-4">
                      <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Spot Size</label>
                      <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                        <input type="range" min="8" max="20" value={clampSpotSize(selectedSpot.size)}
                          onChange={(e) => updateSelectedSpotSize(Number(e.target.value))}
                          className="w-full accent-emerald-500" />
                        <span className="w-8 text-xs text-zinc-300">{clampSpotSize(selectedSpot.size)}</span>
                      </div>
                    </div>
                  )}

                  {/* Cone info */}
                  {(selectedSpot.cones?.Axis || selectedSpot.cones?.Allies) && (
                    <div className="mt-4 rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-2 font-medium text-white">Line of Sight Cones</div>
                      {selectedSpot.cones?.Axis && (
                        <div className="grid grid-cols-3 gap-2 text-xs uppercase tracking-[0.16em] text-red-300">
                          <div>Dir <span className="normal-case text-white">{Math.round(selectedSpot.cones.Axis.angle)}°</span></div>
                          <div>Spread <span className="normal-case text-white">{Math.round(selectedSpot.cones.Axis.spread)}°</span></div>
                          <div>Range <span className="normal-case text-white">{Math.round(selectedSpot.cones.Axis.length * 28)}m</span></div>
                        </div>
                      )}
                      {selectedSpot.cones?.Allies && (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs uppercase tracking-[0.16em] text-blue-300">
                          <div>Dir <span className="normal-case text-white">{Math.round(selectedSpot.cones.Allies.angle)}°</span></div>
                          <div>Spread <span className="normal-case text-white">{Math.round(selectedSpot.cones.Allies.spread)}°</span></div>
                          <div>Range <span className="normal-case text-white">{Math.round(selectedSpot.cones.Allies.length * 28)}m</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fire line info */}
                  {(selectedSpot.fireLines?.Axis || selectedSpot.fireLines?.Allies) && (
                    <div className="mt-4 rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-2 font-medium text-white">Snipe Lines</div>
                      {selectedSpot.fireLines?.Axis && (() => {
                        const l = selectedSpot.fireLines!.Axis!
                        const dm = getDistanceMeters(selectedSpot.x, selectedSpot.y, l.endX, l.endY)
                        const maxM = getMaxRangeMeters(selectedSpot.roles?.[0] || selectedSpot.role || 'MG', 'Axis')
                        return (
                          <div className="grid grid-cols-3 gap-2 text-xs uppercase tracking-[0.16em] text-red-300">
                            <div>Axis <span className="normal-case text-white">{dm}m</span></div>
                            <div>Max <span className="normal-case text-white">{maxM}m</span>{dm > maxM && <span className="ml-1 text-yellow-400">OUT</span>}</div>
                            <div className="normal-case text-zinc-400">{l.midpoint !== 'Any' ? l.midpoint : 'Any'}</div>
                          </div>
                        )
                      })()}
                      {selectedSpot.fireLines?.Allies && (() => {
                        const l = selectedSpot.fireLines!.Allies!
                        const dm = getDistanceMeters(selectedSpot.x, selectedSpot.y, l.endX, l.endY)
                        const maxM = getMaxRangeMeters(selectedSpot.roles?.[0] || selectedSpot.role || 'MG', 'Allies')
                        return (
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs uppercase tracking-[0.16em] text-blue-300">
                            <div>Allies <span className="normal-case text-white">{dm}m</span></div>
                            <div>Max <span className="normal-case text-white">{maxM}m</span>{dm > maxM && <span className="ml-1 text-yellow-400">OUT</span>}</div>
                            <div className="normal-case text-zinc-400">{l.midpoint !== 'Any' ? l.midpoint : 'Any'}</div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* Routes */}
                  {(selectedSpot.routes || []).length > 0 && (
                    <div className="mt-4 rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-3 font-medium text-white">Driving Routes</div>
                      <div className="space-y-2">
                        {(selectedSpot.routes || []).map((route) => {
                          const isSelected = selectedRouteId === route.id
                          const totalDist  = getRouteTotalDistance(route)
                          return (
                            <button key={route.id} onClick={() => setSelectedRouteId(isSelected ? null : route.id)}
                              className={`w-full rounded-xl border p-2.5 text-left transition ${isSelected ? 'border-emerald-300/30 bg-emerald-600/15' : 'border-emerald-400/8 bg-emerald-950/20 hover:bg-emerald-900/30'}`}>
                              <div className="flex items-center gap-2">
                                <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-white/20"
                                  style={{ backgroundColor: route.color }} />
                                <span className="font-medium text-white text-sm">{route.label}</span>
                                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${route.side === 'Axis' ? 'bg-red-700/70 text-red-100' : 'bg-blue-700/70 text-blue-100'}`}>{route.side}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
                                <span>{route.midpoint}</span>
                                <span>{totalDist}m total</span>
                                {route.youtube && <span className="text-emerald-400">▶ Video</span>}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                      {/* Selected route video */}
                      {selectedRoute && selectedRouteEmbed && (
                        <div className="mt-3 overflow-hidden rounded-[20px] border border-zinc-800 bg-black">
                          <iframe className="aspect-video w-full" src={`${selectedRouteEmbed}?rel=0&modestbranding=1`}
                            title={`${selectedRoute.label} route video`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen />
                        </div>
                      )}
                      {selectedRoute && selectedRoute.youtube && !selectedRouteEmbed && (
                        <a href={selectedRoute.youtube} target="_blank" rel="noreferrer"
                          className="mt-2 inline-flex items-center rounded-xl border border-emerald-300/15 bg-emerald-900/35 px-3 py-1.5 text-sm hover:bg-emerald-800/55">
                          Open route video ↗
                        </a>
                      )}
                    </div>
                  )}

                  {/* Spot YouTube */}
                  {selectedSpotEmbedUrl && (
                    <div className="mt-5 overflow-hidden rounded-[24px] border border-zinc-800 bg-black">
                      <iframe className="aspect-video w-full" src={`${selectedSpotEmbedUrl}?rel=0&modestbranding=1`}
                        title={`${selectedSpot.title} video`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen />
                    </div>
                  )}
                  {selectedSpot.youtube && (
                    <a href={selectedSpot.youtube} target="_blank" rel="noreferrer"
                      className="mt-3 inline-flex w-fit items-center rounded-2xl border border-emerald-300/15 bg-emerald-900/35 px-4 py-2 text-sm font-medium hover:bg-emerald-800/55">
                      Open on YouTube ↗
                    </a>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button onClick={startEditingSpot} disabled={!!selectedSpot.pending}
                      className={`${softButtonClass} ${selectedSpot.pending ? 'cursor-not-allowed opacity-60' : ''}`}>
                      Edit Spot
                    </button>
                    <button onClick={deleteSelectedSpot} disabled={!!selectedSpot.pending}
                      className={`inline-flex items-center rounded-2xl border border-red-700 bg-red-900/60 px-4 py-2 text-sm font-medium hover:bg-red-800/70 ${selectedSpot.pending ? 'cursor-not-allowed opacity-60' : ''}`}>
                      Delete Spot
                    </button>
                  </div>
                </div>

              /* ── EMPTY STATE */
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-[24px] border border-dashed border-emerald-400/10 bg-emerald-950/18 p-8 text-center">
                  <div>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/10 bg-emerald-900/25 text-2xl">🎯</div>
                    <h3 className="text-xl font-semibold text-white">Select a spot</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">Click a marker on the map or a name in the list.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setLightboxImage(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button onClick={() => setLightboxImage(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-3 py-1 text-sm text-white">✕</button>
            <img src={lightboxImage} alt="Enlarged"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}