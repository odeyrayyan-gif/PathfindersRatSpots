'use client'

import React from 'react'

export function useMapLightbox() {
  const [lightboxImages, setLightboxImages] = React.useState<string[]>([])
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)

  const openLightbox = React.useCallback((images: string[], startIndex: number) => {
    if (!images.length) return
    const safeIndex = Math.max(0, Math.min(startIndex, images.length - 1))
    setLightboxImages(images)
    setLightboxIndex(safeIndex)
  }, [])

  const closeLightbox = React.useCallback(() => {
    setLightboxIndex(null)
    setLightboxImages([])
  }, [])

  const showPrevLightboxImage = React.useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null || lightboxImages.length === 0) return prev
      return prev === 0 ? lightboxImages.length - 1 : prev - 1
    })
  }, [lightboxImages.length])

  const showNextLightboxImage = React.useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null || lightboxImages.length === 0) return prev
      return prev === lightboxImages.length - 1 ? 0 : prev + 1
    })
  }, [lightboxImages.length])

  React.useEffect(() => {
    if (lightboxIndex === null) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') showPrevLightboxImage()
      if (e.key === 'ArrowRight') showNextLightboxImage()
      if (e.key === 'Escape') closeLightbox()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeLightbox, lightboxIndex, showNextLightboxImage, showPrevLightboxImage])

  return {
    lightboxImages,
    lightboxIndex,
    openLightbox,
    closeLightbox,
    showPrevLightboxImage,
    showNextLightboxImage,
  }
}
