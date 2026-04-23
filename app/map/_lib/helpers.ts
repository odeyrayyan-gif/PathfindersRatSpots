// app/map/_lib/helpers.ts

import type {
  ConeSide,
  MapData,
  MapOrientation,
  Spot,
  SpotCone,
  SpotConeSet,
  SpotLine,
  SpotLineSet,
  SpotRoute,
  SpotSide,
} from './types'

import { HORIZONTAL_MAPS } from './constants'

export function getMapOrientation(mapName: string): MapOrientation {
  return HORIZONTAL_MAPS.has(mapName.trim().toLowerCase()) ? 'horizontal' : 'vertical'
}

// Map is always 2000m × 2000m (10×10 grid squares × 200m each).
// Coordinates are 0–100%, so 1% = 20m. This never changes per map.
export function getDistanceMeters(x1: number, y1: number, x2: number, y2: number): number {
  const dx = (x2 - x1) * 20
  const dy = (y2 - y1) * 20
  return Math.round(Math.sqrt(dx * dx + dy * dy))
}

export function getRouteTotalDistance(route: SpotRoute): number {
  let total = 0
  for (let i = 1; i < route.points.length; i++) {
    total += getDistanceMeters(
      route.points[i - 1].x, route.points[i - 1].y,
      route.points[i].x, route.points[i].y,
    )
  }
  return total
}

export function getMaxRangeMeters(role: string, side: SpotSide | ConeSide): number {
  if (role === 'Tank' || role === 'Anti-Tank Gun') return 1000
  if (role === 'Anti-Tank') return side === 'Axis' ? 950 : 750
  return 500
}

export function roleSupportsCone(role: string): boolean {
  return ['MG', 'Tank', 'Anti-Tank Gun', 'Sniper', 'Infantry'].includes(role)
}

export function roleSupportsLine(role: string): boolean {
  return ['Tank', 'Anti-Tank Gun', 'Anti-Tank'].includes(role)
}

export function roleSupportsRoute(role: string): boolean {
  return role === 'Tank' || role === 'Truck'
}

export function metersToPercent(meters: number): number {
  return meters / 20
}

// OOB zones: horizontal = top+bottom 20%, vertical = left+right 20%
export function getPlayableBounds(orientation: MapOrientation) {
  return orientation === 'horizontal'
    ? { xMin: 0, xMax: 100, yMin: 20, yMax: 80 }
    : { xMin: 20, xMax: 80, yMin: 0, yMax: 100 }
}

export function isOutOfBounds(x: number, y: number, orientation: MapOrientation): boolean {
  const b = getPlayableBounds(orientation)
  return x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax
}

export function normalizeSide(side: unknown): SpotSide {
  const v = String(side ?? '').trim().toLowerCase()
  if (v === 'axis') return 'Axis'
  if (v === 'allies') return 'Allies'
  if (v === 'both') return 'Both'
  return 'Both'
}

export function clampSpotSize(size: number): number {
  return Math.max(2, Math.min(20, Number(size || 12)))
}

export function normalizeRoles(raw: any): string[] {
  if (Array.isArray(raw.roles) && raw.roles.length > 0) return raw.roles.filter(Boolean)
  if (typeof raw.role === 'string' && raw.role.trim()) return [raw.role.trim()]
  return ['MG']
}

export function normalizeCone(rawCone: any): SpotCone | null {
  if (!rawCone || typeof rawCone !== 'object') return null
  const angle = Number(rawCone.angle)
  const spread = Number(rawCone.spread)
  const length = Number(rawCone.length)
  if (isNaN(angle) || isNaN(spread) || isNaN(length)) return null
  return {
    angle: ((angle % 360) + 360) % 360,
    spread: Math.max(5, Math.min(180, spread)),
    length: Math.max(0.5, Math.min(100, length)),
  }
}

export function normalizeConeSet(rawCone: any): SpotConeSet | null {
  if (!rawCone || typeof rawCone !== 'object') return null
  const axis = normalizeCone(rawCone.Axis)
  const allies = normalizeCone(rawCone.Allies)
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}

export function normalizeLine(rawLine: any): SpotLine | null {
  if (!rawLine || typeof rawLine !== 'object') return null
  const endX = Number(rawLine.endX)
  const endY = Number(rawLine.endY)
  if (isNaN(endX) || isNaN(endY)) return null
  return {
    endX: Math.max(0, Math.min(100, endX)),
    endY: Math.max(0, Math.min(100, endY)),
    midpoint: typeof rawLine.midpoint === 'string' ? rawLine.midpoint : 'Any',
  }
}

export function normalizeLineSet(rawLines: any): SpotLineSet | null {
  if (!rawLines || typeof rawLines !== 'object') return null
  const axis = normalizeLine(rawLines.Axis)
  const allies = normalizeLine(rawLines.Allies)
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}

export function normalizeRoute(raw: any): SpotRoute | null {
  if (!raw || typeof raw !== 'object') return null
  if (!Array.isArray(raw.points) || raw.points.length < 2) return null
  const points = raw.points
    .map((p: any) => ({ x: Number(p.x), y: Number(p.y) }))
    .filter((p: any) => !isNaN(p.x) && !isNaN(p.y))
  if (points.length < 2) return null
  return {
    id: raw.id || `route-${Math.random().toString(36).slice(2)}`,
    points,
    color: typeof raw.color === 'string' ? raw.color : '#22c55e',
    label: typeof raw.label === 'string' ? raw.label : 'WAMO',
    strokeWidth: Math.max(2, Math.min(8, Number(raw.strokeWidth) || 4)),
    side: raw.side === 'Allies' ? 'Allies' : 'Axis',
    midpoint: typeof raw.midpoint === 'string' ? raw.midpoint : 'Any',
    youtube: raw.youtube ?? null,
  }
}

export function normalizeRoutes(raw: any): SpotRoute[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeRoute).filter((r): r is SpotRoute => r !== null)
}

export function normalizeSpot(raw: any): Spot {
  const roles = normalizeRoles(raw)
  return {
    id: raw.id,
    map_id: raw.map_id,
    title: raw.title ?? '',
    role: roles[0] || 'MG',
    roles,
    side: normalizeSide(raw.side),
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    notes: raw.notes ?? '',
    youtube: raw.youtube ?? null,
    images: Array.isArray(raw.images) ? raw.images : [],
    size: clampSpotSize(raw.size ?? 12),
    requiresBuildable: Boolean(raw.requires_buildable),
    verified: Boolean(raw.verified),
    patchVersion: raw.patch_version ?? '',
    createdBy: raw.created_by ?? null,
    createdByName: raw.created_by_name ?? null,
    lastEditedBy: raw.last_edited_by ?? null,
    lastEditedByName: raw.last_edited_by_name ?? null,
    lastEditedAt: raw.last_edited_at ?? null,
    cones: normalizeConeSet(raw.cone),
    fireLines: normalizeLineSet(raw.fire_lines),
    routes: normalizeRoutes(raw.routes),
    created_at: raw.created_at,
    pending: false,
  }
}

export function buildMapsWithSpots(mapsData: any[], spotsData: any[]): MapData[] {
  const spots = (spotsData || []).map(normalizeSpot)
  return (mapsData || []).map((map) => ({
    id: map.id,
    name: map.name,
    image: map.image,
    overlay: map.overlay,
    elevation: map.elevation ?? null,
    midpoints: Array.isArray(map.midpoints) ? map.midpoints : [],
    spots: spots.filter((s) => s.map_id === map.id),
  }))
}

export function parseIcon(icon?: string | null) {
  const trimmed = icon?.trim()
  if (!trimmed) return { type: 'emoji' as const, value: '📍' }
  const discordMatch = trimmed.match(/^<a?:\\w+:(\\d+)>$/)
  if (discordMatch) {
    return { type: 'image' as const, value: `https://cdn.discordapp.com/emojis/${discordMatch[1]}.png` }
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return { type: 'image' as const, value: trimmed }
  }
  return { type: 'emoji' as const, value: trimmed }
}

export function getSideClasses(side: SpotSide | ConeSide) {
  if (side === 'Axis') return {
    marker: 'bg-red-600/95',
    glow: 'bg-red-500',
    badge: 'bg-red-700/90 text-white border border-red-300/40',
    border: 'border-red-300',
    coneFill: 'rgba(239,68,68,0.22)',
    coneStroke: 'rgba(255,200,200,0.80)',
    lineStroke: 'rgba(255,180,180,0.95)',
    lineGlow: 'rgba(239,68,68,0.40)',
  }
  if (side === 'Allies') return {
    marker: 'bg-blue-600/95',
    glow: 'bg-blue-500',
    badge: 'bg-blue-700/90 text-white border border-blue-300/40',
    border: 'border-blue-300',
    coneFill: 'rgba(59,130,246,0.22)',
    coneStroke: 'rgba(200,230,255,0.80)',
    lineStroke: 'rgba(180,210,255,0.95)',
    lineGlow: 'rgba(59,130,246,0.40)',
  }
  return {
    marker: 'bg-violet-600/95',
    glow: 'bg-violet-500',
    badge: 'bg-violet-700/90 text-white border border-violet-300/40',
    border: 'border-violet-300',
    coneFill: 'rgba(139,92,246,0.22)',
    coneStroke: 'rgba(230,210,255,0.80)',
    lineStroke: 'rgba(220,200,255,0.95)',
    lineGlow: 'rgba(139,92,246,0.40)',
  }
}

export function getYouTubeEmbedUrl(url?: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.replace(/^www\\./, '')
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

export function createConeFromEdges(
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
  const diff = ((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const center = a1 + diff / 2

  const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
  const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
  const raw = Math.max(d1, d2)
  const maxPct = metersToPercent(getMaxRangeMeters(spot.roles?.[0] || 'MG', coneSide))

  return {
    angle: ((center * 180) / Math.PI + 360) % 360,
    spread: Math.max(5, Math.min(180, Math.abs(diff) * (180 / Math.PI))),
    length: Math.min(raw, maxPct),
  }
}

export function cleanupConeSet(cones: SpotConeSet | null | undefined): SpotConeSet | null {
  if (!cones) return null
  const axis = cones.Axis ?? null
  const allies = cones.Allies ?? null
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}

export function cleanupLineSet(lines: SpotLineSet | null | undefined): SpotLineSet | null {
  if (!lines) return null
  const axis = lines.Axis ?? null
  const allies = lines.Allies ?? null
  if (!axis && !allies) return null
  return { Axis: axis, Allies: allies }
}
