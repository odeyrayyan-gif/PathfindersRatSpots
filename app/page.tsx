'use client'

import React from 'react'
import { supabase } from '@/lib/supabase'

type SpotSide = 'Axis' | 'Allies' | 'Both'
type RightTab = 'list' | 'details'
type MarkerShape = 'circle' | 'square' | 'triangle'
type ConeSide = 'Axis' | 'Allies'
type LosFilter = 'all' | 'axis' | 'allies' | 'none'

type SpotCone = {
  angle: number
  spread: number
  length: number
}

type SpotConeSet = {
  Axis?: SpotCone | null
  Allies?: SpotCone | null
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
  created_at?: string
  pending?: boolean
}

type MapData = {
  id: string
  name: string
  image: string
  overlay?: string | null
  spots: Spot[]
}

const FIXED_ROLES = [
  { name: 'MG', icon: '/icons/hll/machine-gunner.png', color: 'bg-red-500', shape: 'circle' as MarkerShape },
  { name: 'Infantry', icon: '/icons/hll/rifleman.png', color: 'bg-green-500', shape: 'circle' as MarkerShape },
  { name: 'Tank', icon: '/icons/hll/tank.png', color: 'bg-yellow-500', shape: 'square' as MarkerShape },
  { name: 'Truck', icon: '/icons/hll/truck.png', color: 'bg-blue-500', shape: 'square' as MarkerShape },
  { name: 'Sniper', icon: '/icons/hll/sniper.png', color: 'bg-purple-500', shape: 'circle' as MarkerShape },
  { name: 'Anti-Tank', icon: '/icons/hll/anti-tank.png', color: 'bg-orange-500', shape: 'circle' as MarkerShape },
  { name: 'Anti-Tank Gun', icon: '/icons/hll/anti-tank-gun.png', color: 'bg-slate-400', shape: 'triangle' as MarkerShape },
] as const

function normalizeSide(side: unknown): SpotSide {
  const value = String(side ?? '').toLowerCase()
  if (value === 'axis') return 'Axis'
  if (value === 'allies') return 'Allies'
  return 'Both'
}

function clampSpotSize(size: number) {
  return Math.max(8, Math.min(20, Number(size || 12)))
}

function normalizeRoles(raw: any): string[] {
  if (Array.isArray(raw.roles) && raw.roles.length > 0) {
    return raw.roles.filter(Boolean)
  }

  if (typeof raw.role === 'string' && raw.role.trim()) {
    return [raw.role.trim()]
  }

  return ['MG']
}

function normalizeCone(rawCone: any): SpotCone | null {
  if (!rawCone || typeof rawCone !== 'object') return null

  const angle = Number(rawCone.angle)
  const spread = Number(rawCone.spread)
  const length = Number(rawCone.length)

  if (Number.isNaN(angle) || Number.isNaN(spread) || Number.isNaN(length)) {
    return null
  }

  return {
    angle: ((angle % 360) + 360) % 360,
    spread: Math.max(5, Math.min(180, spread)),
    length: Math.max(5, Math.min(60, length)),
  }
}

function normalizeConeSet(rawCone: any): SpotConeSet | null {
  if (!rawCone || typeof rawCone !== 'object') return null

  const axis = normalizeCone(rawCone.Axis)
  const allies = normalizeCone(rawCone.Allies)

  if (!axis && !allies) return null

  return {
    Axis: axis,
    Allies: allies,
  }
}

function getPrimaryRoleFromSpot(raw: any): string {
  const roles = normalizeRoles(raw)
  return roles[0] || 'MG'
}

function normalizeSpot(raw: any): Spot {
  const roles = normalizeRoles(raw)
  return {
    id: raw.id,
    map_id: raw.map_id,
    title: raw.title ?? '',
    role: getPrimaryRoleFromSpot(raw),
    roles,
    side: normalizeSide(raw.side),
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    notes: raw.notes ?? '',
    youtube: raw.youtube ?? null,
    images: Array.isArray(raw.images) ? raw.images : [],
    size: clampSpotSize(raw.size ?? 12),
    cones: normalizeConeSet(raw.cone),
    created_at: raw.created_at,
    pending: false,
  }
}

function buildMapsWithSpots(mapsData: any[], spotsData: any[]): MapData[] {
  const normalizedSpots = (spotsData || []).map(normalizeSpot)

  return (mapsData || []).map((map) => ({
    id: map.id,
    name: map.name,
    image: map.image,
    overlay: map.overlay,
    spots: normalizedSpots.filter((spot) => spot.map_id === map.id),
  }))
}

function parseIcon(icon?: string | null) {
  const trimmed = icon?.trim()

  if (!trimmed) {
    return { type: 'emoji' as const, value: '📍' }
  }

  const discordMatch = trimmed.match(/^<a?:\w+:(\d+)>$/)
  if (discordMatch) {
    const id = discordMatch[1]
    return {
      type: 'image' as const,
      value: `https://cdn.discordapp.com/emojis/${id}.png`,
    }
  }

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return {
      type: 'image' as const,
      value: trimmed,
    }
  }

  return {
    type: 'emoji' as const,
    value: trimmed,
  }
}

function getSideClasses(side: SpotSide | ConeSide) {
  if (side === 'Axis') {
    return {
      marker: 'bg-red-600/95',
      glow: 'bg-red-500',
      badge: 'bg-red-700/90 text-white border border-red-300/40',
      border: 'border-red-300',
      coneFill: 'rgba(239,68,68,0.28)',
      coneStroke: 'rgba(255,200,200,0.72)',
    }
  }

  if (side === 'Allies') {
    return {
      marker: 'bg-blue-600/95',
      glow: 'bg-blue-500',
      badge: 'bg-blue-700/90 text-white border border-blue-300/40',
      border: 'border-blue-300',
      coneFill: 'rgba(59,130,246,0.28)',
      coneStroke: 'rgba(200,230,255,0.72)',
    }
  }

  return {
    marker: 'bg-violet-600/95',
    glow: 'bg-violet-500',
    badge: 'bg-violet-700/90 text-white border border-violet-300/40',
    border: 'border-violet-300',
    coneFill: 'rgba(139,92,246,0.28)',
    coneStroke: 'rgba(230,210,255,0.72)',
  }
}

function getYouTubeEmbedUrl(url?: string | null) {
  if (!url) return null

  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.replace(/^www\./, '')

    let id: string | null = null

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      id = parsed.searchParams.get('v')
      if (!id) {
        const parts = parsed.pathname.split('/').filter(Boolean)
        const embedIndex = parts.indexOf('embed')
        if (embedIndex !== -1 && parts[embedIndex + 1]) {
          id = parts[embedIndex + 1]
        }
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

function MarkerIcon({
  icon,
  className = '',
  sizePx = 16,
}: {
  icon?: string | null
  className?: string
  sizePx?: number
}) {
  const parsed = parseIcon(icon || '📍')

  if (parsed.type === 'image') {
    return (
      <img
        src={parsed.value}
        alt="icon"
        className={`object-contain ${className}`}
        style={{ width: sizePx, height: sizePx }}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  return (
    <span
      className={`flex items-center justify-center text-white leading-none ${className}`}
      style={{
        fontSize: `${sizePx}px`,
        width: `${sizePx}px`,
        height: `${sizePx}px`,
      }}
    >
      {parsed.value}
    </span>
  )
}

function ShapeMarker({
  shape,
  sideClass,
  borderClass,
  icon,
  size,
  isActive,
}: {
  shape: MarkerShape
  sideClass: string
  borderClass: string
  icon: string
  size: number
  isActive: boolean
}) {
  const common =
    `relative flex items-center justify-center border-2 ${sideClass} ${borderClass} shadow-[0_10px_25px_rgba(0,0,0,0.35)] ` +
    (isActive ? 'scale-125' : 'group-hover:scale-110')

  if (shape === 'square') {
    return (
      <span
        className={`${common} rounded-[6px]`}
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <MarkerIcon icon={icon} sizePx={Math.max(6, Math.round(size * 0.5))} />
      </span>
    )
  }

  if (shape === 'triangle') {
    return (
      <span
        className={`relative flex items-center justify-center ${isActive ? 'scale-125' : 'group-hover:scale-110'}`}
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <span
          className="absolute inset-0"
          style={{ clipPath: 'polygon(50% 6%, 8% 92%, 92% 92%)' }}
        >
          <span className={`absolute inset-0 ${sideClass}`} />
          <span
            className={`absolute inset-0 border-2 ${borderClass}`}
            style={{ clipPath: 'polygon(50% 6%, 8% 92%, 92% 92%)' }}
          />
        </span>
        <span className="relative mt-1">
          <MarkerIcon icon={icon} sizePx={Math.max(6, Math.round(size * 0.42))} />
        </span>
      </span>
    )
  }

  return (
    <span
      className={`${common} rounded-full`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <MarkerIcon icon={icon} sizePx={Math.max(6, Math.round(size * 0.5))} />
    </span>
  )
}

function ConeOverlay({
  x,
  y,
  cone,
  side,
  preview = false,
}: {
  x: number
  y: number
  cone: SpotCone
  side: ConeSide
  preview?: boolean
}) {
  const sideStyles = getSideClasses(side)

  const radius = cone.length * 18
  const startRad = (-cone.spread / 2) * (Math.PI / 180)
  const endRad = (cone.spread / 2) * (Math.PI / 180)

  const x1 = radius * Math.cos(startRad)
  const y1 = radius * Math.sin(startRad)
  const x2 = radius * Math.cos(endRad)
  const y2 = radius * Math.sin(endRad)

  const largeArcFlag = cone.spread > 180 ? 1 : 0

  const pathData = [
    `M 0 0`,
    `L ${x1} ${y1}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
    `Z`,
  ].join(' ')

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: 0,
        height: 0,
        overflow: 'visible',
      }}
    >
      <svg
        width={radius * 2}
        height={radius * 2}
        viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}
        style={{
          position: 'absolute',
          left: `${-radius}px`,
          top: `${-radius}px`,
          overflow: 'visible',
          transform: `rotate(${cone.angle}deg)`,
          transformOrigin: `${radius}px ${radius}px`,
          opacity: preview ? 0.95 : 1,
        }}
      >
        <path
          d={pathData}
          fill={sideStyles.coneFill}
          stroke={sideStyles.coneStroke}
          strokeWidth="2"
          strokeDasharray={preview ? '6 4' : undefined}
        />
        <circle cx="0" cy="0" r="3" fill={sideStyles.coneStroke} />
      </svg>
    </div>
  )
}

const panelClass =
  'rounded-3xl border border-emerald-400/15 bg-[linear-gradient(180deg,rgba(18,52,29,0.84),rgba(11,28,16,0.9))] shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl'

const inputClass =
  'w-full rounded-2xl border border-emerald-300/15 bg-emerald-950/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-emerald-100/30 focus:border-emerald-300/50 focus:bg-emerald-950/50'

const buttonClass =
  'rounded-2xl border border-emerald-300/25 bg-emerald-600/90 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 hover:border-emerald-200/40'

const softButtonClass =
  'rounded-2xl border border-emerald-300/15 bg-emerald-900/40 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55'

const tabButtonClass =
  'rounded-2xl px-4 py-2 text-sm font-medium transition'

function computeConeFromEdges(
  spot: { x: number; y: number },
  edgeA: { x: number; y: number },
  edgeB: { x: number; y: number }
): SpotCone {
  const sx = spot.x
  const sy = spot.y

  const dx1 = edgeA.x - sx
  const dy1 = edgeA.y - sy
  const dx2 = edgeB.x - sx
  const dy2 = edgeB.y - sy

  const a1 = Math.atan2(dy1, dx1)
  const a2 = Math.atan2(dy2, dx2)

  const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
  const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)

  let diff = ((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const center = a1 + diff / 2

  return {
    angle: ((center * 180) / Math.PI + 360) % 360,
    spread: Math.max(5, Math.min(180, Math.abs(diff) * (180 / Math.PI))),
    length: Math.max(5, Math.min(60, Number(Math.max(d1, d2).toFixed(1)))),
  }
}

function cleanupConeSet(cones: SpotConeSet | null | undefined): SpotConeSet | null {
  if (!cones) return null
  const axis = cones.Axis ?? null
  const allies = cones.Allies ?? null
  if (!axis && !allies) return null
  return {
    Axis: axis,
    Allies: allies,
  }
}

export default function IntelMap() {
  const [maps, setMaps] = React.useState<MapData[]>([])
  const [selectedMapId, setSelectedMapId] = React.useState<string>('utah')
  const [selectedSpot, setSelectedSpot] = React.useState<Spot | null>(null)
  const [editingSpotId, setEditingSpotId] = React.useState<number | null>(null)
  const [rightTab, setRightTab] = React.useState<RightTab>('list')

  const [roleFilter, setRoleFilter] = React.useState<string>('All')
  const [sortMode, setSortMode] = React.useState<'alphabetical' | 'role'>(
    'alphabetical'
  )
  const [searchTerm, setSearchTerm] = React.useState('')
  const [losFilter, setLosFilter] = React.useState<LosFilter>('all')
  const [showAddSpot, setShowAddSpot] = React.useState(false)
  const [isSavingNewSpot, setIsSavingNewSpot] = React.useState(false)

  const [scale, setScale] = React.useState(1)
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)

  const [showSatellite, setShowSatellite] = React.useState(false)
  const [overlayOpacity, setOverlayOpacity] = React.useState(55)
  const [overlayBroken, setOverlayBroken] = React.useState<Record<string, boolean>>({})

  const [pendingPlacement, setPendingPlacement] = React.useState<{
    x: number
    y: number
  } | null>(null)
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  const [conePlacementMode, setConePlacementMode] =
    React.useState<null | 'first_edge' | 'second_edge'>(null)
  const [coneDraftSpotId, setConeDraftSpotId] =
    React.useState<number | string | null>(null)
  const [coneFirstEdge, setConeFirstEdge] =
    React.useState<{ x: number; y: number } | null>(null)
  const [conePreviewPoint, setConePreviewPoint] =
    React.useState<{ x: number; y: number } | null>(null)
  const [editingConeSide, setEditingConeSide] = React.useState<ConeSide>('Axis')

  const [newSpot, setNewSpot] = React.useState({
    title: '',
    roles: ['MG'] as string[],
    side: 'Both' as SpotSide,
    notes: '',
    youtube: '',
    images: [] as string[],
    imageFiles: [] as File[],
    size: 12,
  })

  const [editSpot, setEditSpot] = React.useState({
    title: '',
    roles: ['MG'] as string[],
    side: 'Both' as SpotSide,
    notes: '',
    youtube: '',
    size: 12,
    cones: null as SpotConeSet | null,
  })

  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const dragRef = React.useRef({
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  })

  const selectedMap = maps.find((map) => map.id === selectedMapId) || null

  const hasSatellite =
    Boolean(selectedMap?.overlay) &&
    !!selectedMap &&
    !overlayBroken[selectedMap.id]

  const currentSpots = selectedMap?.spots || []
  const selectedSpotEmbedUrl = getYouTubeEmbedUrl(selectedSpot?.youtube)

  const roleNames = FIXED_ROLES.map((r) => r.name)

  const getRoleColor = (role: string) => {
    return FIXED_ROLES.find((r) => r.name === role)?.color || 'bg-emerald-500'
  }

  const getRoleIcon = (roleName: string) => {
    return FIXED_ROLES.find((r) => r.name === roleName)?.icon || '📍'
  }

  const getRoleShape = (roleName: string): MarkerShape => {
    return FIXED_ROLES.find((r) => r.name === roleName)?.shape || 'circle'
  }

  const getRenderedSpotSize = (spot: Spot) => {
    const primaryRole = spot.roles?.[0] || spot.role || 'MG'
    if (primaryRole === 'Tank') return Math.max(5, Math.round(spot.size * 0.6))
    return spot.size
  }

  const getRenderedDraftSize = (roles: string[], size: number) => {
    const primaryRole = roles?.[0] || 'MG'
    if (primaryRole === 'Tank') return Math.max(5, Math.round(size * 0.6))
    return size
  }

  const availableConeSides: ConeSide[] =
    editSpot.side === 'Both'
      ? ['Axis', 'Allies']
      : editSpot.side === 'Axis'
      ? ['Axis']
      : ['Allies']

  const filteredSpots = currentSpots.filter((spot) => {
    const roleMatch =
      roleFilter === 'All' || (spot.roles || []).includes(roleFilter)

    const search = searchTerm.trim().toLowerCase()

    const textMatch =
      search === '' ||
      spot.title.toLowerCase().includes(search) ||
      (spot.roles || []).some((role) => role.toLowerCase().includes(search)) ||
      spot.notes.toLowerCase().includes(search) ||
      spot.side.toLowerCase().includes(search)

    return roleMatch && textMatch
  })

  const sortedSpots = [...filteredSpots].sort((a, b) => {
    if (sortMode === 'role') {
      const roleCompare = (a.roles?.[0] || '').localeCompare(b.roles?.[0] || '')
      if (roleCompare !== 0) return roleCompare
    }
    return a.title.localeCompare(b.title)
  })

  const clampPosition = React.useCallback(
    (x: number, y: number, incomingScale = scale) => {
      const viewport = viewportRef.current
      if (!viewport) return { x, y }

      const rect = viewport.getBoundingClientRect()
      const maxX = ((incomingScale - 1) * rect.width) / 2
      const maxY = ((incomingScale - 1) * rect.height) / 2

      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      }
    },
    [scale]
  )

  const resetNewSpotState = React.useCallback(() => {
    setNewSpot({
      title: '',
      roles: ['MG'],
      side: 'Both',
      notes: '',
      youtube: '',
      images: [],
      imageFiles: [],
      size: 12,
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const revokeNewSpotPreviewUrls = React.useCallback((urls: string[]) => {
    urls.forEach((url) => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    })
  }, [])

  const addSpotToMaps = React.useCallback((spot: Spot) => {
    setMaps((prev) =>
      prev.map((map) => {
        if (map.id !== spot.map_id) return map
        if (map.spots.some((existing) => existing.id === spot.id)) return map
        return { ...map, spots: [...map.spots, spot] }
      })
    )
  }, [])

  const replaceSpotInMaps = React.useCallback((tempId: string, savedSpot: Spot) => {
    setMaps((prev) =>
      prev.map((map) => {
        if (map.id !== savedSpot.map_id) {
          return {
            ...map,
            spots: map.spots.filter((spot) => spot.id !== tempId),
          }
        }

        const withoutTemp = map.spots.filter((spot) => spot.id !== tempId)
        const alreadyHasSaved = withoutTemp.some((spot) => spot.id === savedSpot.id)

        return {
          ...map,
          spots: alreadyHasSaved ? withoutTemp : [...withoutTemp, savedSpot],
        }
      })
    )
  }, [])

  const removeSpotFromMaps = React.useCallback((spotId: number | string) => {
    setMaps((prev) =>
      prev.map((map) => ({
        ...map,
        spots: map.spots.filter((spot) => spot.id !== spotId),
      }))
    )
  }, [])

  React.useEffect(() => {
    async function loadData() {
      setIsLoading(true)

      const [
        { data: mapsData, error: mapsError },
        { data: spotsData, error: spotsError },
      ] = await Promise.all([
        supabase.from('maps').select('*').order('name', { ascending: true }),
        supabase.from('spots').select('*').order('id', { ascending: true }),
      ])

      if (mapsError) console.error('Error loading maps:', mapsError)
      if (spotsError) console.error('Error loading spots:', spotsError)

      const builtMaps = buildMapsWithSpots(mapsData || [], spotsData || [])
      setMaps(builtMaps)

      if (builtMaps.length > 0) {
        setSelectedMapId((prev) =>
          builtMaps.some((m) => m.id === prev) ? prev : builtMaps[0].id
        )
      }

      setIsLoading(false)
    }

    loadData()
  }, [])

  React.useEffect(() => {
    const channel = supabase
      .channel('spots-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spots' },
        (payload) => {
          const eventType = payload.eventType

          if (eventType === 'INSERT') {
            addSpotToMaps(normalizeSpot(payload.new))
          }

          if (eventType === 'UPDATE') {
            const incoming = normalizeSpot(payload.new)

            setMaps((prev) =>
              prev.map((map) => ({
                ...map,
                spots:
                  map.id === incoming.map_id
                    ? map.spots.map((spot) =>
                        spot.id === incoming.id ? incoming : spot
                      )
                    : map.spots.filter((spot) => spot.id !== incoming.id),
              }))
            )

            setSelectedSpot((prev) =>
              prev && prev.id === incoming.id ? incoming : prev
            )
          }

          if (eventType === 'DELETE') {
            const deletedId = payload.old.id as number
            removeSpotFromMaps(deletedId)
            setSelectedSpot((prev) => (prev && prev.id === deletedId ? null : prev))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [addSpotToMaps, removeSpotFromMaps])

  React.useEffect(() => {
    const currentMap = maps.find((map) => map.id === selectedMapId)

    setSelectedSpot(currentMap?.spots[0] || null)
    setSearchTerm('')
    setRoleFilter('All')
    setSortMode('alphabetical')
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setShowAddSpot(false)
    setPendingPlacement(null)
    setShowSatellite(false)
    setEditingSpotId(null)
    setRightTab('list')
    setConePlacementMode(null)
    setConeDraftSpotId(null)
    setConeFirstEdge(null)
    setConePreviewPoint(null)
  }, [selectedMapId])

  React.useEffect(() => {
    const currentMap = maps.find((map) => map.id === selectedMapId)
    if (!currentMap) {
      setSelectedSpot(null)
      return
    }

    setSelectedSpot((prev) => {
      if (!prev) return null
      const updated = currentMap.spots.find((spot) => spot.id === prev.id)
      return updated || null
    })
  }, [maps, selectedMapId])

  React.useEffect(() => {
    return () => {
      revokeNewSpotPreviewUrls(newSpot.images)
    }
  }, [newSpot.images, revokeNewSpotPreviewUrls])

  React.useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const previousOverflow = document.body.style.overflow

    const lockScroll = () => {
      document.body.style.overflow = 'hidden'
    }

    const unlockScroll = () => {
      document.body.style.overflow = previousOverflow
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      setScale((prevScale) => {
        const nextScale =
          e.deltaY < 0
            ? Math.min(prevScale + 0.12, 3)
            : Math.max(prevScale - 0.12, 1)

        const zoomRatio = nextScale / prevScale

        setPosition((prevPos) => {
          const centerX = rect.width / 2
          const centerY = rect.height / 2

          const offsetX = mouseX - centerX
          const offsetY = mouseY - centerY

          const nextX = prevPos.x - offsetX * (zoomRatio - 1)
          const nextY = prevPos.y - offsetY * (zoomRatio - 1)

          const maxX = ((nextScale - 1) * rect.width) / 2
          const maxY = ((nextScale - 1) * rect.height) / 2

          return {
            x: Math.max(-maxX, Math.min(maxX, nextX)),
            y: Math.max(-maxY, Math.min(maxY, nextY)),
          }
        })

        return nextScale
      })
    }

    el.addEventListener('mouseenter', lockScroll)
    el.addEventListener('mouseleave', unlockScroll)
    el.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      el.removeEventListener('mouseenter', lockScroll)
      el.removeEventListener('mouseleave', unlockScroll)
      el.removeEventListener('wheel', handleWheel)
      document.body.style.overflow = previousOverflow
    }
  }, [scale])

  const getMapPercentFromEvent = (
    e: React.MouseEvent<HTMLDivElement>
  ): { x: number; y: number } | null => {
    if (!viewportRef.current) return null

    const viewportRect = viewportRef.current.getBoundingClientRect()
    const viewportX = e.clientX - viewportRect.left
    const viewportY = e.clientY - viewportRect.top

    const baseCenterX = viewportRect.width / 2
    const baseCenterY = viewportRect.height / 2

    const contentX =
      (viewportX - position.x - baseCenterX) / scale + baseCenterX
    const contentY =
      (viewportY - position.y - baseCenterY) / scale + baseCenterY

    const xPercent = (contentX / viewportRect.width) * 100
    const yPercent = (contentY / viewportRect.height) * 100

    return {
      x: Math.max(0, Math.min(100, Number(xPercent.toFixed(2)))),
      y: Math.max(0, Math.min(100, Number(yPercent.toFixed(2)))),
    }
  }

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3))

  const zoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.2, 1)
      setPosition((old) => clampPosition(old.x, old.y, next))
      return next
    })
  }

  const resetView = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showAddSpot || conePlacementMode) return
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (conePlacementMode === 'second_edge') {
      const point = getMapPercentFromEvent(e)
      if (point) setConePreviewPoint(point)
    }

    if (!isDragging) return

    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const next = clampPosition(
      dragRef.current.originX + dx,
      dragRef.current.originY + dy
    )
    setPosition(next)
  }

  const stopDragging = () => setIsDragging(false)

  const handleMapClickForPlacement = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    const clickPoint = getMapPercentFromEvent(e)
    if (!clickPoint) return

    if (conePlacementMode && coneDraftSpotId != null && selectedSpot) {
      e.preventDefault()
      e.stopPropagation()

      if (conePlacementMode === 'first_edge') {
        setConeFirstEdge(clickPoint)
        setConePreviewPoint(clickPoint)
        setConePlacementMode('second_edge')
        return
      }

      if (conePlacementMode === 'second_edge' && coneFirstEdge) {
        const nextCone = computeConeFromEdges(
          { x: selectedSpot.x, y: selectedSpot.y },
          coneFirstEdge,
          clickPoint
        )

        const nextCones = cleanupConeSet({
          ...(editSpot.cones || {}),
          [editingConeSide]: nextCone,
        })

        setEditSpot((prev) => ({
          ...prev,
          cones: nextCones,
        }))

        setSelectedSpot((prev) => (prev ? { ...prev, cones: nextCones } : prev))

        setMaps((prev) =>
          prev.map((map) => ({
            ...map,
            spots: map.spots.map((spot) =>
              spot.id === selectedSpot.id ? { ...spot, cones: nextCones } : spot
            ),
          }))
        )

        setConePlacementMode(null)
        setConeDraftSpotId(null)
        setConeFirstEdge(null)
        setConePreviewPoint(null)
        return
      }
    }

    if (!showAddSpot) return
    setPendingPlacement(clickPoint)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const remainingSlots = 3 - newSpot.imageFiles.length
    const limitedFiles = files.slice(0, remainingSlots)

    if (!limitedFiles.length) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const previewUrls = limitedFiles.map((file) => URL.createObjectURL(file))

    setNewSpot((prev) => ({
      ...prev,
      imageFiles: [...prev.imageFiles, ...limitedFiles],
      images: [...prev.images, ...previewUrls],
    }))

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeNewSpotImage = (index: number) => {
    setNewSpot((prev) => {
      const removedUrl = prev.images[index]
      if (removedUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(removedUrl)
      }

      return {
        ...prev,
        images: prev.images.filter((_, i) => i !== index),
        imageFiles: prev.imageFiles.filter((_, i) => i !== index),
      }
    })
  }

  const toggleRoleSelection = (roles: string[], role: string) => {
    if (roles.includes(role)) {
      const next = roles.filter((r) => r !== role)
      return next.length > 0 ? next : roles
    }
    return [...roles, role]
  }

  const uploadSpotImage = async (file: File) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`

    const { error } = await supabase.storage
      .from('spot-images')
      .upload(safeName, file)

    if (error) throw error

    const { data } = supabase.storage
      .from('spot-images')
      .getPublicUrl(safeName)

    return data.publicUrl
  }

  const saveNewSpot = async () => {
    if (isSavingNewSpot) return

    if (!pendingPlacement) {
      alert('Click on the map first to place the spot.')
      return
    }

    if (!newSpot.title.trim()) {
      alert('Enter a title before saving.')
      return
    }

    if (!newSpot.roles.length) {
      alert('Choose at least one role before saving.')
      return
    }

    if (!selectedMapId) {
      alert('No map selected.')
      return
    }

    const placement = pendingPlacement
    const primaryRole = newSpot.roles[0] || 'MG'

    const spotDraft = {
      ...newSpot,
      title: newSpot.title.trim(),
      notes: newSpot.notes.trim(),
      youtube: newSpot.youtube.trim() || null,
      roles: [...newSpot.roles],
      images: [...newSpot.images],
      imageFiles: [...newSpot.imageFiles],
      role: primaryRole,
      size: clampSpotSize(newSpot.size),
      cones: null as SpotConeSet | null,
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const optimisticSpot: Spot = {
      id: tempId,
      map_id: selectedMapId,
      title: spotDraft.title,
      role: primaryRole,
      roles: spotDraft.roles,
      side: spotDraft.side,
      notes: spotDraft.notes,
      youtube: spotDraft.youtube,
      images: spotDraft.images,
      x: placement.x,
      y: placement.y,
      size: spotDraft.size,
      cones: null,
      pending: true,
    }

    setIsSavingNewSpot(true)
    addSpotToMaps(optimisticSpot)
    setSelectedSpot(optimisticSpot)
    setShowAddSpot(false)
    setPendingPlacement(null)
    setRightTab('details')
    resetNewSpotState()

    try {
      const uploadedImageUrls = await Promise.all(
        spotDraft.imageFiles.map((file) => uploadSpotImage(file))
      )

      const payload = {
        map_id: selectedMapId,
        title: spotDraft.title,
        role: primaryRole,
        roles: spotDraft.roles,
        side: spotDraft.side,
        notes: spotDraft.notes,
        youtube: spotDraft.youtube,
        images: uploadedImageUrls,
        x: placement.x,
        y: placement.y,
        size: spotDraft.size,
        cone: null,
      }

      const { data, error } = await supabase
        .from('spots')
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      const normalizedSavedSpot = normalizeSpot(data)
      replaceSpotInMaps(tempId, normalizedSavedSpot)
      setSelectedSpot(normalizedSavedSpot)
      revokeNewSpotPreviewUrls(spotDraft.images)
    } catch (err: any) {
      console.error('Upload/save failure:', err)
      removeSpotFromMaps(tempId)
      setSelectedSpot((prev) => (prev?.id === tempId ? null : prev))
      revokeNewSpotPreviewUrls(spotDraft.images)
      alert(err?.message || 'Failed to upload image or save spot.')
    } finally {
      setIsSavingNewSpot(false)
    }
  }

  const startEditingSpot = () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return

    const initialSide: ConeSide =
      selectedSpot.side === 'Allies' ? 'Allies' : 'Axis'

    setEditingConeSide(initialSide)
    setEditingSpotId(selectedSpot.id)
    setEditSpot({
      title: selectedSpot.title,
      roles: selectedSpot.roles?.length ? selectedSpot.roles : [selectedSpot.role || 'MG'],
      side: selectedSpot.side,
      notes: selectedSpot.notes,
      youtube: selectedSpot.youtube || '',
      size: clampSpotSize(selectedSpot.size),
      cones: selectedSpot.cones || null,
    })
    setRightTab('details')
  }

  const saveEditedSpot = async () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return

    const primaryRole = editSpot.roles[0] || 'MG'
    const cleanedCones = cleanupConeSet(editSpot.cones)

    const { error } = await supabase
      .from('spots')
      .update({
        title: editSpot.title.trim(),
        role: primaryRole,
        roles: editSpot.roles,
        side: editSpot.side,
        notes: editSpot.notes.trim(),
        youtube: editSpot.youtube.trim() || null,
        size: clampSpotSize(editSpot.size),
        cone: cleanedCones,
      })
      .eq('id', selectedSpot.id)

    if (error) {
      console.error('Error updating spot:', error)
      return
    }

    setEditingSpotId(null)
    setConePlacementMode(null)
    setConeDraftSpotId(null)
    setConeFirstEdge(null)
    setConePreviewPoint(null)
  }

  const deleteSelectedSpot = async () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return

    const { error } = await supabase
      .from('spots')
      .delete()
      .eq('id', selectedSpot.id)

    if (error) console.error('Error deleting spot:', error)
  }

  const updateSelectedSpotSize = async (newSize: number) => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return

    newSize = clampSpotSize(newSize)

    setSelectedSpot((prev) => (prev ? { ...prev, size: newSize } : prev))

    setMaps((prev) =>
      prev.map((map) => ({
        ...map,
        spots: map.spots.map((spot) =>
          spot.id === selectedSpot.id ? { ...spot, size: newSize } : spot
        ),
      }))
    )

    const { error } = await supabase
      .from('spots')
      .update({ size: newSize })
      .eq('id', selectedSpot.id)

    if (error) console.error('Error updating spot size:', error)
  }

  const updateEditSpotSize = (newSize: number) => {
    const clamped = clampSpotSize(newSize)

    setEditSpot((prev) => ({
      ...prev,
      size: clamped,
    }))

    if (!selectedSpot) return

    setSelectedSpot((prev) => (prev ? { ...prev, size: clamped } : prev))

    setMaps((prev) =>
      prev.map((map) => ({
        ...map,
        spots: map.spots.map((spot) =>
          spot.id === selectedSpot.id ? { ...spot, size: clamped } : spot
        ),
      }))
    )
  }

  const beginConePlacement = () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    setConeDraftSpotId(selectedSpot.id)
    setConePlacementMode('first_edge')
    setConeFirstEdge(null)
    setConePreviewPoint(null)
    setRightTab('details')
  }

  const clearCone = () => {
    if (!selectedSpot) return

    const nextCones = cleanupConeSet({
      ...(editSpot.cones || {}),
      [editingConeSide]: null,
    })

    setEditSpot((prev) => ({
      ...prev,
      cones: nextCones,
    }))

    setSelectedSpot((prev) => (prev ? { ...prev, cones: nextCones } : prev))

    setMaps((prev) =>
      prev.map((map) => ({
        ...map,
        spots: map.spots.map((spot) =>
          spot.id === selectedSpot.id ? { ...spot, cones: nextCones } : spot
        ),
      }))
    )

    setConePlacementMode(null)
    setConeDraftSpotId(null)
    setConeFirstEdge(null)
    setConePreviewPoint(null)
  }

  const cancelEditSpot = () => {
    if (selectedSpot && typeof selectedSpot.id === 'number') {
      const currentMap = maps.find((map) => map.id === selectedMapId)
      const originalSpot = currentMap?.spots.find((spot) => spot.id === selectedSpot.id) || null
      if (originalSpot) {
        setSelectedSpot(originalSpot)
      }
    }

    setEditingSpotId(null)
    setConePlacementMode(null)
    setConeDraftSpotId(null)
    setConeFirstEdge(null)
    setConePreviewPoint(null)
  }

  const openAddSpot = () => {
    if (showAddSpot) {
      revokeNewSpotPreviewUrls(newSpot.images)
      resetNewSpotState()
      setPendingPlacement(null)
      setShowAddSpot(false)
      setEditingSpotId(null)
      setRightTab('details')
      return
    }

    setShowAddSpot(true)
    setEditingSpotId(null)
    setRightTab('details')
    setPendingPlacement(null)
  }

  const selectSpot = (spot: Spot) => {
    setSelectedSpot(spot)
    setShowAddSpot(false)
    setEditingSpotId(null)
    setRightTab('details')
    setConePlacementMode(null)
    setConeDraftSpotId(null)
    setConeFirstEdge(null)
    setConePreviewPoint(null)
  }

  const previewCone =
    selectedSpot &&
    conePlacementMode === 'second_edge' &&
    coneFirstEdge &&
    conePreviewPoint
      ? computeConeFromEdges(
          { x: selectedSpot.x, y: selectedSpot.y },
          coneFirstEdge,
          conePreviewPoint
        )
      : null

  const currentEditingCone =
    editSpot.cones?.[editingConeSide] || null

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,#060906_0%,#0a0f0b_100%)] text-white">
      <div className="mx-auto max-w-[1800px] px-4 pb-6 pt-3 md:px-6">
        <div className="sticky top-0 z-40 mb-4 overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex items-center justify-center px-4 py-3 md:py-4">
            <img
              src="/pathfinders-logo.png"
              alt="Pathfinders"
              className="max-h-[65px] w-auto object-contain md:max-h-[85px]"
            />
          </div>
        </div>

        <div className="sticky top-[94px] z-30 mb-4 grid gap-3 rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl md:grid-cols-2 xl:grid-cols-7">
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
              Map
            </label>
            <select
              value={selectedMapId}
              onChange={(e) => setSelectedMapId(e.target.value)}
              className={inputClass}
            >
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
              Search Spots
            </label>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search bunker, flank, sniper..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
              Role Filter
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={inputClass}
            >
              <option>All</option>
              {roleNames.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
              LOS Display
            </label>
            <select
              value={losFilter}
              onChange={(e) =>
                setLosFilter(e.target.value as LosFilter)
              }
              className={inputClass}
            >
              <option value="all">All LOS</option>
              <option value="axis">Axis LOS</option>
              <option value="allies">Allies LOS</option>
              <option value="none">No LOS</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
              Sort List
            </label>
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as 'alphabetical' | 'role')
              }
              className={inputClass}
            >
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
            <a
              href="/admin"
              className={`${buttonClass} flex w-full items-center justify-center`}
            >
              Role Editor &amp; Invite Panel
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_390px]">
          <div className={`${panelClass} p-4 md:p-5`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {selectedMap?.name || (isLoading ? 'Loading maps...' : 'No map selected')}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Scroll to zoom, drag to pan
                  {showAddSpot ? ' • Click map to place a new spot' : ''}
                  {conePlacementMode === 'first_edge' ? ` • Click first ${editingConeSide} cone edge` : ''}
                  {conePlacementMode === 'second_edge' ? ` • Move mouse to preview ${editingConeSide} cone, click second edge` : ''}
                  {hasSatellite && showSatellite ? ' • Satellite overlay active' : ''}
                </p>
              </div>

              <div className="text-xs text-zinc-500">
                {filteredSpots.length} visible spot{filteredSpots.length === 1 ? '' : 's'}
              </div>
            </div>

            <div
              ref={viewportRef}
              className="relative w-full select-none overflow-hidden rounded-[28px] border border-emerald-400/12 bg-emerald-950/12"
              style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDragging}
              onMouseLeave={stopDragging}
            >
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2">
                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.94),rgba(8,20,12,0.92))] px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <button
                    onClick={zoomIn}
                    className="rounded-xl border border-emerald-300/15 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55"
                  >
                    +
                  </button>

                  <button
                    onClick={zoomOut}
                    className="rounded-xl border border-emerald-300/15 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55"
                  >
                    -
                  </button>

                  <button
                    onClick={resetView}
                    className="rounded-xl border border-emerald-300/15 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55"
                  >
                    Reset
                  </button>

                  <div className="ml-1 text-xs text-zinc-300">{scale.toFixed(1)}x</div>
                </div>

                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.94),rgba(8,20,12,0.92))] px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <button
                    onClick={() => {
                      if (!hasSatellite) return
                      setShowSatellite((prev) => !prev)
                    }}
                    disabled={!hasSatellite}
                    className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                      hasSatellite
                        ? showSatellite
                          ? 'border-emerald-300/40 bg-emerald-600/90 text-white hover:bg-emerald-500'
                          : 'border-emerald-300/15 bg-emerald-900/40 text-emerald-50 hover:bg-emerald-800/55'
                        : 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500'
                    }`}
                  >
                    {hasSatellite
                      ? showSatellite
                        ? 'Satellite On'
                        : 'Satellite Off'
                      : 'No Satellite'}
                  </button>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overlayOpacity}
                    disabled={!hasSatellite || !showSatellite}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    className="w-28 accent-emerald-500"
                  />

                  <span className="w-10 text-xs text-zinc-300">{overlayOpacity}%</span>
                </div>
              </div>

              <div className="relative mx-auto aspect-[4/3] w-full max-h-[78vh] bg-black/30">
                {selectedMap ? (
                  <div
                    className={`absolute inset-0 ${
                      isDragging
                        ? 'cursor-grabbing'
                        : showAddSpot || conePlacementMode
                        ? 'cursor-crosshair'
                        : 'cursor-grab'
                    }`}
                    onMouseDown={handleMouseDown}
                    onClick={handleMapClickForPlacement}
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <img
                      src={selectedMap.image}
                      alt={selectedMap.name}
                      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                      draggable={false}
                    />

                    {hasSatellite && showSatellite && selectedMap.overlay && (
                      <img
                        src={selectedMap.overlay}
                        alt={`${selectedMap.name} satellite`}
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                        draggable={false}
                        style={{ opacity: overlayOpacity / 100 }}
                        onError={() =>
                          setOverlayBroken((prev) => ({
                            ...prev,
                            [selectedMap.id]: true,
                          }))
                        }
                      />
                    )}

                    {filteredSpots.map((spot) => {
                      const isActive = selectedSpot?.id === spot.id
                      const sideStyles = getSideClasses(spot.side)
                      const primaryRole = spot.roles?.[0] || spot.role || 'MG'
                      const shape = getRoleShape(primaryRole)
                      const renderedSize = getRenderedSpotSize(spot)
                      const outerSize = `${renderedSize}px`

                      return (
                        <React.Fragment key={spot.id}>
                          {losFilter !== 'none' && spot.cones?.Axis && (losFilter === 'all' || losFilter === 'axis') && (
                            <ConeOverlay
                              x={spot.x}
                              y={spot.y}
                              cone={spot.cones.Axis}
                              side="Axis"
                            />
                          )}

                          {losFilter !== 'none' && spot.cones?.Allies && (losFilter === 'all' || losFilter === 'allies') && (
                            <ConeOverlay
                              x={spot.x}
                              y={spot.y}
                              cone={spot.cones.Allies}
                              side="Allies"
                            />
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              selectSpot(spot)
                            }}
                            className="group absolute -translate-x-1/2 -translate-y-1/2"
                            style={{
                              left: `${spot.x}%`,
                              top: `${spot.y}%`,
                              opacity: spot.pending ? 0.68 : 1,
                            }}
                            aria-label={spot.title}
                          >
                            <span
                              className={`absolute inset-0 blur-sm opacity-70 ${sideStyles.glow} ${
                                shape === 'circle'
                                  ? 'rounded-full'
                                  : shape === 'square'
                                  ? 'rounded-[6px]'
                                  : ''
                              }`}
                              style={{
                                width: outerSize,
                                height: outerSize,
                                clipPath:
                                  shape === 'triangle'
                                    ? 'polygon(50% 6%, 8% 92%, 92% 92%)'
                                    : undefined,
                              }}
                            />
                            <ShapeMarker
                              shape={shape}
                              sideClass={spot.pending ? 'bg-emerald-500/90' : sideStyles.marker}
                              borderClass={spot.pending ? 'border-emerald-200' : sideStyles.border}
                              icon={getRoleIcon(primaryRole)}
                              size={renderedSize}
                              isActive={isActive}
                            />
                            {spot.pending && (
                              <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-300/20 bg-emerald-950/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                                Saving
                              </span>
                            )}
                          </button>
                        </React.Fragment>
                      )
                    })}

                    {previewCone && selectedSpot && (
                      <ConeOverlay
                        x={selectedSpot.x}
                        y={selectedSpot.y}
                        cone={previewCone}
                        side={editingConeSide}
                        preview
                      />
                    )}

                    {pendingPlacement && (
                      <div
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${pendingPlacement.x}%`,
                          top: `${pendingPlacement.y}%`,
                        }}
                      >
                        <ShapeMarker
                          shape={getRoleShape(newSpot.roles?.[0] || 'MG')}
                          sideClass="bg-emerald-600/90"
                          borderClass="border-emerald-300"
                          icon={getRoleIcon(newSpot.roles?.[0] || 'MG')}
                          size={getRenderedDraftSize(newSpot.roles, clampSpotSize(newSpot.size))}
                          isActive={false}
                        />
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

          <div className="xl:sticky xl:top-[204px] xl:self-start">
            <div className={`${panelClass} p-4 md:p-5`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setRightTab('list')}
                    className={`${tabButtonClass} ${
                      rightTab === 'list'
                        ? 'border border-emerald-300/25 bg-emerald-600/90 text-white'
                        : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'
                    }`}
                  >
                    Spot List
                  </button>
                  <button
                    onClick={() => setRightTab('details')}
                    className={`${tabButtonClass} ${
                      rightTab === 'details'
                        ? 'border border-emerald-300/25 bg-emerald-600/90 text-white'
                        : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'
                    }`}
                  >
                    Spot Details
                  </button>
                </div>

                <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  {conePlacementMode === 'first_edge'
                    ? `Pick ${editingConeSide} 1st Edge`
                    : conePlacementMode === 'second_edge'
                    ? `Pick ${editingConeSide} 2nd Edge`
                    : rightTab === 'list'
                    ? `${sortedSpots.length} Spots`
                    : showAddSpot
                    ? 'New Spot'
                    : editingSpotId
                    ? 'Editing'
                    : selectedSpot
                    ? selectedSpot.pending
                      ? 'Saving'
                      : 'Selected'
                    : 'Idle'}
                </span>
              </div>

              {rightTab === 'list' ? (
                <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                  {sortedSpots.length > 0 ? (
                    sortedSpots.map((spot) => {
                      const sideStyles = getSideClasses(spot.side)
                      const primaryRole = spot.roles?.[0] || spot.role || 'MG'
                      const listSize = Math.max(12, getRenderedSpotSize(spot))
                      const hasAxisCone = !!spot.cones?.Axis
                      const hasAlliesCone = !!spot.cones?.Allies

                      return (
                        <button
                          key={spot.id}
                          onClick={() => selectSpot(spot)}
                          className={`w-full rounded-[22px] border p-3 text-left transition ${
                            selectedSpot?.id === spot.id
                              ? 'border-emerald-300/35 bg-emerald-500/10'
                              : 'border-emerald-400/8 bg-emerald-950/18 hover:bg-emerald-900/30'
                          } ${spot.pending ? 'opacity-75' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center">
                              <ShapeMarker
                                shape={getRoleShape(primaryRole)}
                                sideClass={spot.pending ? 'bg-emerald-500/90' : sideStyles.marker}
                                borderClass={spot.pending ? 'border-emerald-200' : sideStyles.border}
                                icon={getRoleIcon(primaryRole)}
                                size={listSize}
                                isActive={selectedSpot?.id === spot.id}
                              />
                            </span>
                            <span className="font-medium text-white">{spot.title}</span>
                            {spot.pending && (
                              <span className="rounded-full border border-emerald-300/20 bg-emerald-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-100">
                                Saving
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            <span>{spot.roles.join(', ')}</span>
                            <span>•</span>
                            <span>{spot.side}</span>
                            {hasAxisCone && (
                              <>
                                <span>•</span>
                                <span>Axis LOS</span>
                              </>
                            )}
                            {hasAlliesCone && (
                              <>
                                <span>•</span>
                                <span>Allies LOS</span>
                              </>
                            )}
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-emerald-400/8 bg-emerald-950/18 p-4 text-sm text-zinc-500">
                      No spots match the current search/filter.
                    </div>
                  )}
                </div>
              ) : showAddSpot ? (
                <div className="flex h-full flex-col gap-3">
                  <p className="text-sm text-zinc-400">
                    1. Click on the map to place the spot. 2. Fill out the card. 3. Hit save.
                  </p>

                  <input
                    value={newSpot.title}
                    onChange={(e) =>
                      setNewSpot((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Spot title"
                    className={inputClass}
                  />

                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                      Roles
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {roleNames.map((role) => {
                        const checked = newSpot.roles.includes(role)
                        return (
                          <label
                            key={role}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                              checked
                                ? 'border-emerald-300/35 bg-emerald-600/20 text-white'
                                : 'border-emerald-300/10 bg-emerald-950/20 text-zinc-300 hover:bg-emerald-900/30'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setNewSpot((prev) => ({
                                  ...prev,
                                  roles: toggleRoleSelection(prev.roles, role),
                                }))
                              }
                              className="accent-emerald-500"
                            />
                            <span>{role}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <select
                    value={newSpot.side}
                    onChange={(e) =>
                      setNewSpot((prev) => ({
                        ...prev,
                        side: e.target.value as SpotSide,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="Axis">Axis</option>
                    <option value="Allies">Allies</option>
                    <option value="Both">Both</option>
                  </select>

                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                      New Spot Size
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                      <input
                        type="range"
                        min="8"
                        max="20"
                        value={clampSpotSize(newSpot.size)}
                        onChange={(e) =>
                          setNewSpot((prev) => ({
                            ...prev,
                            size: clampSpotSize(Number(e.target.value)),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                      <span className="w-8 text-xs text-zinc-300">{clampSpotSize(newSpot.size)}</span>
                    </div>
                  </div>

                  <textarea
                    value={newSpot.notes}
                    onChange={(e) =>
                      setNewSpot((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Notes / purpose / cautions"
                    rows={4}
                    className={inputClass}
                  />

                  <input
                    value={newSpot.youtube}
                    onChange={(e) =>
                      setNewSpot((prev) => ({ ...prev, youtube: e.target.value }))
                    }
                    placeholder="YouTube link"
                    className={inputClass}
                  />

                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-sm text-zinc-300">
                      Upload up to 3 images
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="text-sm text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-900/60 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-emerald-800"
                    />

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {newSpot.images.map((img, index) => (
                        <div key={index} className="relative">
                          <img
                            src={img}
                            alt={`Preview ${index + 1}`}
                            className="h-24 w-full rounded-xl border border-zinc-800 object-cover"
                          />
                          <button
                            onClick={() => removeNewSpotImage(index)}
                            className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 text-xs text-zinc-500">
                      {newSpot.images.length}/3 images selected
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3 text-sm text-zinc-400">
                    {pendingPlacement ? (
                      <>
                        Spot placed at:{' '}
                        <span className="text-white">{pendingPlacement.x}%</span>,{' '}
                        <span className="text-white">{pendingPlacement.y}%</span>
                      </>
                    ) : (
                      'No placement yet. Click the map to place the new spot.'
                    )}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={saveNewSpot}
                      disabled={isSavingNewSpot}
                      className={`${buttonClass} ${isSavingNewSpot ? 'cursor-not-allowed opacity-70' : ''}`}
                    >
                      {isSavingNewSpot ? 'Saving...' : 'Save Spot'}
                    </button>
                    <button
                      onClick={() => {
                        revokeNewSpotPreviewUrls(newSpot.images)
                        setPendingPlacement(null)
                        setShowAddSpot(false)
                        resetNewSpotState()
                      }}
                      className={softButtonClass}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : editingSpotId && selectedSpot ? (
                <div className="flex h-full flex-col gap-3">
                  <input
                    value={editSpot.title}
                    onChange={(e) =>
                      setEditSpot((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Spot title"
                    className={inputClass}
                  />

                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                      Roles
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {roleNames.map((role) => {
                        const checked = editSpot.roles.includes(role)
                        return (
                          <label
                            key={role}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                              checked
                                ? 'border-emerald-300/35 bg-emerald-600/20 text-white'
                                : 'border-emerald-300/10 bg-emerald-950/20 text-zinc-300 hover:bg-emerald-900/30'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setEditSpot((prev) => ({
                                  ...prev,
                                  roles: toggleRoleSelection(prev.roles, role),
                                }))
                              }
                              className="accent-emerald-500"
                            />
                            <span>{role}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <select
                    value={editSpot.side}
                    onChange={(e) => {
                      const nextSide = e.target.value as SpotSide
                      const nextEditingConeSide: ConeSide =
                        nextSide === 'Allies' ? 'Allies' : 'Axis'

                      setEditSpot((prev) => ({
                        ...prev,
                        side: nextSide,
                      }))
                      setEditingConeSide(nextEditingConeSide)
                    }}
                    className={inputClass}
                  >
                    <option value="Axis">Axis</option>
                    <option value="Allies">Allies</option>
                    <option value="Both">Both</option>
                  </select>

                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                      Spot Size
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                      <input
                        type="range"
                        min="8"
                        max="20"
                        value={clampSpotSize(editSpot.size)}
                        onChange={(e) => updateEditSpotSize(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                      />
                      <span className="w-8 text-xs text-zinc-300">{clampSpotSize(editSpot.size)}</span>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {availableConeSides.map((side) => (
                        <button
                          key={side}
                          onClick={() => setEditingConeSide(side)}
                          className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${
                            editingConeSide === side
                              ? side === 'Axis'
                                ? 'border border-red-300/30 bg-red-600/80 text-white'
                                : 'border border-blue-300/30 bg-blue-600/80 text-white'
                              : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'
                          }`}
                        >
                          {side} LOS
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={beginConePlacement} className={softButtonClass}>
                        {conePlacementMode ? `Placing ${editingConeSide} LOS...` : `Mark ${editingConeSide} LOS`}
                      </button>
                      <button onClick={clearCone} className={softButtonClass}>
                        Clear {editingConeSide} LOS
                      </button>
                    </div>

                    <div className="mt-3 text-sm text-zinc-400">
                      {conePlacementMode === 'first_edge' && `Click the first outer edge of the ${editingConeSide} cone.`}
                      {conePlacementMode === 'second_edge' && `Move the mouse to preview the ${editingConeSide} cone, then click the opposite edge.`}
                      {!conePlacementMode && currentEditingCone && `${editingConeSide} LOS is set for this spot.`}
                      {!conePlacementMode && !currentEditingCone && `No ${editingConeSide} LOS set yet.`}
                    </div>

                    {currentEditingCone && (
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs uppercase tracking-[0.16em] text-zinc-400">
                        <div>Dir: <span className="normal-case tracking-normal text-white">{Math.round(currentEditingCone.angle)}°</span></div>
                        <div>Spread: <span className="normal-case tracking-normal text-white">{Math.round(currentEditingCone.spread)}°</span></div>
                        <div>Length: <span className="normal-case tracking-normal text-white">{currentEditingCone.length}</span></div>
                      </div>
                    )}
                  </div>

                  <textarea
                    value={editSpot.notes}
                    onChange={(e) =>
                      setEditSpot((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    rows={4}
                    className={inputClass}
                  />

                  <input
                    value={editSpot.youtube}
                    onChange={(e) =>
                      setEditSpot((prev) => ({ ...prev, youtube: e.target.value }))
                    }
                    placeholder="YouTube link"
                    className={inputClass}
                  />

                  <div className="mt-2 flex gap-2">
                    <button onClick={saveEditedSpot} className={buttonClass}>
                      Save Changes
                    </button>
                    <button onClick={cancelEditSpot} className={softButtonClass}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : selectedSpot ? (
                <div className="flex h-full flex-col">
                  {selectedSpot.images && selectedSpot.images.length > 0 ? (
                    <>
                      <img
                        src={selectedSpot.images[0]}
                        alt={selectedSpot.title}
                        className="h-48 w-full cursor-pointer rounded-[24px] border border-zinc-800 object-cover"
                        onClick={() => setLightboxImage(selectedSpot.images![0])}
                      />

                      {selectedSpot.images.length > 1 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {selectedSpot.images.map((img, index) => (
                            <img
                              key={index}
                              src={img}
                              alt={`${selectedSpot.title} ${index + 1}`}
                              className="h-16 w-full cursor-pointer rounded-xl border border-zinc-800 object-cover"
                              onClick={() => setLightboxImage(img)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center rounded-[24px] border border-dashed border-emerald-400/10 bg-emerald-950/18 text-zinc-500">
                      No images
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-400">
                    {selectedSpot.roles.map((role) => (
                      <span
                        key={role}
                        className={`rounded-full px-3 py-1 text-white ${getRoleColor(role)}`}
                      >
                        {role}
                      </span>
                    ))}

                    <span
                      className={`rounded-full px-3 py-1 ${getSideClasses(
                        selectedSpot.side
                      ).badge}`}
                    >
                      {selectedSpot.side}
                    </span>

                    {selectedSpot.cones?.Axis && (
                      <span className="rounded-full border border-red-300/15 bg-red-900/35 px-3 py-1 text-white">
                        Axis LOS
                      </span>
                    )}

                    {selectedSpot.cones?.Allies && (
                      <span className="rounded-full border border-blue-300/15 bg-blue-900/35 px-3 py-1 text-white">
                        Allies LOS
                      </span>
                    )}

                    <span className="inline-flex items-center rounded-full bg-emerald-900/45 px-3 py-1 text-white normal-case tracking-normal">
                      <MarkerIcon icon={getRoleIcon(selectedSpot.roles?.[0] || selectedSpot.role || 'MG')} sizePx={16} />
                    </span>

                    {selectedSpot.pending && (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-950/70 px-3 py-1 text-emerald-100">
                        Saving...
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 text-2xl font-bold text-white">{selectedSpot.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">
                    {selectedSpot.notes}
                  </p>

                  {!selectedSpot.pending && (
                    <div className="mt-4">
                      <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                        Selected Spot Size
                      </label>
                      <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                        <input
                          type="range"
                          min="8"
                          max="20"
                          value={clampSpotSize(selectedSpot.size)}
                          onChange={(e) =>
                            updateSelectedSpotSize(Number(e.target.value))
                          }
                          className="w-full accent-emerald-500"
                        />
                        <span className="w-8 text-xs text-zinc-300">{clampSpotSize(selectedSpot.size)}</span>
                      </div>
                    </div>
                  )}

                  {(selectedSpot.cones?.Axis || selectedSpot.cones?.Allies) && (
                    <div className="mt-4 rounded-[22px] border border-emerald-400/10 bg-emerald-950/18 p-3 text-sm text-zinc-300">
                      <div className="font-medium text-white">Line of Sight Cones</div>

                      {selectedSpot.cones?.Axis && (
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
                          <div className="text-red-300">Axis Dir: <span className="text-white normal-case tracking-normal">{Math.round(selectedSpot.cones.Axis.angle)}°</span></div>
                          <div className="text-red-300">Axis Spread: <span className="text-white normal-case tracking-normal">{Math.round(selectedSpot.cones.Axis.spread)}°</span></div>
                          <div className="text-red-300">Axis Length: <span className="text-white normal-case tracking-normal">{selectedSpot.cones.Axis.length}</span></div>
                        </div>
                      )}

                      {selectedSpot.cones?.Allies && (
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
                          <div className="text-blue-300">Allies Dir: <span className="text-white normal-case tracking-normal">{Math.round(selectedSpot.cones.Allies.angle)}°</span></div>
                          <div className="text-blue-300">Allies Spread: <span className="text-white normal-case tracking-normal">{Math.round(selectedSpot.cones.Allies.spread)}°</span></div>
                          <div className="text-blue-300">Allies Length: <span className="text-white normal-case tracking-normal">{selectedSpot.cones.Allies.length}</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSpotEmbedUrl && (
                    <div className="mt-5">
                      <div className="overflow-hidden rounded-[24px] border border-zinc-800 bg-black">
                        <iframe
                          className="aspect-video w-full"
                          src={`${selectedSpotEmbedUrl}?rel=0&modestbranding=1`}
                          title={`${selectedSpot.title} video`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}

                  {selectedSpot.youtube && (
                    <a
                      href={selectedSpot.youtube}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex w-fit items-center rounded-2xl border border-emerald-300/15 bg-emerald-900/35 px-4 py-2 text-sm font-medium hover:bg-emerald-800/55"
                    >
                      Open on YouTube
                    </a>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={startEditingSpot}
                      disabled={!!selectedSpot.pending}
                      className={`${softButtonClass} ${selectedSpot.pending ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      Edit Spot
                    </button>

                    <button
                      onClick={deleteSelectedSpot}
                      disabled={!!selectedSpot.pending}
                      className={`inline-flex w-fit items-center rounded-2xl border border-red-700 bg-red-900/60 px-4 py-2 text-sm font-medium hover:bg-red-800/70 ${
                        selectedSpot.pending ? 'cursor-not-allowed opacity-60' : ''
                      }`}
                    >
                      Delete Spot
                    </button>
                  </div>

                  <div className="mt-auto pt-6 text-xs leading-5 text-zinc-500">
                    Fixed role pack enabled.
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-[24px] border border-dashed border-emerald-400/10 bg-emerald-950/18 p-8 text-center">
                  <div>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/10 bg-emerald-900/25 text-2xl">
                      🎯
                    </div>
                    <h3 className="text-xl font-semibold text-white">Select a spot</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
                      Click a marker on the map or a name in the list.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
            >
              ✕
            </button>
            <img
              src={lightboxImage}
              alt="Enlarged"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}