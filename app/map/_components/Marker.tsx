'use client'

import React from 'react'
import type { SpotSide } from '../_lib/types'
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
}: {
  x: number
  y: number
  size: number
  side: SpotSide
  icon?: string | null
  isActive?: boolean
  onClick?: () => void
}) {
  const sd = getSideClasses(side)

  return (
    <div
      onClick={onClick}
      className={`
        absolute cursor-pointer select-none
        flex items-center justify-center
        rounded-full
        ${sd.marker}
        ${isActive ? 'ring-2 ring-white' : ''}
        transition-all duration-150
      `}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}px`,
        height: `${size}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <MarkerIcon icon={icon} size={Math.max(10, size * 0.6)} />
    </div>
  )
}