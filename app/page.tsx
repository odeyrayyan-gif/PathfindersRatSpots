'use client'

import React from 'react'
import { supabase } from '@/lib/supabase'

type SpotSide = 'Axis' | 'Allies' | 'Both'
type RightTab = 'list' | 'details'
type MarkerShape = 'circle' | 'square' | 'triangle'

type Spot = {
  id: number
  map_id: string
  title: string
  role: string
  side: SpotSide
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

function getSideClasses(side: SpotSide) {
  if (side === 'Axis') {
    return {
      marker: 'bg-red-600/95',
      glow: 'bg-red-500',
      badge: 'bg-red-700/90 text-white border border-red-300/40',
      border: 'border-red-300',
    }
  }

  if (side === 'Allies') {
    return {
      marker: 'bg-blue-600/95',
      glow: 'bg-blue-500',
      badge: 'bg-blue-700/90 text-white border border-blue-300/40',
      border: 'border-blue-300',
    }
  }

  return {
    marker: 'bg-violet-600/95',
    glow: 'bg-violet-500',
    badge: 'bg-violet-700/90 text-white border border-violet-300/40',
    border: 'border-violet-300',
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

function normalizeSpot(raw: any): Spot {
  return {
    id: raw.id,
    map_id: raw.map_id,
    title: raw.title ?? '',
    role: raw.role ?? 'MG',
    side: normalizeSide(raw.side),
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    notes: raw.notes ?? '',
    youtube: raw.youtube ?? null,
    images: Array.isArray(raw.images) ? raw.images : [],
    size: Number(raw.size ?? 20),
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
          const target = e.currentTarget
          target.style.display = 'none'
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
        <MarkerIcon icon={icon} sizePx={Math.max(8, Math.round(size * 0.5))} />
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
          style={{
            clipPath: 'polygon(50% 6%, 8% 92%, 92% 92%)',
          }}
        >
          <span className={`absolute inset-0 ${sideClass}`} />
          <span
            className={`absolute inset-0 border-2 ${borderClass}`}
            style={{ clipPath: 'polygon(50% 6%, 8% 92%, 92% 92%)' }}
          />
        </span>
        <span className="relative mt-1">
          <MarkerIcon icon={icon} sizePx={Math.max(8, Math.round(size * 0.42))} />
        </span>
      </span>
    )
  }

  return (
    <span
      className={`${common} rounded-full`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <MarkerIcon icon={icon} sizePx={Math.max(8, Math.round(size * 0.5))} />
    </span>
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
  const [showAddSpot, setShowAddSpot] = React.useState(false)

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

  const [newSpot, setNewSpot] = React.useState({
    title: '',
    role: 'MG',
    side: 'Both' as SpotSide,
    notes: '',
    youtube: '',
    images: [] as string[],
    imageFiles: [] as File[],
    size: 20,
  })

  const [editSpot, setEditSpot] = React.useState({
    title: '',
    role: 'MG',
    side: 'Both' as SpotSide,
    notes: '',
    youtube: '',
    size: 20,
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

  const filteredSpots = currentSpots.filter((spot) => {
    const roleMatch = roleFilter === 'All' || spot.role === roleFilter
    const search = searchTerm.trim().toLowerCase()

    const textMatch =
      search === '' ||
      spot.title.toLowerCase().includes(search) ||
      spot.role.toLowerCase().includes(search) ||
      spot.notes.toLowerCase().includes(search) ||
      spot.side.toLowerCase().includes(search)

    return roleMatch && textMatch
  })

  const sortedSpots = [...filteredSpots].sort((a, b) => {
    if (sortMode === 'role') {
      const roleCompare = a.role.localeCompare(b.role)
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
    setEditingSpotId(null)
    setRightTab('list')
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
  }, [scale, clampPosition])

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

    const remainingSlots = 3 - newSpot.imageFiles.length
    const limitedFiles = files.slice(0, remainingSlots)

    const previewUrls = limitedFiles.map((file) => URL.createObjectURL(file))

    setNewSpot((prev) => ({
      ...prev,
      imageFiles: [...prev.imageFiles, ...limitedFiles],
      images: [...prev.images, ...previewUrls],
    }))

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeNewSpotImage = (index: number) => {
    setNewSpot((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
      imageFiles: prev.imageFiles.filter((_, i) => i !== index),
    }))
  }

  const uploadSpotImage = async (file: File) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`

    const { error } = await supabase.storage
      .from('spot-images')
      .upload(safeName, file)

    if (error) {
      throw error
    }

    const { data } = supabase.storage
      .from('spot-images')
      .getPublicUrl(safeName)

    return data.publicUrl
  }

  const saveNewSpot = async () => {
    if (!pendingPlacement) {
      alert('Click on the map first to place the spot.')
      return
    }

    if (!newSpot.title.trim()) {
      alert('Enter a title before saving.')
      return
    }

    if (!newSpot.role.trim()) {
      alert('Choose a role before saving.')
      return
    }

    if (!selectedMapId) {
      alert('No map selected.')
      return
    }

    try {
      const uploadedImageUrls = await Promise.all(
        newSpot.imageFiles.map((file) => uploadSpotImage(file))
      )

      const payload = {
        map_id: selectedMapId,
        title: newSpot.title.trim(),
        role: newSpot.role,
        side: newSpot.side,
        notes: newSpot.notes.trim(),
        youtube: newSpot.youtube.trim() || null,
        images: uploadedImageUrls,
        x: pendingPlacement.x,
        y: pendingPlacement.y,
        size: newSpot.size,
      }

      const { error } = await supabase.from('spots').insert(payload)

      if (error) {
        console.error('Error saving spot:', JSON.stringify(error, null, 2))
        alert(`Error saving spot: ${error.message || 'Unknown error'}`)
        return
      }

      setShowAddSpot(false)
      setPendingPlacement(null)
      setRightTab('details')
      setNewSpot({
        title: '',
        role: 'MG',
        side: 'Both',
        notes: '',
        youtube: '',
        images: [],
        imageFiles: [],
        size: 20,
      })

      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      console.error('Upload/save failure:', err)
      alert(err?.message || 'Failed to upload image or save spot.')
    }
  }

  const startEditingSpot = () => {
    if (!selectedSpot) return
    setEditingSpotId(selectedSpot.id)
    setEditSpot({
      title: selectedSpot.title,
      role: selectedSpot.role,
      side: selectedSpot.side,
      notes: selectedSpot.notes,
      youtube: selectedSpot.youtube || '',
      size: selectedSpot.size,
    })
    setRightTab('details')
  }

  const saveEditedSpot = async () => {
    if (!selectedSpot) return

    const { error } = await supabase
      .from('spots')
      .update({
        title: editSpot.title.trim(),
        role: editSpot.role,
        side: editSpot.side,
        notes: editSpot.notes.trim(),
        youtube: editSpot.youtube.trim() || null,
        size: editSpot.size,
      })
      .eq('id', selectedSpot.id)

    if (error) {
      console.error('Error updating spot:', error)
      return
    }

    setEditingSpotId(null)
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

  const openAddSpot = () => {
    setShowAddSpot((prev) => !prev)
    setEditingSpotId(null)
    setRightTab('details')
    setPendingPlacement(null)
  }

  const selectSpot = (spot: Spot) => {
    setSelectedSpot(spot)
    setShowAddSpot(false)
    setEditingSpotId(null)
    setRightTab('details')
  }

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

        <div className="sticky top-[94px] z-30 mb-4 grid gap-3 rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl md:grid-cols-2 xl:grid-cols-6">
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
                      const sideStyles = getSideClasses(spot.side)

                      return (
                        <button
                          key={spot.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            selectSpot(spot)
                          }}
                          className="group absolute -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                          aria-label={spot.title}
                        >
                          <span
                            className={`absolute inset-0 blur-sm opacity-70 ${sideStyles.glow} ${
                              getRoleShape(spot.role) === 'circle'
                                ? 'rounded-full'
                                : getRoleShape(spot.role) === 'square'
                                ? 'rounded-[6px]'
                                : ''
                            }`}
                            style={{
                              width: outerSize,
                              height: outerSize,
                              clipPath:
                                getRoleShape(spot.role) === 'triangle'
                                  ? 'polygon(50% 6%, 8% 92%, 92% 92%)'
                                  : undefined,
                            }}
                          />
                          <ShapeMarker
                            shape={getRoleShape(spot.role)}
                            sideClass={sideStyles.marker}
                            borderClass={sideStyles.border}
                            icon={getRoleIcon(spot.role)}
                            size={spot.size}
                            isActive={isActive}
                          />
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
                        <ShapeMarker
                          shape={getRoleShape(newSpot.role)}
                          sideClass="bg-emerald-600/90"
                          borderClass="border-emerald-300"
                          icon={getRoleIcon(newSpot.role)}
                          size={newSpot.size}
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
                  {rightTab === 'list'
                    ? `${sortedSpots.length} Spots`
                    : showAddSpot
                    ? 'New Spot'
                    : editingSpotId
                    ? 'Editing'
                    : selectedSpot
                    ? 'Selected'
                    : 'Idle'}
                </span>
              </div>

              {rightTab === 'list' ? (
                <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                  {sortedSpots.length > 0 ? (
                    sortedSpots.map((spot) => {
                      const sideStyles = getSideClasses(spot.side)

                      return (
                        <button
                          key={spot.id}
                          onClick={() => selectSpot(spot)}
                          className={`w-full rounded-[22px] border p-3 text-left transition ${
                            selectedSpot?.id === spot.id
                              ? 'border-emerald-300/35 bg-emerald-500/10'
                              : 'border-emerald-400/8 bg-emerald-950/18 hover:bg-emerald-900/30'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center">
                              <ShapeMarker
                                shape={getRoleShape(spot.role)}
                                sideClass={sideStyles.marker}
                                borderClass={sideStyles.border}
                                icon={getRoleIcon(spot.role)}
                                size={24}
                                isActive={selectedSpot?.id === spot.id}
                              />
                            </span>
                            <span className="font-medium text-white">{spot.title}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            <span>{spot.role}</span>
                            <span>•</span>
                            <span>{spot.side}</span>
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

                  <select
                    value={newSpot.role}
                    onChange={(e) =>
                      setNewSpot((prev) => ({ ...prev, role: e.target.value }))
                    }
                    className={inputClass}
                  >
                    {roleNames.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>

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
                        min="18"
                        max="34"
                        value={newSpot.size}
                        onChange={(e) =>
                          setNewSpot((prev) => ({
                            ...prev,
                            size: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                      <span className="w-8 text-xs text-zinc-300">{newSpot.size}</span>
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
                    <button onClick={saveNewSpot} className={buttonClass}>
                      Save Spot
                    </button>
                    <button
                      onClick={() => {
                        setPendingPlacement(null)
                        setShowAddSpot(false)
                        setNewSpot((prev) => ({
                          ...prev,
                          images: [],
                          imageFiles: [],
                          size: 20,
                          side: 'Both',
                        }))
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

                  <select
                    value={editSpot.role}
                    onChange={(e) =>
                      setEditSpot((prev) => ({ ...prev, role: e.target.value }))
                    }
                    className={inputClass}
                  >
                    {roleNames.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>

                  <select
                    value={editSpot.side}
                    onChange={(e) =>
                      setEditSpot((prev) => ({
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
                      Spot Size
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                      <input
                        type="range"
                        min="18"
                        max="34"
                        value={editSpot.size}
                        onChange={(e) =>
                          setEditSpot((prev) => ({
                            ...prev,
                            size: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                      <span className="w-8 text-xs text-zinc-300">{editSpot.size}</span>
                    </div>
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
                    <button onClick={() => setEditingSpotId(null)} className={softButtonClass}>
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
                    <span
                      className={`rounded-full px-3 py-1 text-white ${getRoleColor(
                        selectedSpot.role
                      )}`}
                    >
                      {selectedSpot.role}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 ${getSideClasses(
                        selectedSpot.side
                      ).badge}`}
                    >
                      {selectedSpot.side}
                    </span>

                    <span className="inline-flex items-center rounded-full bg-emerald-900/45 px-3 py-1 text-white normal-case tracking-normal">
                      <MarkerIcon icon={getRoleIcon(selectedSpot.role)} sizePx={16} />
                    </span>
                  </div>

                  <h3 className="mt-4 text-2xl font-bold text-white">{selectedSpot.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">
                    {selectedSpot.notes}
                  </p>

                  <div className="mt-4">
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                      Selected Spot Size
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/10 bg-emerald-950/25 px-3 py-2">
                      <input
                        type="range"
                        min="18"
                        max="34"
                        value={selectedSpot.size}
                        onChange={(e) =>
                          updateSelectedSpotSize(Number(e.target.value))
                        }
                        className="w-full accent-emerald-500"
                      />
                      <span className="w-8 text-xs text-zinc-300">{selectedSpot.size}</span>
                    </div>
                  </div>

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
                    <button onClick={startEditingSpot} className={softButtonClass}>
                      Edit Spot
                    </button>

                    <button
                      onClick={deleteSelectedSpot}
                      className="inline-flex w-fit items-center rounded-2xl border border-red-700 bg-red-900/60 px-4 py-2 text-sm font-medium hover:bg-red-800/70"
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