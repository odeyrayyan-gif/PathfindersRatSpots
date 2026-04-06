'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

import type {
  ConeSide,
  MapData,
  MapOrientation,
  MarkerShape,
  PlacementMode,
  RoutePoint,
  Spot,
  SpotComment,
  SpotCone,
  SpotConeSet,
  SpotLine,
  SpotLineSet,
  SpotRoute,
  SpotSide,
  SpotSideFilter,
} from './_lib/types'

import {
  FIXED_ROLES,
  ROUTE_COLORS,
  ROUTE_LABELS,
} from './_lib/constants'

import {
  buildMapsWithSpots,
  clampSpotSize,
  cleanupConeSet,
  cleanupLineSet,
  createConeFromEdges,
  getDistanceMeters,
  getMapOrientation,
  getMaxRangeMeters,
  getPlayableBounds,
  getRouteTotalDistance,
  getSideClasses,
  getYouTubeEmbedUrl,
  isOutOfBounds,
  metersToPercent,
  normalizeSide,
  normalizeSpot,
  parseIcon,
  roleSupportsCone,
  roleSupportsLine,
  roleSupportsRoute,
} from './_lib/helpers'
import { ShapeMarker, MarkerIcon } from './_components/Marker'
import { ConeShape, SnipeLineShape, RouteShape } from './_components/MapShapes'

// ─── SVG OVERLAY COMPONENTS ───────────────────────────────────────────────────
// All rendered inside a single viewBox="0 0 100 100" SVG.
// Coordinates are identical to the % system used everywhere else.
// 1 SVG unit = 1% of map = 20m.


// ─── STYLE CONSTANTS ──────────────────────────────────────────────────────────

const panelClass      = 'rounded-3xl border border-emerald-400/15 bg-[linear-gradient(180deg,rgba(18,52,29,0.84),rgba(11,28,16,0.9))] shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl'
const inputClass      = 'w-full rounded-2xl border border-emerald-300/15 bg-emerald-950/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-emerald-100/30 focus:border-emerald-300/50 focus:bg-emerald-950/50'
const buttonClass     = 'rounded-2xl border border-emerald-300/25 bg-emerald-600/90 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 hover:border-emerald-200/40'
const softButtonClass = 'rounded-2xl border border-emerald-300/15 bg-emerald-900/40 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800/55'
const tinyInputClass  = 'rounded-xl border border-emerald-300/15 bg-emerald-950/35 px-2 py-1.5 text-xs text-white outline-none transition focus:border-emerald-300/50'

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

// ── Animated expand hook — measures real content height and animates to/from it
function useAnimatedExpand(isOpen: boolean) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = React.useState(0)
  const [visible, setVisible] = React.useState(isOpen)

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true)
      requestAnimationFrame(() => {
        if (ref.current) setHeight(ref.current.scrollHeight)
      })
    } else {
      setHeight(0)
      const t = setTimeout(() => setVisible(false), 280)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  return { ref, height, visible }
}

// Wrapper that animates height open/close
function ExpandedSpotContent({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const { ref, height, visible } = useAnimatedExpand(isOpen)
  if (!visible) return null
  // Cap at 65vh so the list never scrolls out of view when a tall card opens
  const cappedHeight = Math.min(height, typeof window !== 'undefined' ? window.innerHeight * 0.65 : 9999)
  return (
    <div style={{ height: `${cappedHeight}px`, overflow: 'hidden', transition: 'height 260ms cubic-bezier(0.4,0,0.2,1)', opacity: height > 0 ? 1 : 0 }}
      className="transition-opacity duration-200">
      <div ref={ref}>{children}</div>
    </div>
  )
}

function IntelMapInner() {
  // ── session & permissions
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const userRole     = (session?.user as any)?.role ?? 'viewer'
  const userId       = (session?.user as any)?.id   ?? ''
  const userName     = session?.user?.name           ?? 'Unknown'
  const canEdit      = userRole === 'admin' || userRole === 'contributor'
  const canDelete    = userRole === 'admin'
  const canAdd       = userRole === 'admin' || userRole === 'contributor'

  // ── data state
  const [maps,          setMaps]          = React.useState<MapData[]>([])
  const [selectedMapId, setSelectedMapId] = React.useState<string>('utah')
  const [isLoading,     setIsLoading]     = React.useState(true)

  // ── selection state
  const [selectedSpot,   setSelectedSpot]   = React.useState<Spot | null>(null)
  const [editingSpotId,  setEditingSpotId]  = React.useState<number | null>(null)
  const [selectedRouteId,setSelectedRouteId]= React.useState<string | null>(null)
  const [isDrawerOpen,   setIsDrawerOpen]   = React.useState(false)

  // ── undo delete state
  const [undoToast,      setUndoToast]      = React.useState<{ spot: Spot; timerId: ReturnType<typeof setTimeout> } | null>(null)

  // ── comments state
  const [comments,       setComments]       = React.useState<SpotComment[]>([])
  const [commentText,    setCommentText]    = React.useState('')
  const [isLoadingComments, setIsLoadingComments] = React.useState(false)

  // ── activity feed state
  const [feedItems,      setFeedItems]      = React.useState<any[]>([])
  const [feedLoading,    setFeedLoading]    = React.useState(false)
  const [feedLastSeen,   setFeedLastSeen]   = React.useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('hll_feed_last_seen') ?? ''
  })
  const [feedHasNew,     setFeedHasNew]     = React.useState(false)

  // ── list filter state
  const [roleFilters, setRoleFilters] = React.useState<Set<string>>(
  new Set(FIXED_ROLES.map((r) => r.name))
)
  const [sideFilters, setSideFilters] = React.useState<Set<string>>(
  new Set(['Axis', 'Allies', 'Both'])
)
  const [buildableFilter, setBuildableFilter] = React.useState(false) // true = only show buildable spots
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
    title: '', roles: [] as string[], side: '' as SpotSide,
    notes: '', youtube: '', images: [] as string[], imageFiles: [] as File[], size: 12,
    requiresBuildable: false, verified: false, patchVersion: '',
  })

  // ── spot edit state
  const [editSpot, setEditSpot] = React.useState({
    title: '', roles: ['MG'] as string[], side: 'Both' as SpotSide,
    notes: '', youtube: '', size: 12,
    requiresBuildable: false, verified: false, patchVersion: '',
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

  // ── drag-to-reposition state
  const [draggingSpotId,   setDraggingSpotId]   = React.useState<number | string | null>(null)
  const [draggingSnipeSide,setDraggingSnipeSide] = React.useState<ConeSide | null>(null)
  const [snipeDragPreview, setSnipeDragPreview]  = React.useState<{ x: number; y: number } | null>(null)
  // Refs mirror state so event handlers always read the current value without stale closures
  const draggingSpotIdRef    = React.useRef<number | string | null>(null)
  const draggingSnipeSideRef = React.useRef<ConeSide | null>(null)
  // Direct DOM ref for the spot being dragged — bypasses React render cycle for smooth movement
  const draggedSpotElRef = React.useRef<HTMLElement | null>(null)
  const dragMoveRef = React.useRef(false)
  const dragPosRef  = React.useRef<{ x: number; y: number } | null>(null)
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
  const [naturalAspect,  setNaturalAspect]  = React.useState<number>(1)
  const [containerDims,  setContainerDims]  = React.useState<{ w: number; h: number } | null>(null)
  // ── local display size offset — stored in localStorage, never written to DB
  // Each user can shift all dot sizes up/down without affecting others.
  const [localSizeOffset, setLocalSizeOffset] = React.useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(localStorage.getItem('hll_dot_size_offset') ?? '0')
  })
  // Per-spot local size overrides — keyed by spot id, session only
  const [localSpotSizes, setLocalSpotSizes] = React.useState<Record<string | number, number>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('hll_spot_sizes') ?? '{}') } catch { return {} }
  })

  // ── lightbox
  const [lightboxImages, setLightboxImages] = React.useState<string[]>([])
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)

  // ── refs
  const viewportRef      = React.useRef<HTMLDivElement | null>(null) // outer overflow div (wheel events)
  const mapContainerRef  = React.useRef<HTMLDivElement | null>(null) // inner aspect-square div (coordinates)
  const fileInputRef     = React.useRef<HTMLInputElement | null>(null)
  const spotListRef      = React.useRef<HTMLDivElement | null>(null) // scrollable spot list
  const spotItemRefs     = React.useRef<Map<number | string, HTMLDivElement>>(new Map()) // per-spot card refs
  const dragRef = React.useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  // Header refs — dynamic sticky top values so small monitors don't get offset jumps
  const logoBarRef    = React.useRef<HTMLDivElement | null>(null)
  const filterRow1Ref = React.useRef<HTMLDivElement | null>(null)
  const filterRow2Ref = React.useRef<HTMLDivElement | null>(null)
  const [row1Top,  setRow1Top]  = React.useState(94)
  const [row2Top,  setRow2Top]  = React.useState(178)
  const [panelTop, setPanelTop] = React.useState(268)

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
    const r           = spot.roles?.[0] || spot.role || 'MG'
    const base        = r === 'Tank' ? Math.max(2, Math.round(spot.size * 0.6)) : spot.size
    const spotOverride = localSpotSizes[spot.id] ?? 0
    return Math.max(2, Math.min(30, base + localSizeOffset + spotOverride))
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
      const roleMatch = (spot.roles || []).some((r) => roleFilters.has(r))
      const sideMatch =
  (sideFilters.has('Axis')   && (spot.side === 'Axis'   || spot.side === 'Both')) ||
  (sideFilters.has('Allies') && (spot.side === 'Allies' || spot.side === 'Both')) ||
  (sideFilters.has('Both')   && spot.side === 'Both')
      const buildMatch = !buildableFilter || spot.requiresBuildable
      const search = searchTerm.trim().toLowerCase()
      const textMatch = search === '' ||
        spot.title.toLowerCase().includes(search) ||
        (spot.roles || []).some((r) => r.toLowerCase().includes(search)) ||
        spot.notes.toLowerCase().includes(search) ||
        spot.side.toLowerCase().includes(search)
      return roleMatch && sideMatch && buildMatch && textMatch
    }),
  [currentSpots, roleFilters, sideFilters, buildableFilter, searchTerm])

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
    setNewSpot({ title: '', roles: [], side: '' as SpotSide, notes: '', youtube: '', images: [], imageFiles: [], size: 12, requiresBuildable: false, verified: false, patchVersion: '' })
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

  // ── save a snapshot to spot_history before any destructive change
  const saveSpotHistory = async (spot: Spot) => {
    if (typeof spot.id !== 'number') return
    await supabase.from('spot_history').insert({
      spot_id:          spot.id,
      snapshot:         spot,
      changed_by:       userId,
      changed_by_name:  userName,
    })
  }

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

      // Handle ?spot= deep link — switch to the right map and select the spot
      const spotParam = searchParams.get('spot')
      const mapParam  = searchParams.get('map')
      if (spotParam && built.length > 0) {
        const spotId = Number(spotParam)
        const targetMap = built.find((m) => m.spots.some((s) => s.id === spotId))
        if (targetMap) {
          setSelectedMapId(targetMap.id)
          const spot = targetMap.spots.find((s) => s.id === spotId)
          if (spot) setTimeout(() => selectSpot(spot), 50)
        }
      } else if (mapParam && built.some((m) => m.id === mapParam)) {
        setSelectedMapId(mapParam)
      } else if (built.length > 0) {
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
    setSelectedSpot(null); setIsDrawerOpen(false)
    setSearchTerm(''); setRoleFilters(new Set(FIXED_ROLES.map((r) => r.name))); setSideFilters(new Set(['Axis', 'Allies', 'Both'])); setBuildableFilter(false); setSortMode('alphabetical')
    setScale(1); setPosition({ x: 0, y: 0 })
    setShowAddSpot(false); setPendingPlacement(null); setShowSatellite(false)
    setEditingSpotId(null)
    setPlacementMode(null); setPlacementSpotId(null); setConeFirstEdge(null); setPreviewPoint(null)
    setRouteDrawMode(false); setDrawingPoints([])
    setActiveMidpoint('All')
    setSelectedRouteId(null)
    setNaturalAspect(1)
    setContainerDims(null)
    void currentMap // suppress unused warning
  }, [selectedMapId])

  // ── effects: remember last viewed map for homepage quick resume
  React.useEffect(() => {
    if (typeof window === 'undefined' || !selectedMapId) return
    localStorage.setItem('hll_last_map_id', selectedMapId)
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

  // ── effects: compute container dimensions from image aspect ratio
  // Uses window resize instead of ResizeObserver to avoid a feedback loop where
  // setContainerDims → DOM change → ResizeObserver fires → setContainerDims again.
  React.useEffect(() => {
    if (!naturalAspect) return
    const compute = () => {
      const vp = viewportRef.current
      if (!vp) return
      const parentW = vp.getBoundingClientRect().width
      const maxH    = window.innerHeight * 0.78
      const hFromW  = parentW / naturalAspect
      const next    = hFromW <= maxH
        ? { w: Math.round(parentW), h: Math.round(hFromW) }
        : { w: Math.round(maxH * naturalAspect), h: Math.round(maxH) }
      setContainerDims((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next
      )
    }
    compute()
    let debounceTimer: ReturnType<typeof setTimeout>
    const debouncedCompute = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(compute, 50)
    }
    window.addEventListener('resize', debouncedCompute)
    return () => { window.removeEventListener('resize', debouncedCompute); clearTimeout(debounceTimer) }
  }, [naturalAspect])

  // ── effects: measure header heights for accurate sticky positioning
  // Hardcoded px values break on small monitors when headers wrap to different heights.
  React.useEffect(() => {
    const measure = () => {
      const logoH  = logoBarRef.current?.offsetHeight  ?? 0
      const r1H    = filterRow1Ref.current?.offsetHeight ?? 0
      const r2H    = filterRow2Ref.current?.offsetHeight ?? 0
      const gap    = 16 // mb-4 gap between elements
      setRow1Top(logoH + gap)
      setRow2Top(logoH + r1H + gap * 2)
      setPanelTop(logoH + r1H + r2H + gap * 3)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

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

      // Mouse position relative to the container's center
      const cX  = rect.width  / 2
      const cY  = rect.height / 2
      const mX  = e.clientX - rect.left - cX  // offset from center
      const mY  = e.clientY - rect.top  - cY  // offset from center

      setScale((prevScale) => {
        const next      = e.deltaY < 0 ? Math.min(prevScale + 0.12, 8) : Math.max(prevScale - 0.12, 1)
        const zoomRatio = next / prevScale
        setPosition((prevPos) => {
          // The point under the cursor must stay fixed:
          // newPos = prevPos - mouseOffset * (zoomRatio - 1)
          const nx   = prevPos.x - mX * (zoomRatio - 1)
          const ny   = prevPos.y - mY * (zoomRatio - 1)
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

  // ── effects: keyboard shortcuts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        if (placementMode) { resetPlacementState(); return }
        if (routeDrawMode) { setRouteDrawMode(false); setDrawingPoints([]); return }
        if (editingSpotId) { cancelEditSpot(); return }
        if (showAddSpot)   { setShowAddSpot(false); setPendingPlacement(null); return }
        if (selectedSpot)  { setSelectedSpot(null); setIsDrawerOpen(false); return }
      }
      if (e.key === 'e' && selectedSpot && !editingSpotId && canEdit) startEditingSpot()
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const spots = sortedSpots
        if (!spots.length) return
        const idx = selectedSpot ? spots.findIndex((s) => s.id === selectedSpot.id) : -1
        const next = e.key === 'ArrowDown'
          ? spots[Math.min(idx + 1, spots.length - 1)]
          : spots[Math.max(idx - 1, 0)]
        if (next) selectSpot(next)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // ── effects: load activity feed
  const loadFeed = React.useCallback(async () => {
    setFeedLoading(true)
    const { data, error } = await supabase
      .from('spots')
      .select('id, map_id, title, created_at, created_by_name, last_edited_at, last_edited_by_name')

    if (error) {
      console.error('Feed load error:', error)
      setFeedItems([])
      setFeedLoading(false)
      return
    }

    const items = (data || [])
      .map((row: any) => ({
        id: Number(`${row.id}${String(row.last_edited_at || row.created_at || '').replace(/\D/g, '').slice(-6) || '0'}`),
        spot_id: row.id,
        changed_by_name: row.last_edited_by_name || row.created_by_name || 'Someone',
        changed_at: row.last_edited_at || row.created_at,
        snapshot: { title: row.title, map_id: row.map_id },
      }))
      .filter((item: any) => !!item.changed_at)
      .sort((a: any, b: any) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
      .slice(0, 20)

    setFeedItems(items)
    if (items.length > 0) {
      const newest = items[0]?.changed_at ?? ''
      setFeedHasNew(newest > feedLastSeen)
    } else {
      setFeedHasNew(false)
    }
    setFeedLoading(false)
  }, [feedLastSeen])

  React.useEffect(() => {
    loadFeed()
    const interval = setInterval(loadFeed, 60_000)
    return () => clearInterval(interval)
  }, [loadFeed])

  // ── effects: realtime refresh for activity feed
  React.useEffect(() => {
    const channel = supabase
      .channel('spots-feed-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, () => {
        void loadFeed()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadFeed])

  // ── effects: load comments when spot selected
  React.useEffect(() => {
    if (!selectedSpot || typeof selectedSpot.id !== 'number') {
      setComments([]); return
    }
    setIsLoadingComments(true)
    supabase.from('spot_comments')
      .select('*').eq('spot_id', selectedSpot.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setComments((data || []) as SpotComment[])
        setIsLoadingComments(false)
      })
  }, [selectedSpot?.id])

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
  const zoomIn  = () => setScale((p) => Math.min(p + 0.2, 8))
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
    // ── Spot drag — update DOM directly, zero React re-renders during drag
    if (draggingSpotIdRef.current !== null) {
      const pt = getMapPercent(e); if (!pt) return
      dragMoveRef.current = true; dragPosRef.current = pt
      if (draggedSpotElRef.current) {
        draggedSpotElRef.current.style.left = `${pt.x}%`
        draggedSpotElRef.current.style.top  = `${pt.y}%`
      }
      return
    }
    // ── Snipe endpoint drag — update preview state (small, fast re-render)
    if (draggingSnipeSideRef.current !== null) {
      const pt = getMapPercent(e); if (!pt) return
      dragMoveRef.current = true; dragPosRef.current = pt
      setSnipeDragPreview(pt)
      return
    }
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
    // ── Commit dragged spot position
    if (draggingSpotIdRef.current !== null) {
      const id = draggingSpotIdRef.current
      // Clear direct DOM override — React takes back control with final position
      if (draggedSpotElRef.current) {
        draggedSpotElRef.current.style.left = ''
        draggedSpotElRef.current.style.top  = ''
        draggedSpotElRef.current = null
      }
      if (dragMoveRef.current && dragPosRef.current) {
        const { x, y } = dragPosRef.current
        patchSpotInMaps(id, { x, y })
        setSelectedSpot((prev) => prev && prev.id === id ? { ...prev, x, y } : prev)
        if (typeof id === 'number') {
          supabase.from('spots').update({ x, y }).eq('id', id)
            .then(({ error }) => { if (error) console.error('Spot drag save error:', error) })
        }
      }
      draggingSpotIdRef.current = null
      setDraggingSpotId(null)
      dragMoveRef.current = false; dragPosRef.current = null
      return
    }
    // ── Commit dragged snipe line endpoint
    if (draggingSnipeSideRef.current !== null) {
      const side = draggingSnipeSideRef.current
      if (dragMoveRef.current && dragPosRef.current && selectedSpot) {
        const prevMid = editSpot.fireLines?.[side]?.midpoint || 'Any'
        const nextLines = cleanupLineSet({
          ...(editSpot.fireLines || {}),
          [side]: { endX: dragPosRef.current.x, endY: dragPosRef.current.y, midpoint: prevMid },
        })
        setEditSpot((p) => ({ ...p, fireLines: nextLines }))
        setSelectedSpot((prev) => prev ? { ...prev, fireLines: nextLines } : prev)
        patchSpotInMaps(selectedSpot.id, { fireLines: nextLines })
        if (typeof selectedSpot.id === 'number') {
          supabase.from('spots').update({ fire_lines: nextLines }).eq('id', selectedSpot.id)
            .then(({ error }) => { if (error) console.error('Snipe drag save error:', error) })
        }
      }
      draggingSnipeSideRef.current = null
      setDraggingSnipeSide(null); setSnipeDragPreview(null)
      dragMoveRef.current = false; dragPosRef.current = null
      return
    }
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
    if (!newSpot.side)         { alert('Choose a side.'); return }
    if (!selectedMapId)        { alert('No map selected.'); return }

    const primaryRole = newSpot.roles[0] || 'MG'
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Spot = {
      id: tempId, map_id: selectedMapId,
      title: newSpot.title.trim(), role: primaryRole, roles: newSpot.roles,
      side: normalizeSide(newSpot.side), notes: newSpot.notes, youtube: newSpot.youtube.trim() || null,
      images: newSpot.images, x: pendingPlacement.x, y: pendingPlacement.y,
      size: clampSpotSize(newSpot.size), requiresBuildable: newSpot.requiresBuildable,
      verified: newSpot.verified, patchVersion: newSpot.patchVersion,
      createdBy: userId, createdByName: userName,
      cones: null, fireLines: null, routes: [], pending: true,
    }

    setIsSavingNewSpot(true)
    addSpotToMaps(optimistic)
    setSelectedSpot(optimistic); setShowAddSpot(false); setPendingPlacement(null)
     resetNewSpotState()

    try {
      const uploadedUrls = await Promise.all(newSpot.imageFiles.map(uploadImage))
      const { data, error } = await supabase.from('spots').insert({
        map_id: selectedMapId, title: newSpot.title.trim(),
        role: primaryRole, roles: newSpot.roles, side: normalizeSide(newSpot.side),
        notes: newSpot.notes.trim(), youtube: newSpot.youtube.trim() || null,
        images: uploadedUrls, x: pendingPlacement.x, y: pendingPlacement.y,
        size: clampSpotSize(newSpot.size), requires_buildable: newSpot.requiresBuildable,
        verified: newSpot.verified, patch_version: newSpot.patchVersion,
        created_by: userId, created_by_name: userName,
        cone: null, fire_lines: null, routes: [],
      }).select().single()
      if (error) throw error
      const saved = normalizeSpot(data)
      replaceSpotInMaps(tempId, saved); setSelectedSpot(saved)
      await saveSpotHistory(saved)
      await loadFeed()
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
      requiresBuildable: selectedSpot.requiresBuildable || false,
      verified: selectedSpot.verified || false,
      patchVersion: selectedSpot.patchVersion || '',
      images: selectedSpot.images || [],
      cones: selectedSpot.cones || null, fireLines: selectedSpot.fireLines || null,
      routes: selectedSpot.routes || [],
    })
    setEditSpotNewFiles([])
    setEditSpotNewPreviews([])
    if (editFileInputRef.current) editFileInputRef.current.value = ''
    
  }

  const saveEditedSpot = async () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    const primaryRole   = editSpot.roles[0] || 'MG'
    const cleanedCones  = cleanupConeSet(editSpot.cones)
    const cleanedLines  = cleanupLineSet(editSpot.fireLines)
    const cleanedRoutes = editSpot.routes.filter((r) => r.points.length >= 2)

    // Save snapshot before overwriting
    await saveSpotHistory(selectedSpot)

    let uploadedUrls: string[] = []
    if (editSpotNewFiles.length > 0) {
      try { uploadedUrls = await Promise.all(editSpotNewFiles.map(uploadImage)) }
      catch (err: any) { console.error('Image upload error:', err); return }
    }
    const finalImages = [...editSpot.images, ...uploadedUrls]

    const { error } = await supabase.from('spots').update({
      title: editSpot.title.trim(), role: primaryRole, roles: editSpot.roles,
      side: normalizeSide(editSpot.side), notes: editSpot.notes.trim(),
      youtube: editSpot.youtube.trim() || null, size: clampSpotSize(editSpot.size),
      requires_buildable: editSpot.requiresBuildable,
      verified: editSpot.verified,
      patch_version: editSpot.patchVersion,
      last_edited_by: userId, last_edited_by_name: userName,
      last_edited_at: new Date().toISOString(),
      images: finalImages,
      cone: cleanedCones, fire_lines: cleanedLines, routes: cleanedRoutes,
    }).eq('id', selectedSpot.id)

    if (error) { console.error('Update error:', error); return }
    const refreshedSpot: Spot = {
      ...selectedSpot,
      title: editSpot.title.trim(),
      role: primaryRole,
      roles: editSpot.roles,
      side: normalizeSide(editSpot.side),
      notes: editSpot.notes.trim(),
      youtube: editSpot.youtube.trim() || null,
      size: clampSpotSize(editSpot.size),
      requiresBuildable: editSpot.requiresBuildable,
      verified: editSpot.verified,
      patchVersion: editSpot.patchVersion,
      images: finalImages,
      cones: cleanedCones,
      fireLines: cleanedLines,
      routes: cleanedRoutes,
      lastEditedBy: userId,
      lastEditedByName: userName,
      lastEditedAt: new Date().toISOString(),
    }
    patchSpotInMaps(selectedSpot.id, refreshedSpot)
    setSelectedSpot(refreshedSpot)
    await saveSpotHistory(refreshedSpot)
    await loadFeed()
    revokeUrls(editSpotNewPreviews)
    setEditSpotNewFiles([])
    setEditSpotNewPreviews([])
    setEditingSpotId(null); setRouteDrawMode(false); resetPlacementState()
  }

  const deleteSelectedSpot = () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    const spotToDelete = selectedSpot
    // Cancel any existing undo toast
    if (undoToast) { clearTimeout(undoToast.timerId); setUndoToast(null) }
    // Optimistically remove from UI immediately
    setSelectedSpot(null); setEditingSpotId(null)
    removeSpotFromMaps(spotToDelete.id)
    // Save history snapshot then start 6-second undo window
    saveSpotHistory(spotToDelete)
    loadFeed()
    const timerId = setTimeout(async () => {
      const { error } = await supabase.from('spots').delete().eq('id', spotToDelete.id)
      if (error) {
        console.error('Delete error:', error)
        addSpotToMaps(spotToDelete) // restore on failure
      }
      setUndoToast(null)
    }, 6000)
    setUndoToast({ spot: spotToDelete, timerId })
  }

  const undoDelete = () => {
    if (!undoToast) return
    clearTimeout(undoToast.timerId)
    addSpotToMaps(undoToast.spot)
    setSelectedSpot(undoToast.spot)
    setUndoToast(null)
  }

  const postComment = async () => {
    if (!selectedSpot || typeof selectedSpot.id !== 'number') return
    const content = commentText.trim()
    if (!content) return
    setCommentText('')
    const tempComment: SpotComment = {
      id: Date.now(), spot_id: selectedSpot.id,
      user_id: userId, user_name: userName,
      content, created_at: new Date().toISOString(),
    }
    setComments((p) => [...p, tempComment])
    const { data, error } = await supabase.from('spot_comments')
      .insert({ spot_id: selectedSpot.id, user_id: userId, user_name: userName, content })
      .select().single()
    if (error) {
      console.error('Comment error:', error)
      setComments((p) => p.filter((c) => c.id !== tempComment.id))
    } else if (data) {
      setComments((p) => p.map((c) => c.id === tempComment.id ? data as SpotComment : c))
    }
  }

  const deleteComment = async (commentId: number) => {
    setComments((p) => p.filter((c) => c.id !== commentId))
    await supabase.from('spot_comments').delete().eq('id', commentId)
  }

  const copySelectedSpot = async () => {
    if (!selectedSpot || selectedSpot.pending || typeof selectedSpot.id !== 'number') return
    const offset = 1.5
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Spot = {
      ...selectedSpot,
      id: tempId,
      title: `${selectedSpot.title} (copy)`,
      x: Math.min(99, selectedSpot.x + offset),
      y: Math.min(99, selectedSpot.y + offset),
      pending: true,
    }
    addSpotToMaps(optimistic)
    setSelectedSpot(optimistic)
    
    try {
      const { data, error } = await supabase.from('spots').insert({
        map_id:             selectedSpot.map_id,
        title:              `${selectedSpot.title} (copy)`,
        role:               selectedSpot.role,
        roles:              selectedSpot.roles,
        side:               selectedSpot.side,
        notes:              selectedSpot.notes,
        youtube:            selectedSpot.youtube,
        images:             selectedSpot.images || [],
        x:                  Math.min(99, selectedSpot.x + offset),
        y:                  Math.min(99, selectedSpot.y + offset),
        size:               selectedSpot.size,
        requires_buildable: selectedSpot.requiresBuildable,
        cone:               selectedSpot.cones || null,
        fire_lines:         selectedSpot.fireLines || null,
        routes:             selectedSpot.routes || [],
      }).select().single()
      if (error || !data) throw error || new Error('No data returned')
      const saved = normalizeSpot(data)
      replaceSpotInMaps(tempId, saved)
      setSelectedSpot(saved)
    } catch (err: any) {
      console.error('Copy error:', err)
      removeSpotFromMaps(tempId)
      setSelectedSpot(null)
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
    setSelectedSpot(spot); setShowAddSpot(false); setEditingSpotId(null); setIsDrawerOpen(true)
    resetPlacementState()
    setRouteDrawMode(false); setDrawingPoints([])
    setSelectedRouteId(null)
    // Push spot ID into URL so it can be shared
    if (typeof spot.id === 'number') {
      const url = new URL(window.location.href)
      url.searchParams.set('spot', String(spot.id))
      window.history.replaceState(null, '', url.toString())
    }
    // Scroll the spot card into view in the list
    requestAnimationFrame(() => {
      const el = spotItemRefs.current.get(spot.id)
      const list = spotListRef.current
      if (el && list) {
        const elTop    = el.offsetTop
        const elBottom = elTop + el.offsetHeight
        const listTop  = list.scrollTop
        const listBottom = listTop + list.clientHeight
        if (elTop < listTop || elBottom > listBottom) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }
    })
  }

  const openAddSpot = () => {
    if (showAddSpot) {
      revokeUrls(newSpot.images); resetNewSpotState()
      setPendingPlacement(null); setShowAddSpot(false); setEditingSpotId(null)
       return
    }
    setShowAddSpot(true); setEditingSpotId(null);  setPendingPlacement(null)
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

  const openLightbox = (images: string[], startIndex: number) => {
    if (!images.length) return
    const safeIndex = Math.max(0, Math.min(startIndex, images.length - 1))
    setLightboxImages(images)
    setLightboxIndex(safeIndex)
  }

  const closeLightbox = () => {
    setLightboxIndex(null)
    setLightboxImages([])
  }

  const showPrevLightboxImage = () => {
    if (lightboxIndex === null || lightboxImages.length === 0) return
    setLightboxIndex((prev) => {
      if (prev === null) return prev
      return prev === 0 ? lightboxImages.length - 1 : prev - 1
    })
  }

  const showNextLightboxImage = () => {
    if (lightboxIndex === null || lightboxImages.length === 0) return
    setLightboxIndex((prev) => {
      if (prev === null) return prev
      return prev === lightboxImages.length - 1 ? 0 : prev + 1
    })
  }

  React.useEffect(() => {
    if (lightboxIndex === null) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') showPrevLightboxImage()
      if (e.key === 'ArrowRight') showNextLightboxImage()
      if (e.key === 'Escape') closeLightbox()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, lightboxImages])

  // ── cursor style for map
  const mapCursor = (draggingSpotId !== null || draggingSnipeSide !== null) ? 'cursor-grabbing'
    : isDragging ? 'cursor-grabbing'
    : (showAddSpot || placementMode || routeDrawMode) ? 'cursor-crosshair'
    : 'cursor-grab'

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,#060906_0%,#0a0f0b_100%)] text-white">
      <div className="mx-auto max-w-[1800px] px-4 pb-6 pt-3 md:px-6">

        {/* ── Logo bar */}
        <div ref={logoBarRef} className="sticky top-0 z-40 mb-4 overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3 md:py-4">
            <a href="/" className="rounded-xl border border-emerald-300/15 bg-emerald-900/30 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-white hover:bg-emerald-800/50">
              ← Home
            </a>
            <img src="/pathfinders-logo.png" alt="Pathfinders"
              className="max-h-[55px] w-auto object-contain md:max-h-[75px]" />
            <div className="w-[60px]" />{/* spacer to keep logo centered */}
          </div>
        </div>

        {/* ── Row 1: filters */}
        <div ref={filterRow1Ref} className="z-30 mb-2 rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
            {/* Map selector */}
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Map</label>
              <select value={selectedMapId} onChange={(e) => setSelectedMapId(e.target.value)} className={inputClass}>
                {maps.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.spots.length})</option>)}
              </select>
            </div>
            {/* Search */}
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Search</label>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search spots..." className={inputClass} />
            </div>
            {/* Role checkboxes */}
            <div className="xl:col-span-2">
              <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                Roles {roleFilters.size > 0 && <span className="ml-1 text-emerald-400">({roleFilters.size})</span>}
              </label>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {roleNames.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300 hover:text-white">
                    <input type="checkbox" checked={roleFilters.has(r)} className="h-4 w-4 accent-emerald-500"
                      onChange={() => setRoleFilters((prev) => {
                        const next = new Set(prev)
                        next.has(r) ? next.delete(r) : next.add(r)
                        return next
                      })} />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            {/* Side checkboxes */}
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Side</label>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {(['Axis', 'Allies', 'Both'] as const).map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300 hover:text-white">
                    <input type="checkbox" checked={sideFilters.has(s)} className="accent-emerald-500"
                      onChange={() => setSideFilters((prev) => {
                        const next = new Set(prev)
                        next.has(s) ? next.delete(s) : next.add(s)
                        return next
                      })} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            {/* Midpoint */}
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Midpoint</label>
              <select value={activeMidpoint} onChange={(e) => setActiveMidpoint(e.target.value)} className={inputClass}>
                <option value="All">All Midpoints</option>
                {(selectedMap?.midpoints || []).map((mp) => <option key={mp} value={mp}>{mp}</option>)}
              </select>
            </div>
            {/* Sort + Buildable */}
            <div className="flex flex-col gap-2">
              <label className="block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Sort</label>
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as 'alphabetical' | 'role')} className={inputClass}>
                <option value="alphabetical">Alphabetical</option>
                <option value="role">By Role</option>
              </select>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300 hover:text-white">
                <input type="checkbox" checked={buildableFilter} className="accent-emerald-500"
                  onChange={(e) => setBuildableFilter(e.target.checked)} />
                Requires Buildable only
              </label>
            </div>
            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button onClick={openAddSpot} disabled={!canAdd} className={`w-full ${showAddSpot ? buttonClass : softButtonClass} ${!canAdd ? 'cursor-not-allowed opacity-40' : ''}`}>
                {showAddSpot ? 'Cancel Add Spot' : 'Add Spot'}
              </button>
              <a href="/admin" className={`${buttonClass} flex w-full items-center justify-center`}>
                Admin Panel
              </a>
            </div>
          </div>
        </div>

        {/* ── Row 2: layer toggles */}
        <div ref={filterRow2Ref} className="z-30 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[24px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.40)] backdrop-blur-xl">
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
          <div className="ml-auto flex items-center gap-3">
            {/* Universal dot size — local only, stored in localStorage */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.20em] text-zinc-500">Dot Size</span>
              <input type="range" min="-8" max="12" step="1" value={localSizeOffset}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setLocalSizeOffset(v)
                  localStorage.setItem('hll_dot_size_offset', String(v))
                }}
                className="w-24 accent-emerald-500" />
              <button onClick={() => { setLocalSizeOffset(0); localStorage.setItem('hll_dot_size_offset', '0') }}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition">reset</button>
              <span className="text-[9px] text-zinc-600 whitespace-nowrap">👁 only you</span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.20em] text-zinc-600">
              {filteredSpots.length} spot{filteredSpots.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Main grid */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)_390px]">

          {/* ── Left side panel: selected spot replaces activity */}
          <div className="xl:sticky xl:self-start" style={{ top: `${panelTop}px` }}>
            {selectedSpot ? (
              <div className={`${panelClass} p-4`}>
              {/* Drawer header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="truncate pr-2 text-xs font-semibold text-white sm:text-sm">
                  {editingSpotId ? 'Editing' : selectedSpot.title}
                </span>
                <button onClick={() => {
                  if (editingSpotId) { cancelEditSpot(); return }
                  setSelectedSpot(null)
                  setIsDrawerOpen(false)
                  const url = new URL(window.location.href)
                  url.searchParams.delete('spot')
                  window.history.replaceState(null, '', url.toString())
                }} className="flex-shrink-0 rounded-xl border border-emerald-300/15 bg-emerald-900/40 px-2 py-1 text-xs text-zinc-400 transition hover:text-white">✕</button>
              </div>

              {editingSpotId ? (
                /* ── EDIT FORM */
                <div className="space-y-3">
                  <input value={editSpot.title} onChange={(e) => setEditSpot((p) => ({ ...p, title: e.target.value }))} placeholder="Spot title" className={inputClass} />
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
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
                  <select value={editSpot.side} onChange={(e) => { const nextSide = e.target.value as SpotSide; setEditSpot((p) => ({ ...p, side: nextSide })); setEditingConeSide(nextSide === 'Allies' ? 'Allies' : 'Axis') }} className={inputClass}>
                    <option value="Axis">Axis</option><option value="Allies">Allies</option><option value="Both">Both</option>
                  </select>
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                    <label className="text-[11px] uppercase tracking-[0.28em] text-zinc-400 whitespace-nowrap">Size</label>
                    <input type="range" min="2" max="20" value={clampSpotSize(editSpot.size)} onChange={(e) => updateEditSpotSize(Number(e.target.value))} className="w-full accent-emerald-500" />
                    <span className="w-6 text-xs text-zinc-300">{clampSpotSize(editSpot.size)}</span>
                    <span className="text-[9px] text-emerald-600 whitespace-nowrap">👥 everyone</span>
                  </div>
                  {(canUseCone || canUseLine) && (
                    <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-3 flex flex-wrap gap-2">
                        {availableConeSides.map((s) => (
                          <button key={s} onClick={() => setEditingConeSide(s)}
                            className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${editingConeSide === s ? s === 'Axis' ? 'border border-red-300/30 bg-red-600/80 text-white' : 'border border-blue-300/30 bg-blue-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>{s}</button>
                        ))}
                        {canUseCone && <button onClick={() => setToolMode('cone')} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${toolMode === 'cone' ? 'border border-emerald-300/30 bg-emerald-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>Cone</button>}
                        {canUseLine && <button onClick={() => setToolMode('line')} className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${toolMode === 'line' ? 'border border-emerald-300/30 bg-emerald-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>Snipe Line</button>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {toolMode === 'cone' && canUseCone && (<>
                          <button onClick={beginConePlacement} className={softButtonClass}>{placementMode ? `Placing ${editingConeSide}...` : `Mark ${editingConeSide} Cone`}</button>
                          <button onClick={clearCone} className={softButtonClass}>Clear {editingConeSide}</button>
                        </>)}
                        {toolMode === 'line' && canUseLine && (<>
                          <div className="w-full mb-2">
                            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Midpoint</label>
                            <select value={snipeLineMidpoint} onChange={(e) => setSnipeLineMidpoint(e.target.value)} className={tinyInputClass + ' w-full'}>
                              <option value="Any">Any (always visible)</option>
                              {(selectedMap?.midpoints || []).map((mp) => <option key={mp} value={mp}>{mp}</option>)}
                            </select>
                          </div>
                          <button onClick={beginLinePlacement} className={softButtonClass}>{placementMode === 'line_end' ? `Placing ${editingConeSide}...` : `Mark ${editingConeSide} Snipe`}</button>
                          <button onClick={clearLine} className={softButtonClass}>Clear {editingConeSide}</button>
                        </>)}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {toolMode === 'cone' && !placementMode && (currentEditingCone ? `${editingConeSide} cone — ${Math.round(currentEditingCone.length * 20)}m, ${Math.round(currentEditingCone.spread)}° spread` : `No ${editingConeSide} cone yet.`)}
                        {toolMode === 'cone' && placementMode === 'cone_first' && `Click 1st edge of ${editingConeSide} cone.`}
                        {toolMode === 'cone' && placementMode === 'cone_second' && `Preview, then click 2nd edge.`}
                        {toolMode === 'line' && !placementMode && (currentEditingLine ? `${editingConeSide} snipe — ${selectedSpot ? getDistanceMeters(selectedSpot.x, selectedSpot.y, currentEditingLine.endX, currentEditingLine.endY) : 0}m / max ${getMaxRangeMeters(primaryEditRole, editingConeSide)}m` : `No ${editingConeSide} snipe yet.`)}
                        {toolMode === 'line' && placementMode === 'line_end' && `Move to preview, click impact.`}
                      </div>
                    </div>
                  )}
                  {canUseRoute && (
                    <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <label className="mb-3 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Routes</label>
                      <div className="mb-3 flex gap-2">
                        {(['Axis', 'Allies'] as ConeSide[]).map((s) => (
                          <button key={s} onClick={() => setNewRouteConfig((p) => ({ ...p, side: s }))}
                            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${newRouteConfig.side === s ? s === 'Axis' ? 'border border-red-300/30 bg-red-600/80 text-white' : 'border border-blue-300/30 bg-blue-600/80 text-white' : 'border border-emerald-300/15 bg-emerald-900/35 text-emerald-50 hover:bg-emerald-800/55'}`}>{s}</button>
                        ))}
                      </div>
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Midpoint</label>
                        <select value={newRouteConfig.midpoint} onChange={(e) => setNewRouteConfig((p) => ({ ...p, midpoint: e.target.value }))} className={tinyInputClass + ' w-full'}>
                          <option value="Any">Any Midpoint</option>
                          {(selectedMap?.midpoints || []).map((mp) => <option key={mp} value={mp}>{mp}</option>)}
                        </select>
                      </div>
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Color</label>
                        <div className="flex flex-wrap gap-2">
                          {ROUTE_COLORS.map((c) => (
                            <button key={c.value} onClick={() => setNewRouteConfig((p) => ({ ...p, color: c.value }))} title={c.name}
                              className={`h-6 w-6 rounded-full border-2 transition ${newRouteConfig.color === c.value ? 'border-white scale-125' : 'border-transparent hover:border-white/50'}`}
                              style={{ backgroundColor: c.value }} />
                          ))}
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Label</label>
                        <select value={newRouteConfig.label} onChange={(e) => setNewRouteConfig((p) => ({ ...p, label: e.target.value }))} className={tinyInputClass + ' w-full'}>
                          {ROUTE_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Width — {newRouteConfig.strokeWidth}px</label>
                        <input type="range" min="2" max="8" value={newRouteConfig.strokeWidth} onChange={(e) => setNewRouteConfig((p) => ({ ...p, strokeWidth: Number(e.target.value) }))} className="w-full accent-emerald-500" />
                      </div>
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Route Video</label>
                        <input value={newRouteConfig.youtube} onChange={(e) => setNewRouteConfig((p) => ({ ...p, youtube: e.target.value }))} placeholder="YouTube link" className={tinyInputClass + ' w-full'} />
                      </div>
                      <button onClick={() => setRouteDrawMode((p) => !p)} className={`w-full ${routeDrawMode ? buttonClass : softButtonClass}`}>
                        {routeDrawMode ? 'Drawing — hold mouse on map' : 'Draw Route'}
                      </button>
                      {routeDrawMode && <p className="mt-1.5 text-xs text-zinc-500">Hold mouse down and drag. Release to finish.</p>}
                      {editSpot.routes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <label className="block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Saved ({editSpot.routes.length})</label>
                          {editSpot.routes.map((r) => (
                            <div key={r.id} className="flex items-center gap-2 rounded-xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                              <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                              <span className="flex-1 text-xs text-zinc-300"><span className="font-medium text-white">{r.label}</span>{` · `}{r.side}{` · `}{getRouteTotalDistance(r)}m</span>
                              <button onClick={() => deleteRoute(r.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <textarea value={editSpot.notes} onChange={(e) => setEditSpot((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} className={inputClass} />
                  <input value={editSpot.youtube} onChange={(e) => setEditSpot((p) => ({ ...p, youtube: e.target.value }))} placeholder="YouTube link" className={inputClass} />
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-4 py-3 hover:bg-emerald-900/30">
                    <input type="checkbox" checked={editSpot.requiresBuildable} className="accent-emerald-500 h-4 w-4" onChange={(e) => setEditSpot((p) => ({ ...p, requiresBuildable: e.target.checked }))} />
                    <div><div className="text-sm font-medium text-white">Requires Buildable</div><div className="text-xs text-zinc-500">Spot needs a buildable</div></div>
                  </label>
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3 space-y-3">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={editSpot.verified} className="accent-emerald-500 h-4 w-4" onChange={(e) => setEditSpot((p) => ({ ...p, verified: e.target.checked }))} />
                      <div><div className="text-sm font-medium text-white">Verified</div><div className="text-xs text-zinc-500">Works in current patch</div></div>
                    </label>
                    <div>
                      <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Patch Version</label>
                      <input value={editSpot.patchVersion} onChange={(e) => setEditSpot((p) => ({ ...p, patchVersion: e.target.value }))} placeholder="e.g. 14.3" className={tinyInputClass + ' w-full'} />
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">Photos ({editSpot.images.length + editSpotNewPreviews.length}/5)</label>
                    {editSpot.images.length > 0 && (
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {editSpot.images.map((img, idx) => (
                          <div key={idx} className="relative">
                            <img src={img} alt="" className="h-20 w-full rounded-xl border border-zinc-800 object-cover" />
                            <button onClick={() => setEditSpot((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))} className="absolute right-1 top-1 rounded-full bg-black/80 px-2 py-0.5 text-xs text-white hover:bg-red-900/90">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {editSpotNewPreviews.length > 0 && (
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {editSpotNewPreviews.map((url, idx) => (
                          <div key={idx} className="relative">
                            <img src={url} alt="" className="h-20 w-full rounded-xl border border-emerald-600/40 object-cover" />
                            <span className="absolute left-1 top-1 rounded-full bg-emerald-700/90 px-1.5 py-0.5 text-[10px] text-white">New</span>
                            <button onClick={() => { URL.revokeObjectURL(editSpotNewPreviews[idx]); setEditSpotNewPreviews((p) => p.filter((_, i) => i !== idx)); setEditSpotNewFiles((p) => p.filter((_, i) => i !== idx)) }} className="absolute right-1 top-1 rounded-full bg-black/80 px-2 py-0.5 text-xs text-white hover:bg-red-900/90">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {editSpot.images.length + editSpotNewPreviews.length < 5 && (
                      <>
                        <input ref={editFileInputRef} type="file" accept="image/*" multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || [])
                            const slots = 5 - editSpot.images.length - editSpotNewPreviews.length
                            const limited = files.slice(0, slots); if (!limited.length) return
                            const previews = limited.map((f) => URL.createObjectURL(f))
                            setEditSpotNewFiles((p) => [...p, ...limited]); setEditSpotNewPreviews((p) => [...p, ...previews])
                            if (editFileInputRef.current) editFileInputRef.current.value = ''
                          }} className="text-sm text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-900/60 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-emerald-800" />
                        <p className="mt-1.5 text-xs text-zinc-600">{5 - editSpot.images.length - editSpotNewPreviews.length} slot{5 - editSpot.images.length - editSpotNewPreviews.length !== 1 ? 's' : ''} remaining</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEditedSpot} className={buttonClass}>Save Changes</button>
                    <button onClick={cancelEditSpot} className={softButtonClass}>Cancel</button>
                  </div>
                </div>
              ) : (
                /* ── VIEW */
                <div className="space-y-3">
                  {selectedSpot.images && selectedSpot.images.length > 0 && (
                    <>
                      <img src={selectedSpot.images[0]} alt={selectedSpot.title}
                        className="max-h-[420px] w-full cursor-pointer rounded-[18px] border border-zinc-800 bg-black/30 object-contain"
                        onClick={() => openLightbox(selectedSpot.images || [], 0)} />
                      {selectedSpot.images.length > 1 && (
                        <div className="grid grid-cols-4 gap-1.5">
                          {selectedSpot.images.slice(1).map((img, idx) => (
                            <img key={idx} src={img} alt="" className="h-12 w-full cursor-pointer rounded-xl border border-zinc-800 object-cover" onClick={() => openLightbox(selectedSpot.images || [], idx + 1)} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex flex-wrap gap-1.5 text-xs uppercase tracking-[0.16em]">
                    {selectedSpot.roles.map((r) => <span key={r} className={`rounded-full px-2 py-0.5 text-white ${getRoleColor(r)}`}>{r}</span>)}
                    <span className={`rounded-full px-2 py-0.5 ${getSideClasses(selectedSpot.side).badge}`}>{selectedSpot.side}</span>
                    {selectedSpot.verified ? <span className="rounded-full border border-emerald-400/40 bg-emerald-800/50 px-2 py-0.5 text-emerald-200">✓{selectedSpot.patchVersion ? ` ${selectedSpot.patchVersion}` : ''}</span> : <span className="rounded-full border border-zinc-600/40 bg-zinc-800/50 px-2 py-0.5 text-zinc-500">Unverified</span>}
                    {selectedSpot.requiresBuildable && <span className="rounded-full border border-amber-400/30 bg-amber-900/40 px-2 py-0.5 text-amber-200">Buildable</span>}
                    {selectedSpot.cones?.Axis    && <span className="rounded-full border border-red-300/15 bg-red-900/35 px-2 py-0.5 text-white">Axis Cone</span>}
                    {selectedSpot.cones?.Allies  && <span className="rounded-full border border-blue-300/15 bg-blue-900/35 px-2 py-0.5 text-white">Allies Cone</span>}
                    {selectedSpot.fireLines?.Axis   && <span className="rounded-full border border-red-300/15 bg-red-900/35 px-2 py-0.5 text-white">Axis Snipe</span>}
                    {selectedSpot.fireLines?.Allies && <span className="rounded-full border border-blue-300/15 bg-blue-900/35 px-2 py-0.5 text-white">Allies Snipe</span>}
                    {selectedSpot.pending && <span className="rounded-full border border-emerald-300/20 bg-emerald-950/70 px-2 py-0.5 text-emerald-100">Saving...</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                    {selectedSpot.createdByName && <span>Added by <span className="text-zinc-300">{selectedSpot.createdByName}</span>{selectedSpot.created_at && <span className="ml-1 text-zinc-600">· {new Date(selectedSpot.created_at).toLocaleDateString()}</span>}</span>}
                    {selectedSpot.lastEditedByName && <span>Edited by <span className="text-zinc-300">{selectedSpot.lastEditedByName}</span>{selectedSpot.lastEditedAt && <span className="ml-1 text-zinc-600">· {new Date(selectedSpot.lastEditedAt).toLocaleDateString()}</span>}</span>}
                  </div>
                  {selectedSpot.notes && <p className="text-sm leading-5 text-zinc-300">{selectedSpot.notes}</p>}
                  {!selectedSpot.pending && (
                    <div className="flex items-center gap-2 rounded-2xl border border-zinc-700/40 bg-zinc-900/40 px-3 py-2">
                      <label className="text-[11px] uppercase tracking-[0.28em] text-zinc-500 whitespace-nowrap">Size</label>
                      <input type="range" min="-8" max="12" step="1"
                        value={localSpotSizes[selectedSpot.id] ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          const next = { ...localSpotSizes, [selectedSpot.id]: v }
                          setLocalSpotSizes(next)
                          localStorage.setItem('hll_spot_sizes', JSON.stringify(next))
                        }}
                        className="w-full accent-zinc-500" />
                      <span className="text-[9px] text-zinc-600 whitespace-nowrap">👁 only you</span>
                    </div>
                  )}
                  {(selectedSpot.cones?.Axis || selectedSpot.cones?.Allies) && (
                    <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">LOS Cones</div>
                      {selectedSpot.cones?.Axis && <div className="grid grid-cols-3 gap-1 text-xs text-red-300"><div>Dir <span className="text-white">{Math.round(selectedSpot.cones.Axis.angle)}°</span></div><div>Spread <span className="text-white">{Math.round(selectedSpot.cones.Axis.spread)}°</span></div><div>Range <span className="text-white">{Math.round(selectedSpot.cones.Axis.length * 20)}m</span></div></div>}
                      {selectedSpot.cones?.Allies && <div className="mt-1.5 grid grid-cols-3 gap-1 text-xs text-blue-300"><div>Dir <span className="text-white">{Math.round(selectedSpot.cones.Allies.angle)}°</span></div><div>Spread <span className="text-white">{Math.round(selectedSpot.cones.Allies.spread)}°</span></div><div>Range <span className="text-white">{Math.round(selectedSpot.cones.Allies.length * 20)}m</span></div></div>}
                    </div>
                  )}
                  {(selectedSpot.fireLines?.Axis || selectedSpot.fireLines?.Allies) && (
                    <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Snipe Lines</div>
                      {selectedSpot.fireLines?.Axis && (() => { const l = selectedSpot.fireLines!.Axis!; const dm = getDistanceMeters(selectedSpot.x, selectedSpot.y, l.endX, l.endY); const maxM = getMaxRangeMeters(selectedSpot.roles?.[0] || selectedSpot.role || 'MG', 'Axis'); return <div className="grid grid-cols-3 gap-1 text-xs text-red-300"><div>Axis <span className="text-white">{dm}m</span></div><div>Max <span className="text-white">{maxM}m</span>{dm > maxM && <span className="ml-1 text-yellow-400">OUT</span>}</div><div className="text-zinc-500">{l.midpoint !== 'Any' ? l.midpoint : 'Any'}</div></div> })()}
                      {selectedSpot.fireLines?.Allies && (() => { const l = selectedSpot.fireLines!.Allies!; const dm = getDistanceMeters(selectedSpot.x, selectedSpot.y, l.endX, l.endY); const maxM = getMaxRangeMeters(selectedSpot.roles?.[0] || selectedSpot.role || 'MG', 'Allies'); return <div className="mt-1.5 grid grid-cols-3 gap-1 text-xs text-blue-300"><div>Allies <span className="text-white">{dm}m</span></div><div>Max <span className="text-white">{maxM}m</span>{dm > maxM && <span className="ml-1 text-yellow-400">OUT</span>}</div><div className="text-zinc-500">{l.midpoint !== 'Any' ? l.midpoint : 'Any'}</div></div> })()}
                    </div>
                  )}
                  {(selectedSpot.routes || []).length > 0 && (
                    <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                      <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Routes</div>
                      <div className="space-y-1.5">
                        {(selectedSpot.routes || []).map((route) => {
                          const isSel = selectedRouteId === route.id
                          return (
                            <button key={route.id} onClick={() => setSelectedRouteId(isSel ? null : route.id)}
                              className={`w-full rounded-xl border p-2 text-left transition ${isSel ? 'border-emerald-300/30 bg-emerald-600/15' : 'border-emerald-400/8 bg-emerald-950/20 hover:bg-emerald-900/30'}`}>
                              <div className="flex items-start gap-3">
                                <span className="h-3 w-3 flex-shrink-0 rounded-full mt-0.5" style={{ backgroundColor: route.color }} />
                                <span className="text-sm font-medium text-white">{route.label}</span>
                                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${route.side === 'Axis' ? 'bg-red-700/70 text-red-100' : 'bg-blue-700/70 text-blue-100'}`}>{route.side}</span>
                              </div>
                              <div className="mt-0.5 flex gap-3 text-[11px] text-zinc-500">
                                <span>{route.midpoint}</span><span>{getRouteTotalDistance(route)}m</span>{route.youtube && <span className="text-emerald-400">▶</span>}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                      {selectedRoute && (selectedRouteEmbed ? (
                        <div className="mt-3 overflow-hidden rounded-[18px] border border-zinc-800 bg-black">
                          <iframe className="aspect-video w-full" src={`${selectedRouteEmbed}?rel=0&modestbranding=1`} title={`${selectedRoute.label} route video`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                        </div>
                      ) : selectedRoute.youtube ? (
                        <a href={selectedRoute.youtube} target="_blank" rel="noreferrer"
                          className="mt-2 inline-flex items-center rounded-xl border border-emerald-300/15 bg-emerald-900/35 px-3 py-1.5 text-sm hover:bg-emerald-800/55">
                          ▶ Open route video ↗
                        </a>
                      ) : null)}
                    </div>
                  )}
                  {selectedSpotEmbedUrl ? (
                    <div className="overflow-hidden rounded-[18px] border border-zinc-800 bg-black">
                      <iframe className="aspect-video w-full" src={`${selectedSpotEmbedUrl}?rel=0&modestbranding=1`} title={`${selectedSpot.title} video`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                  ) : selectedSpot.youtube ? (
                    <a href={selectedSpot.youtube} target="_blank" rel="noreferrer"
                      className="inline-flex w-fit items-center rounded-2xl border border-emerald-300/15 bg-emerald-900/35 px-4 py-2 text-sm font-medium hover:bg-emerald-800/55">
                      ▶ Open on YouTube ↗
                    </a>
                  ) : null}
                  {/* Comments */}
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Comments {comments.length > 0 && <span className="text-zinc-500">({comments.length})</span>}</div>
                    {isLoadingComments ? (
                      <div className="py-2 text-xs text-zinc-600">Loading...</div>
                    ) : comments.length === 0 ? (
                      <div className="py-1 text-xs text-zinc-600">No comments yet.</div>
                    ) : (
                      <div className="mb-3 space-y-2 max-h-40 overflow-y-auto">
                        {comments.map((c) => (
                          <div key={c.id} className="group flex gap-2">
                            <div className="flex-1 rounded-xl border border-emerald-400/8 bg-emerald-950/25 px-3 py-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-emerald-300">{c.user_name}</span>
                                <span className="text-[10px] text-zinc-600">{new Date(c.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-sm text-zinc-300 leading-5">{c.content}</p>
                            </div>
                            {(c.user_id === userId || userRole === 'admin') && (
                              <button onClick={() => deleteComment(c.id)} className="opacity-0 group-hover:opacity-100 self-start mt-1 text-zinc-600 hover:text-red-400 transition text-xs">✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }}
                        placeholder="Add a comment..." className={tinyInputClass + ' flex-1'} />
                      <button onClick={postComment} disabled={!commentText.trim()}
                        className="rounded-xl border border-emerald-300/25 bg-emerald-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed">Post</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-700">
                    <span><kbd className="rounded bg-zinc-800 px-1 py-0.5">↑↓</kbd> navigate</span>
                    {canEdit && <span><kbd className="rounded bg-zinc-800 px-1 py-0.5">E</kbd> edit</span>}
                    <span><kbd className="rounded bg-zinc-800 px-1 py-0.5">Esc</kbd> close</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canEdit && <button onClick={startEditingSpot} disabled={!!selectedSpot.pending} className={`${softButtonClass} ${selectedSpot.pending ? 'cursor-not-allowed opacity-60' : ''}`}>Edit</button>}
                    {canEdit && <button onClick={copySelectedSpot} disabled={!!selectedSpot.pending} className={`${softButtonClass} ${selectedSpot.pending ? 'cursor-not-allowed opacity-60' : ''}`}>Copy</button>}
                    {typeof selectedSpot.id === 'number' && (
                      <button onClick={() => {
                        const url = new URL(window.location.href)
                        url.searchParams.set('spot', String(selectedSpot.id))
                        navigator.clipboard.writeText(url.toString()).then(() => alert('Link copied!')).catch(() => alert(url.toString()))
                      }} className={softButtonClass}>🔗 Share</button>
                    )}
                    {canDelete && <button onClick={deleteSelectedSpot} disabled={!!selectedSpot.pending} className={`inline-flex items-center rounded-2xl border border-red-700 bg-red-900/60 px-4 py-2 text-sm font-medium hover:bg-red-800/70 ${selectedSpot.pending ? 'cursor-not-allowed opacity-60' : ''}`}>Delete</button>}
                  </div>
                </div>
              )}

              </div>
            ) : (
            <div className={`${panelClass} p-4`}>
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">Activity</span>
                <div className="flex items-center gap-2">
                  {feedHasNew && (
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-600/60 px-2 py-0.5 text-[10px] text-emerald-100">
                      New
                    </span>
                  )}
                  <button onClick={loadFeed} disabled={feedLoading}
                    className="text-zinc-600 hover:text-zinc-300 transition text-sm" title="Refresh">
                    {feedLoading ? '…' : '↻'}
                  </button>
                </div>
              </div>

              {/* Feed items */}
              <div className="max-h-[72vh] overflow-y-auto space-y-px">
                {feedLoading && feedItems.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-600">Loading...</div>
                ) : feedItems.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-600">No changes yet.</div>
                ) : feedItems.map((item) => {
                  const isNew      = feedLastSeen !== '' && item.changed_at > feedLastSeen
                  const spotName   = item.snapshot?.title ?? `Spot #${item.spot_id}`
                  const mapId      = item.snapshot?.map_id ?? ''
                  const mapLabel   = maps.find((m) => m.id === mapId)?.name ?? mapId
                  const date       = new Date(item.changed_at)
                  const diffMs     = Date.now() - date.getTime()
                  const diffMins   = Math.floor(diffMs / 60000)
                  const diffHrs    = Math.floor(diffMins / 60)
                  const timeStr    = diffMins < 1  ? 'just now'
                    : diffMins < 60 ? `${diffMins}m ago`
                    : diffHrs  < 24 ? `${diffHrs}h ago`
                    : date.toLocaleDateString()

                  return (
                    <div key={item.id}
                      className={`flex gap-2 rounded-xl px-2 py-2.5 transition-colors ${isNew ? 'bg-emerald-500/8' : 'hover:bg-emerald-900/20'}`}>
                      <div className="mt-1.5 flex-shrink-0">
                        {isNew
                          ? <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          : <span className="block h-1.5 w-1.5 rounded-full bg-zinc-700" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] leading-4 text-zinc-400">
                          <span className="font-medium text-emerald-300">{item.changed_by_name || 'Someone'}</span>
                          {' · '}
                          <button
                            onClick={() => {
                              // Switch to the right map and open the spot
                              const targetMap = maps.find((m) => m.id === mapId)
                              if (targetMap) {
                                setSelectedMapId(mapId)
                                const spot = targetMap.spots.find((s) => s.id === item.spot_id)
                                if (spot) setTimeout(() => selectSpot(spot), 80)
                              }
                            }}
                            className="font-medium text-white hover:text-emerald-300 transition text-left">
                            {spotName}
                          </button>
                        </div>
                        {mapLabel && (
                          <div className="mt-0.5 text-[10px] text-zinc-600">{mapLabel}</div>
                        )}
                        <div className="mt-0.5 text-[10px] text-zinc-700">{timeStr}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            )}
          </div>

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

              {/* Map content — BOTH width and height are set in JS so the container always
                   exactly matches the image's native aspect ratio on every monitor.
                   mx-auto centers it when height-constrained (container narrower than parent). */}
              <div ref={mapContainerRef} className="relative mx-auto bg-black/30"
                style={{
                  width:  containerDims ? `${containerDims.w}px` : '100%',
                  height: containerDims ? `${containerDims.h}px` : '56.25vw',
                }}>
                {selectedMap ? (
                  <div className={`absolute inset-0 ${mapCursor}`}
                    onMouseDown={handleMouseDown}
                    onClick={handleMapClick}
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transformOrigin: 'center center' }}>

                    {/* Map image — onLoad captures natural dimensions so ResizeObserver can
                         compute the exact container height, eliminating any letterboxing */}
                    <img src={selectedMap.image} alt={selectedMap.name}
                      className="pointer-events-none absolute inset-0 h-full w-full object-fill" draggable={false}
                      onLoad={(e) => {
                        const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget
                        if (nw && nh) setNaturalAspect(nw / nh)
                      }} />

                    {/* Satellite overlay */}
                    {hasSatellite && showSatellite && selectedMap.overlay && (
                      <img src={selectedMap.overlay} alt={`${selectedMap.name} satellite`}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
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

                            {/* Snipe lines */}
                            {showFireLines && roleSupportsLine(primaryRole) && spot.fireLines?.Axis && (() => {
                              const l = spot.fireLines.Axis!
                              if (activeMidpoint !== 'All' && l.midpoint !== 'Any' && l.midpoint !== activeMidpoint) return null
                              const endX = (draggingSnipeSide === 'Axis' && snipeDragPreview && editingSpotId === spot.id) ? snipeDragPreview.x : l.endX
                              const endY = (draggingSnipeSide === 'Axis' && snipeDragPreview && editingSpotId === spot.id) ? snipeDragPreview.y : l.endY
                              const dm = getDistanceMeters(spot.x, spot.y, endX, endY)
                              const maxM = getMaxRangeMeters(primaryRole, 'Axis')
                              return (
                                <SnipeLineShape startX={spot.x} startY={spot.y} endX={endX} endY={endY}
                                  side="Axis" distanceM={dm} outOfRange={dm > maxM}
                                  oob={isOutOfBounds(endX, endY, mapOrientation)} />
                              )
                            })()}
                            {showFireLines && roleSupportsLine(primaryRole) && spot.fireLines?.Allies && (() => {
                              const l = spot.fireLines.Allies!
                              if (activeMidpoint !== 'All' && l.midpoint !== 'Any' && l.midpoint !== activeMidpoint) return null
                              const endX = (draggingSnipeSide === 'Allies' && snipeDragPreview && editingSpotId === spot.id) ? snipeDragPreview.x : l.endX
                              const endY = (draggingSnipeSide === 'Allies' && snipeDragPreview && editingSpotId === spot.id) ? snipeDragPreview.y : l.endY
                              const dm = getDistanceMeters(spot.x, spot.y, endX, endY)
                              const maxM = getMaxRangeMeters(primaryRole, 'Allies')
                              return (
                                <SnipeLineShape startX={spot.x} startY={spot.y} endX={endX} endY={endY}
                                  side="Allies" distanceM={dm} outOfRange={dm > maxM}
                                  oob={isOutOfBounds(endX, endY, mapOrientation)} />
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

                    {/* ── Draggable snipe line endpoint handles (shown during edit) */}
                    {editingSpotId && selectedSpot && (['Axis', 'Allies'] as ConeSide[]).map((side) => {
                      const line = editSpot.fireLines?.[side]
                      if (!line) return null
                      return (
                        <div key={`snipe-handle-${side}`}
                          className="absolute z-10"
                          style={{
                            left: `${draggingSnipeSide === side && snipeDragPreview ? snipeDragPreview.x : line.endX}%`,
                            top:  `${draggingSnipeSide === side && snipeDragPreview ? snipeDragPreview.y : line.endY}%`,
                            transform: 'translate(-50%,-50%)', cursor: 'move'
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            draggingSnipeSideRef.current = side
                            setDraggingSnipeSide(side)
                            dragMoveRef.current = false
                            dragPosRef.current = null
                          }}>
                          <div className={`w-3 h-3 rounded-full border-2 border-white/80 ${side === 'Axis' ? 'bg-red-500/70' : 'bg-blue-500/70'}`} />
                        </div>
                      )
                    })}

                    {/* ── Spot markers (kept as HTML buttons for click handling) */}
                    {showMarkers && filteredSpots.map((spot) => {
                      const isActive     = selectedSpot?.id === spot.id
                      const sideStyles   = getSideClasses(spot.side)
                      const primaryRole  = spot.roles?.[0] || spot.role || 'MG'
                      const shape        = getRoleShape(primaryRole)
                      const renderedSize = getRenderedSpotSize(spot)

                      return (
                        <button key={spot.id}
                          onClick={(e) => { e.stopPropagation(); if (!dragMoveRef.current) selectSpot(spot) }}
                          onMouseDown={(e) => {
                            if (editingSpotId === spot.id) {
                              e.stopPropagation()
                              e.preventDefault()
                              draggingSpotIdRef.current = spot.id
                              draggedSpotElRef.current  = e.currentTarget
                              setDraggingSpotId(spot.id)
                              dragMoveRef.current = false
                              dragPosRef.current  = null
                            }
                          }}
                          className="group absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `${spot.x}%`,
                            top:  `${spot.y}%`,
                            opacity: spot.pending ? 0.68 : 1,
                            cursor: editingSpotId === spot.id ? 'move' : undefined,
                            pointerEvents: (placementMode || routeDrawMode) ? 'none' : undefined,
                          }}
                          aria-label={spot.title}>
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
                          size={Math.max(2, newSpot.roles?.[0] === 'Tank' ? Math.round(clampSpotSize(newSpot.size) * 0.6) : clampSpotSize(newSpot.size))}
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

          {/* ── Right panel — spot list */}
          <div className="xl:sticky xl:self-start xl:w-[360px] 2xl:w-[380px]" style={{ top: `${panelTop}px` }}>
            <div className={`${panelClass} p-4 md:p-5`}>

              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {showAddSpot ? 'New Spot' : editingSpotId ? 'Editing Spot' : `${sortedSpots.length} Spot${sortedSpots.length !== 1 ? 's' : ''}`}
                </span>
                <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                  {placementMode === 'cone_first'  ? `${editingConeSide} 1st Edge` :
                   placementMode === 'cone_second' ? `${editingConeSide} 2nd Edge` :
                   placementMode === 'line_end'    ? `${editingConeSide} Line End` :
                   routeDrawMode                   ? 'Drawing Route' : ''}
                </span>
              </div>

              {/* ── ADD SPOT FORM */}
              {showAddSpot && (
                <div className="mb-4 rounded-[22px] border border-emerald-300/20 bg-emerald-950/30 p-4 space-y-3">
                  <p className="text-xs text-zinc-400">Click map to place · fill out · save</p>
                  <input value={newSpot.title} onChange={(e) => setNewSpot((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Spot title" className={inputClass} />
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
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
                  <select
                    value={newSpot.side}
                    onChange={(e) => setNewSpot((p) => ({ ...p, side: e.target.value as SpotSide }))}
                    className={inputClass}
                  >
                    <option value="" disabled>Select side...</option>
                    <option value="Axis">Axis</option>
                    <option value="Allies">Allies</option>
                    <option value="Both">Both</option>
                  </select>
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                    <label className="text-[11px] uppercase tracking-[0.28em] text-zinc-400 whitespace-nowrap">Size</label>
                    <input type="range" min="2" max="20" value={clampSpotSize(newSpot.size)}
                      onChange={(e) => setNewSpot((p) => ({ ...p, size: clampSpotSize(Number(e.target.value)) }))}
                      className="w-full accent-emerald-500" />
                    <span className="w-6 text-xs text-zinc-300">{clampSpotSize(newSpot.size)}</span>
                  </div>
                  <textarea value={newSpot.notes} onChange={(e) => setNewSpot((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Notes / purpose / cautions" rows={2} className={inputClass} />
                  <input value={newSpot.youtube} onChange={(e) => setNewSpot((p) => ({ ...p, youtube: e.target.value }))}
                    placeholder="YouTube link" className={inputClass} />
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-4 py-3 hover:bg-emerald-900/30">
                    <input type="checkbox" checked={newSpot.requiresBuildable} className="accent-emerald-500 h-4 w-4"
                      onChange={(e) => setNewSpot((p) => ({ ...p, requiresBuildable: e.target.checked }))} />
                    <div>
                      <div className="text-sm font-medium text-white">Requires Buildable</div>
                      <div className="text-xs text-zinc-500">Spot needs a buildable to function</div>
                    </div>
                  </label>
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3 space-y-3">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={newSpot.verified} className="accent-emerald-500 h-4 w-4"
                        onChange={(e) => setNewSpot((p) => ({ ...p, verified: e.target.checked }))} />
                      <div>
                        <div className="text-sm font-medium text-white">Verified</div>
                        <div className="text-xs text-zinc-500">Tested and works in current patch</div>
                      </div>
                    </label>
                    <div>
                      <label className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Patch Version</label>
                      <input value={newSpot.patchVersion}
                        onChange={(e) => setNewSpot((p) => ({ ...p, patchVersion: e.target.value }))}
                        placeholder="e.g. 14.3 or U14" className={tinyInputClass + ' w-full'} />
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3">
                    <label className="mb-2 block text-sm text-zinc-300">Up to 5 images</label>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload}
                      className="text-sm text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-900/60 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-emerald-800" />
                    {newSpot.images.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {newSpot.images.map((img, idx) => (
                          <div key={idx} className="relative">
                            <img src={img} alt="" className="h-20 w-full rounded-xl border border-zinc-800 object-cover" />
                            <button onClick={() => removeNewSpotImage(idx)} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-zinc-500">{newSpot.images.length}/5</div>
                  </div>
                  <div className="rounded-[18px] border border-emerald-400/10 bg-emerald-950/18 p-3 text-sm text-zinc-400">
                    {pendingPlacement ? <>Placed at <span className="text-white">{pendingPlacement.x}%, {pendingPlacement.y}%</span></> : 'Click the map to place.'}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveNewSpot} disabled={isSavingNewSpot} className={`${buttonClass} ${isSavingNewSpot ? 'cursor-not-allowed opacity-70' : ''}`}>
                      {isSavingNewSpot ? 'Saving...' : 'Save Spot'}
                    </button>
                    <button onClick={() => { revokeUrls(newSpot.images); setPendingPlacement(null); setShowAddSpot(false); resetNewSpotState() }} className={softButtonClass}>Cancel</button>
                  </div>
                </div>
              )}

              {/* ── Spot list */}
              <div ref={spotListRef} className="space-y-3 overflow-y-auto max-h-[72vh]">
                {sortedSpots.length === 0 && !showAddSpot && (
                  <div className="rounded-[22px] border border-dashed border-emerald-400/8 bg-emerald-950/18 p-4 text-sm text-zinc-500">
                    No spots match the current filters.
                  </div>
                )}
                {sortedSpots.map((spot) => {
                  const isSelected  = selectedSpot?.id === spot.id
                  const sd          = getSideClasses(spot.side)
                  const primaryRole = spot.roles?.[0] || spot.role || 'MG'
                  const listSize    = Math.max(8, getRenderedSpotSize(spot))

                  return (
                    <div
                      key={spot.id}
                      ref={(el) => { if (el) spotItemRefs.current.set(spot.id, el); else spotItemRefs.current.delete(spot.id) }}
                      className={`group rounded-[18px] border cursor-pointer transition-all duration-300 ${
                        isSelected && isDrawerOpen
                          ? 'border-emerald-300/40 bg-[linear-gradient(180deg,rgba(25,78,48,0.34),rgba(11,33,19,0.92))] shadow-[0_0_0_1px_rgba(52,211,153,0.16),0_14px_26px_rgba(0,0,0,0.18)]'
                          : 'border-emerald-400/8 bg-[linear-gradient(180deg,rgba(10,41,24,0.62),rgba(8,24,14,0.88))] hover:border-emerald-300/15 hover:bg-[linear-gradient(180deg,rgba(16,56,33,0.76),rgba(9,28,16,0.94))]'
                      } ${spot.pending ? 'opacity-75' : ''}`}
                      onClick={() => {
                        if (isSelected && isDrawerOpen) {
                          setSelectedSpot(null)
                          setIsDrawerOpen(false)
                          const url = new URL(window.location.href)
                          url.searchParams.delete('spot')
                          window.history.replaceState(null, '', url.toString())
                        } else {
                          selectSpot(spot)
                        }
                      }}
                    >
                      <div className="flex items-start gap-3.5 p-4">
                        <div className="relative mt-0.5 flex-shrink-0">
                          <span className={`absolute inset-0 rounded-2xl blur-md opacity-40 ${spot.pending ? 'bg-emerald-400/60' : sd.glow}`} />
                          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-black/18 shadow-inner">
                            <ShapeMarker
                              shape={getRoleShape(primaryRole)}
                              sideClass={spot.pending ? 'bg-emerald-500/90' : sd.marker}
                              borderClass={spot.pending ? 'border-emerald-200' : sd.border}
                              icon={getRoleIcon(primaryRole)}
                              size={Math.max(16, listSize + 2)}
                              isActive={isSelected && isDrawerOpen}
                            />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <div className={`truncate text-sm font-semibold leading-tight ${isSelected && isDrawerOpen ? 'text-white' : 'text-zinc-200 group-hover:text-white'}`}>
                              {spot.title || 'Untitled Spot'}
                            </div>
                            {spot.pending && (
                              <span className="mt-0.5 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-100">New</span>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-100/60">
                            <span className="truncate">{primaryRole}</span>
                            {(spot.roles?.length || 0) > 1 && (<><span className="text-emerald-100/30">•</span><span>+{(spot.roles?.length || 0) - 1} more</span></>)}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <span className={`${sd.badge} px-2 py-0.5 text-[11px] font-medium`}>{spot.side}</span>
                            {spot.verified && <span className="rounded-full border border-emerald-300/16 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100/90">Verified</span>}
                            {spot.requiresBuildable && <span className="rounded-full border border-amber-300/18 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100/90">Buildable</span>}
                            {(spot.cones?.Axis || spot.cones?.Allies || spot.fireLines?.Axis || spot.fireLines?.Allies || (spot.routes?.length || 0) > 0) && (
                              <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300/90">Intel</span>
                            )}
                          </div>
                        </div>
                        <div className="pt-0.5 text-zinc-500 transition group-hover:text-emerald-100/70">
                          <span className="text-sm">{isSelected && isDrawerOpen ? '•' : '›'}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* ── Undo delete toast */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-[rgba(20,5,5,0.95)] px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl"
          style={{ animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
          <style>{`@keyframes slideUp { from { opacity:0; transform: translate(-50%, 16px); } to { opacity:1; transform: translate(-50%, 0); } }`}</style>
          <span className="text-sm text-zinc-200">
            <span className="font-medium text-white">"{undoToast.spot.title}"</span> deleted
          </span>
          <button onClick={undoDelete}
            className="rounded-xl border border-emerald-400/40 bg-emerald-600/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition">
            Undo
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxImages[lightboxIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={closeLightbox}>
          <div className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}>
            {lightboxImages.length > 1 && (
              <button
                onClick={showPrevLightboxImage}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-lg text-white hover:bg-black/90"
                aria-label="Previous image"
              >
                ‹
              </button>
            )}

            <button
              onClick={closeLightbox}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-3 py-1 text-sm text-white hover:bg-black/90"
            >
              ✕
            </button>

            <img src={lightboxImages[lightboxIndex]} alt="Enlarged"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain" />

            {lightboxImages.length > 1 && (
              <button
                onClick={showNextLightboxImage}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-lg text-white hover:bg-black/90"
                aria-label="Next image"
              >
                ›
              </button>
            )}

            {lightboxImages.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                {lightboxIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function IntelMap() {
  return (
    <React.Suspense fallback={null}>
      <IntelMapInner />
    </React.Suspense>
  )
}
