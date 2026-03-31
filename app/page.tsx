'use client'
import React from 'react'
import { supabase } from '@/lib/supabase'

type Spot = {
  id: number
  map_id: string
  title: string
  role: string
  x: number
  y: number
  notes: string
  youtube?: string | null
  images?: string[]
  size: number
  created_at?: string
}

type MapData = {
  id: string
  name: string
  image: string
  overlay?: string | null
  spots: Spot[]
}

const defaultRoleColors: Record<string, string> = {
  MG: 'bg-red-500',
  Infantry: 'bg-green-500',
  Tank: 'bg-yellow-500',
  Sniper: 'bg-purple-500',
}

const fallbackColorClasses = [
  'bg-sky-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-fuchsia-500',
  'bg-amber-500',
]

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

function normalizeSpot(raw: any): Spot {
  return {
    id: raw.id,
    map_id: raw.map_id,
    title: raw.title ?? '',
    role: raw.role ?? 'MG',
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    notes: raw.notes ?? '',
    youtube: raw.youtube ?? null,
    images: Array.isArray(raw.images) ? raw.images : [],
    size: Number(raw.size ?? 14),
    created_at: raw.created_at,
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

export default function IntelMap() {
  const [roles, setRoles] = React.useState<string[]>([
    'MG',
    'Infantry',
    'Tank',
    'Sniper',
  ])

  const [roleColors, setRoleColors] =
    React.useState<Record<string, string>>(defaultRoleColors)

  const [maps, setMaps] = React.useState<MapData[]>([])
  const [selectedMapId, setSelectedMapId] = React.useState<string>('utah')
  const [selectedSpot, setSelectedSpot] = React.useState<Spot | null>(null)

  const [roleFilter, setRoleFilter] = React.useState<string>('All')
  const [sortMode, setSortMode] = React.useState<'alphabetical' | 'role'>(
    'alphabetical'
  )
  const [searchTerm, setSearchTerm] = React.useState('')
  const [showSpotList, setShowSpotList] = React.useState(true)
  const [showSpotCard, setShowSpotCard] = React.useState(true)

  const [scale, setScale] = React.useState(1)
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)

  const [showSatellite, setShowSatellite] = React.useState(false)
  const [overlayOpacity, setOverlayOpacity] = React.useState(55)
  const [overlayBroken, setOverlayBroken] = React.useState<Record<string, boolean>>({})

  const [newRoleName, setNewRoleName] = React.useState('')
  const [showAddSpot, setShowAddSpot] = React.useState(false)
  const [pendingPlacement, setPendingPlacement] = React.useState<{
    x: number
    y: number
  } | null>(null)
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  const [newSpot, setNewSpot] = React.useState({
    title: '',
    role: 'MG',
    notes: '',
    youtube: '',
    images: [] as string[],
    size: 14,
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

  const filteredSpots = currentSpots.filter((spot) => {
    const roleMatch = roleFilter === 'All' || spot.role === roleFilter
    const search = searchTerm.trim().toLowerCase()

    const textMatch =
      search === '' ||
      spot.title.toLowerCase().includes(search) ||
      spot.role.toLowerCase().includes(search) ||
      spot.notes.toLowerCase().includes(search)

    return roleMatch && textMatch
  })

  const sortedSpots = [...filteredSpots].sort((a, b) => {
    if (sortMode === 'role') {
      const roleCompare = a.role.localeCompare(b.role)
      if (roleCompare !== 0) return roleCompare
    }
    return a.title.localeCompare(b.title)
  })

  const getRoleColor = (role: string) => {
    if (roleColors[role]) return roleColors[role]
    return fallbackColorClasses[0]
  }

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

  React.useEffect(() => {
    async function loadData() {
      setIsLoading(true)

      const [{ data: mapsData, error: mapsError }, { data: spotsData, error: spotsError }] =
        await Promise.all([
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
            const incoming = normalizeSpot(payload.new)

            setMaps((prev) =>
              prev.map((map) =>
                map.id === incoming.map_id
                  ? { ...map, spots: [...map.spots, incoming] }
                  : map
              )
            )
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

            setMaps((prev) =>
              prev.map((map) => ({
                ...map,
                spots: map.spots.filter((spot) => spot.id !== deletedId),
              }))
            )

            setSelectedSpot((prev) =>
              prev && prev.id === deletedId ? null : prev
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  React.useEffect(() => {
    const currentMap = maps.find((map) => map.id === selectedMapId)

    setSelectedSpot((prev) => {
      if (!currentMap) return null
      if (prev && currentMap.spots.some((spot) => spot.id === prev.id)) {
        return currentMap.spots.find((spot) => spot.id === prev.id) || null
      }
      return currentMap.spots[0] || null
    })

    setSearchTerm('')
    setRoleFilter('All')
    setSortMode('alphabetical')
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setShowAddSpot(false)
    setPendingPlacement(null)
    setShowSatellite(false)
  }, [selectedMapId, maps])

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
  }, [])

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
    if (showAddSpot) return
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
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

  const addRole = () => {
    const trimmed = newRoleName.trim()
    if (!trimmed) return
    if (roles.includes(trimmed)) {
      setNewRoleName('')
      return
    }

    const nextColor =
      fallbackColorClasses[roles.length % fallbackColorClasses.length]

    setRoles((prev) => [...prev, trimmed])
    setRoleColors((prev) => ({ ...prev, [trimmed]: nextColor }))
    setNewRoleName('')
    setNewSpot((prev) => ({ ...prev, role: trimmed }))
  }

  const handleMapClickForPlacement = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!showAddSpot) return
    if (!viewportRef.current) return

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

    const clampedX = Math.max(0, Math.min(100, xPercent))
    const clampedY = Math.max(0, Math.min(100, yPercent))

    setPendingPlacement({
      x: Number(clampedX.toFixed(2)),
      y: Number(clampedY.toFixed(2)),
    })
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const remainingSlots = 3 - newSpot.images.length
    const limitedFiles = files.slice(0, remainingSlots)

    limitedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          setNewSpot((prev) => ({
            ...prev,
            images:
              prev.images.length < 3 ? [...prev.images, result] : prev.images,
          }))
        }
      }
      reader.readAsDataURL(file)
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeNewSpotImage = (index: number) => {
    setNewSpot((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }))
  }

  const saveNewSpot = async () => {
    if (!pendingPlacement) return
    if (!newSpot.title.trim()) return
    if (!newSpot.role.trim()) return
    if (!selectedMapId) return

    const payload = {
      map_id: selectedMapId,
      title: newSpot.title.trim(),
      role: newSpot.role,
      notes: newSpot.notes.trim(),
      youtube: newSpot.youtube.trim() || null,
      images: newSpot.images,
      x: pendingPlacement.x,
      y: pendingPlacement.y,
      size: newSpot.size,
    }

    const { error } = await supabase.from('spots').insert(payload)

    if (error) {
      console.error('Error saving spot:', error)
      return
    }

    setShowSpotCard(true)
    setShowAddSpot(false)
    setPendingPlacement(null)
    setNewSpot({
      title: '',
      role: roles[0] || 'MG',
      notes: '',
      youtube: '',
      images: [],
      size: 14,
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const deleteSelectedSpot = async () => {
    if (!selectedSpot) return

    const { error } = await supabase
      .from('spots')
      .delete()
      .eq('id', selectedSpot.id)

    if (error) {
      console.error('Error deleting spot:', error)
    }
  }

  const updateSelectedSpotSize = async (newSize: number) => {
    if (!selectedSpot) return

    setSelectedSpot((prev) => (prev ? { ...prev, size: newSize } : prev))

    const { error } = await supabase
      .from('spots')
      .update({ size: newSize })
      .eq('id', selectedSpot.id)

    if (error) {
      console.error('Error updating spot size:', error)
    }
  }

  const gridClass =
    showSpotList && showSpotCard
      ? 'xl:grid-cols-[1.65fr_220px_340px]'
      : showSpotList && !showSpotCard
      ? 'xl:grid-cols-[1.9fr_220px]'
      : !showSpotList && showSpotCard
      ? 'xl:grid-cols-[1.95fr_340px]'
      : 'xl:grid-cols-[1fr]'

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-white md:p-6">
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-zinc-400">
              Phase 1 Prototype
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
              Pathfinders RatSpots
            </h1>
          </div>

          <div className="flex gap-2">
            <a
              href="/admin"
              className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
            >
              Admin Panel
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
              Map
            </label>
            <select
              value={selectedMapId}
              onChange={(e) => setSelectedMapId(e.target.value)}
              className="w-56 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
            >
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
              Search Spots
            </label>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search bunker, flank, sniper..."
              className="w-64 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
              Role Filter
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
            >
              <option>All</option>
              {roles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
              Sort List
            </label>
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as 'alphabetical' | 'role')
              }
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="role">By Role</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
              New Role
            </label>
            <div className="flex gap-2">
              <input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Artillery"
                className="w-32 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={addRole}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
              >
                Add Role
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              setShowAddSpot((prev) => !prev)
              setShowSpotCard(true)
              setPendingPlacement(null)
            }}
            className={`rounded-xl border px-3 py-2 text-sm ${
              showAddSpot
                ? 'border-blue-500 bg-blue-600 hover:bg-blue-500'
                : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {showAddSpot ? 'Cancel Add Spot' : 'Add Spot'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {!showSpotList && (
            <button
              onClick={() => setShowSpotList(true)}
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
            >
              Show Spot List
            </button>
          )}

          {!showSpotCard && (
            <button
              onClick={() => setShowSpotCard(true)}
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
            >
              Show Spot Card
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 items-start gap-5 ${gridClass}`}>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-2xl">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {selectedMap?.name || (isLoading ? 'Loading maps...' : 'No map selected')}
              </h2>
              <p className="text-sm text-zinc-400">
                Scroll to zoom, drag to pan
                {showAddSpot ? ' • Click map to place a new spot' : ''}
                {hasSatellite && showSatellite ? ' • Satellite overlay active' : ''}
              </p>
            </div>

            <div className="flex min-w-[280px] flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!hasSatellite) return
                    setShowSatellite((prev) => !prev)
                  }}
                  disabled={!hasSatellite}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    hasSatellite
                      ? showSatellite
                        ? 'border-emerald-500 bg-emerald-600 hover:bg-emerald-500'
                        : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
                      : 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500'
                  }`}
                >
                  {hasSatellite
                    ? showSatellite
                      ? 'Satellite On'
                      : 'Satellite Off'
                    : 'No Satellite'}
                </button>

                <span className="text-xs text-zinc-500">
                  {filteredSpots.length} visible spot
                  {filteredSpots.length === 1 ? '' : 's'}
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
                  Satellite Opacity
                </label>
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                    hasSatellite && showSatellite
                      ? 'border-zinc-800 bg-zinc-900'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-500'
                  }`}
                >
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overlayOpacity}
                    disabled={!hasSatellite || !showSatellite}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="w-10 text-xs">{overlayOpacity}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={zoomIn}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
            >
              +
            </button>
            <button
              onClick={zoomOut}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
            >
              -
            </button>
            <button
              onClick={resetView}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
            >
              Reset
            </button>
            <span className="ml-2 text-xs text-zinc-500">
              Zoom: {scale.toFixed(1)}x
            </span>
          </div>

          <div
            ref={viewportRef}
            className="relative w-full select-none overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900"
            style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
            onMouseMove={handleMouseMove}
            onMouseUp={stopDragging}
            onMouseLeave={stopDragging}
          >
            <div className="relative mx-auto aspect-[4/3] w-full max-h-[72vh] bg-zinc-950">
              {selectedMap ? (
                <div
                  className={`absolute inset-0 ${
                    isDragging
                      ? 'cursor-grabbing'
                      : showAddSpot
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
                    const outerSize = `${spot.size}px`
                    const innerSize = `${Math.max(
                      4,
                      Math.round(spot.size * 0.42)
                    )}px`

                    return (
                      <button
                        key={spot.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedSpot(spot)
                          setShowSpotCard(true)
                        }}
                        className="group absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                        aria-label={spot.title}
                      >
                        <span
                          className={`absolute inset-0 rounded-full blur-sm opacity-70 ${getRoleColor(
                            spot.role
                          )}`}
                          style={{ width: outerSize, height: outerSize }}
                        />
                        <span
                          className={`relative flex items-center justify-center rounded-full border border-white/80 ${getRoleColor(
                            spot.role
                          )} ${isActive ? 'scale-125' : 'group-hover:scale-110'}`}
                          style={{ width: outerSize, height: outerSize }}
                        >
                          <span
                            className="rounded-full bg-white"
                            style={{ width: innerSize, height: innerSize }}
                          />
                        </span>
                      </button>
                    )
                  })}

                  {pendingPlacement && (
                    <div
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${pendingPlacement.x}%`,
                        top: `${pendingPlacement.y}%`,
                      }}
                    >
                      <div
                        className="rounded-full border border-white bg-blue-500/85 shadow-lg"
                        style={{
                          width: `${newSpot.size}px`,
                          height: `${newSpot.size}px`,
                        }}
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

        {showSpotList && (
          <div className="min-h-[420px] rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold">Spot List</h3>
              <button
                onClick={() => setShowSpotList(false)}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs hover:bg-zinc-700"
              >
                Hide
              </button>
            </div>

            <div className="max-h-[72vh] space-y-2 overflow-y-auto pr-1">
              {sortedSpots.length > 0 ? (
                sortedSpots.map((spot) => (
                  <button
                    key={spot.id}
                    onClick={() => {
                      setSelectedSpot(spot)
                      setShowSpotCard(true)
                    }}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selectedSpot?.id === spot.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block rounded-full ${getRoleColor(
                          spot.role
                        )}`}
                        style={{ width: '10px', height: '10px' }}
                      />
                      <span className="font-medium">{spot.title}</span>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
                      {spot.role}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-500">
                  No spots match the current search/filter.
                </div>
              )}
            </div>
          </div>
        )}

        {showSpotCard && (
          <div className="min-h-[420px] rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold">
                {showAddSpot ? 'Create New Spot' : 'Spot Details'}
              </h3>
              <button
                onClick={() => {
                  setShowSpotCard(false)
                  setShowAddSpot(false)
                }}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs hover:bg-zinc-700"
              >
                Hide
              </button>
            </div>

            {showAddSpot ? (
              <div className="flex h-full flex-col gap-3">
                <p className="text-sm text-zinc-400">
                  1. Click on the map to place the dot. 2. Fill out the intel
                  card. 3. Hit save.
                </p>

                <input
                  value={newSpot.title}
                  onChange={(e) =>
                    setNewSpot((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Spot title"
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
                />

                <select
                  value={newSpot.role}
                  onChange={(e) =>
                    setNewSpot((prev) => ({ ...prev, role: e.target.value }))
                  }
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
                >
                  {roles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
                    New Spot Dot Size
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                    <input
                      type="range"
                      min="8"
                      max="24"
                      value={newSpot.size}
                      onChange={(e) =>
                        setNewSpot((prev) => ({
                          ...prev,
                          size: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="w-8 text-xs text-zinc-400">
                      {newSpot.size}
                    </span>
                  </div>
                </div>

                <textarea
                  value={newSpot.notes}
                  onChange={(e) =>
                    setNewSpot((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Notes / purpose / cautions"
                  rows={4}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
                />

                <input
                  value={newSpot.youtube}
                  onChange={(e) =>
                    setNewSpot((prev) => ({ ...prev, youtube: e.target.value }))
                  }
                  placeholder="YouTube link"
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
                />

                <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <label className="text-sm text-zinc-300">
                    Upload up to 3 images
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-zinc-700"
                  />

                  <div className="grid grid-cols-3 gap-2">
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

                  <div className="text-xs text-zinc-500">
                    {newSpot.images.length}/3 images selected
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-400">
                  {pendingPlacement ? (
                    <>
                      Dot placed at:{' '}
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
                    className="rounded-xl border border-green-600 bg-green-700 px-4 py-2 text-sm hover:bg-green-600"
                  >
                    Save Spot
                  </button>
                  <button
                    onClick={() => {
                      setPendingPlacement(null)
                      setShowAddSpot(false)
                      setNewSpot((prev) => ({ ...prev, images: [], size: 14 }))
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
                  >
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
                      className="h-48 w-full cursor-pointer rounded-2xl border border-zinc-800 object-cover"
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
                  <div className="flex h-48 w-full items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 text-zinc-500">
                    No images
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400">
                  <span
                    className={`rounded-full px-3 py-1 text-white ${getRoleColor(
                      selectedSpot.role
                    )}`}
                  >
                    {selectedSpot.role}
                  </span>
                </div>

                <h3 className="mt-4 text-2xl font-bold">{selectedSpot.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {selectedSpot.notes}
                </p>

                <div className="mt-4">
                  <label className="mb-1 block text-xs uppercase tracking-widest text-zinc-500">
                    Selected Spot Dot Size
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                    <input
                      type="range"
                      min="8"
                      max="24"
                      value={selectedSpot.size}
                      onChange={(e) =>
                        updateSelectedSpotSize(Number(e.target.value))
                      }
                    />
                    <span className="w-8 text-xs text-zinc-400">
                      {selectedSpot.size}
                    </span>
                  </div>
                </div>

                {selectedSpotEmbedUrl && (
                  <div className="mt-5">
                    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
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
                    className="mt-3 inline-flex w-fit items-center rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
                  >
                    Open on YouTube
                  </a>
                )}

                <button
                  onClick={deleteSelectedSpot}
                  className="mt-4 inline-flex w-fit items-center rounded-2xl border border-red-700 bg-red-900/60 px-4 py-2 text-sm font-medium hover:bg-red-800/70"
                >
                  Delete Spot
                </button>

                <div className="mt-auto pt-6 text-xs leading-5 text-zinc-500">
                  Live database-backed spots are on. Realtime updates are active.
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center">
                <div>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-2xl">
                    🎯
                  </div>
                  <h3 className="text-xl font-semibold">Select a spot</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
                    Click a dot on the map or a name in the list.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
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