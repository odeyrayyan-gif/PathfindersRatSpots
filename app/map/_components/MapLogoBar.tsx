'use client'

import Link from 'next/link'
import React from 'react'

export function MapLogoBar({
  logoBarRef,
}: {
  logoBarRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={logoBarRef}
      className="sticky top-0 z-40 mb-4 overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(12,45,22,0.92),rgba(8,20,12,0.88))] shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between px-4 py-3 md:py-4">
        <Link
          href="/"
          className="rounded-xl border border-emerald-300/15 bg-emerald-900/30 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-emerald-800/50 hover:text-white"
        >
          ← Home
        </Link>
        <img
          src="/pathfinders-logo.png"
          alt="Pathfinders"
          className="max-h-[55px] w-auto object-contain md:max-h-[75px]"
        />
        <div className="w-[60px]" />
      </div>
    </div>
  )
}
