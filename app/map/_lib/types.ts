// app/map/_lib/types.ts

export type SpotSide = 'Axis' | 'Allies' | 'Both'
export type MarkerShape = 'circle' | 'square' | 'triangle'
export type ConeSide = 'Axis' | 'Allies'
export type SpotSideFilter = 'both' | 'axis' | 'allies'
export type MapOrientation = 'horizontal' | 'vertical'
export type PlacementMode = null | 'cone_first' | 'cone_second' | 'line_end'

export type SpotCone = {
  angle: number
  spread: number
  length: number
}

export type SpotConeSet = {
  Axis?: SpotCone | null
  Allies?: SpotCone | null
}

export type SpotLine = {
  endX: number
  endY: number
  midpoint: string
}

export type SpotLineSet = {
  Axis?: SpotLine | null
  Allies?: SpotLine | null
}

export type RoutePoint = {
  x: number
  y: number
}

export type SpotRoute = {
  id: string
  points: RoutePoint[]
  color: string
  label: string
  strokeWidth: number
  side: ConeSide
  midpoint: string
  youtube?: string | null
}

export type Spot = {
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
  requiresBuildable: boolean
  verified: boolean
  patchVersion: string
  createdBy?: string | null
  createdByName?: string | null
  lastEditedBy?: string | null
  lastEditedByName?: string | null
  lastEditedAt?: string | null
  cones?: SpotConeSet | null
  fireLines?: SpotLineSet | null
  routes?: SpotRoute[]
  created_at?: string
  pending?: boolean
}

export type MapData = {
  id: string
  name: string
  image: string
  overlay?: string | null
  elevation?: string | null
  midpoints: string[]
  spots: Spot[]
}

export type SpotComment = {
  id: number
  spot_id: number
  user_id: string
  user_name: string
  content: string
  created_at: string
}
