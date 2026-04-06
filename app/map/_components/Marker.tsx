'use client'

import React from 'react'
import type { MarkerShape, SpotSide } from '../_lib/types'
import { parseIcon, getSideClasses } from '../_lib/helpers'

export function MarkerIcon({
  icon,
  size = 16,
}: {
  icon?: string | null
  size?: number
}) {
  const parsed = parseIcon(icon)

  if (parsed.type === 'image') {
    return (
      <img
        src={parsed.value}
        alt=""
        className="object-contain"
        style={{ width: size, height: size }}
      />
    )
  }

  return <span style={{ fontSize: size }}>{parsed.value}</span>
}

export function ShapeMarker({
  x,
  y,
  size,
  side,
  icon,
  isActive,
  onClick,
  shape = 'circle',
  sideClass,
  borderClass,
}: {
  x?: number
  y?: number
  size: number
  side?: SpotSide
  icon?: string | null
  isActive?: boolean
  onClick?: () => void
  shape?: MarkerShape
  sideClass?: string
  borderClass?: string
}) {
  const sd = getSideClasses(side ?? 'Both')
  const bgClass = sideClass ?? sd.marker
  const bdClass = borderClass ?? sd.border
  const shapeClass =
    shape === 'square'
      ? 'rounded-md'
      : shape === 'triangle'
      ? 'clip-path-triangle rounded-none'
      : 'rounded-full'

  const content = (
    <div
      onClick={onClick}
      className={[
        'flex items-center justify-center select-none border',
        bgClass,
        bdClass,
        shapeClass,
        isActive ? 'ring-2 ring-white' : '',
        onClick ? 'cursor-pointer' : '',
        'transition-all duration-150',
      ].join(' ')}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <MarkerIcon icon={icon} size={Math.max(10, size * 0.6)} />
    </div>
  )

  if (typeof x === 'number' && typeof y === 'number') {
    return (
      <div
        className="absolute"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {content}
      </div>
    )
  }

  return content
}
