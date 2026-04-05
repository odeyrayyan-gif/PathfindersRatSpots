'use client'

import React from 'react'
import type { SpotCone, SpotRoute, RoutePoint, ConeSide } from '../_lib/types'
import { getSideClasses } from '../_lib/helpers'

export function ConeShape({
  cx,
  cy,
  cone,
  side,
  preview = false,
}: {
  cx: number
  cy: number
  cone: SpotCone
  side: ConeSide
  preview?: boolean
}) {
  const styles = getSideClasses(side)
  const r = cone.length
  const startRad = (cone.angle - cone.spread / 2) * (Math.PI / 180)
  const endRad = (cone.angle + cone.spread / 2) * (Math.PI / 180)
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  const largeArc = cone.spread > 180 ? 1 : 0
  const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

  const labelRad = cone.angle * (Math.PI / 180)
  const lx = cx + r * Math.cos(labelRad)
  const ly = cy + r * Math.sin(labelRad)
  const distM = Math.round(cone.length * 20)

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
        <text
          x={lx}
          y={ly + 0.4}
          textAnchor="middle"
          fontSize={0.8}
          fill="rgba(0,0,0,0.85)"
          fontWeight="700"
          style={{ userSelect: 'none' }}
        >
          {distM}m
        </text>
      )}
    </g>
  )
}

export function SnipeLineShape({
  startX,
  startY,
  endX,
  endY,
  side,
  distanceM,
  outOfRange,
  oob,
  preview = false,
}: {
  startX: number
  startY: number
  endX: number
  endY: number
  side: ConeSide
  distanceM: number
  outOfRange: boolean
  oob: boolean
  preview?: boolean
}) {
  const styles = getSideClasses(side)
  const lineColor = (outOfRange || oob) ? 'rgba(245,158,11,0.95)' : styles.lineStroke
  const midX = (startX + endX) / 2
  const midY = (startY + endY) / 2
  const label = `${distanceM}m${oob ? ' OOB' : outOfRange ? ' OUT' : ''}`

  return (
    <g>
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={lineColor}
        strokeWidth={1.5}
        strokeDasharray={preview ? '1.5 0.8' : undefined}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={startX} cy={startY} r={0.25} fill="rgba(255,255,255,0.90)" />
      {!preview && (
        <text
          x={endX}
          y={endY + 0.7}
          textAnchor="middle"
          fontSize={1.2}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          💥
        </text>
      )}
      <text
        x={midX}
        y={midY - 0.4}
        textAnchor="middle"
        fontSize={0.8}
        fill={(outOfRange || oob) ? 'rgba(180,80,0,0.9)' : 'rgba(0,0,0,0.85)'}
        fontWeight="700"
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  )
}

export function RouteShape({
  route,
  preview = false,
  previewPoints,
}: {
  route?: SpotRoute
  preview?: boolean
  previewPoints?: RoutePoint[]
}) {
  const pts = preview ? (previewPoints || []) : (route?.points || [])
  if (pts.length < 2) return null

  const color = preview ? 'rgba(255,255,255,0.85)' : (route?.color || '#22c55e')
  const strokeWidth = preview ? 3 : (route?.strokeWidth || 4)
  const label = route?.label
  const ptsStr = pts.map((p) => `${p.x},${p.y}`).join(' ')

  const last = pts[pts.length - 1]
  const refIdx = Math.max(0, pts.length - Math.min(8, Math.ceil(pts.length * 0.15) + 2))
  const ref = pts[refIdx]
  const ang = Math.atan2(last.y - ref.y, last.x - ref.x)
  const as = 1.2
  const ax1 = last.x - as * Math.cos(ang - Math.PI / 6)
  const ay1 = last.y - as * Math.sin(ang - Math.PI / 6)
  const ax2 = last.x - as * Math.cos(ang + Math.PI / 6)
  const ay2 = last.y - as * Math.sin(ang + Math.PI / 6)

  const mid = pts[Math.floor(pts.length / 2)]

  return (
    <g opacity={preview ? 0.75 : 1}>
      <polyline
        points={ptsStr}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={preview ? '2 1' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <polygon points={`${last.x},${last.y} ${ax1},${ay1} ${ax2},${ay2}`} fill={color} />
      {!preview && label && (
        <text
          x={mid.x}
          y={mid.y - 0.3}
          textAnchor="middle"
          fontSize={0.8}
          fill="rgba(0,0,0,0.85)"
          fontWeight="700"
          style={{ userSelect: 'none' }}
        >
          {label}
        </text>
      )}
    </g>
  )
}