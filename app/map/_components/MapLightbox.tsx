'use client'

export function MapLightbox({
  images,
  index,
  onClose,
  onPrevious,
  onNext,
}: {
  images: string[]
  index: number | null
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}) {
  if (index === null || !images[index]) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 && (
          <button
            onClick={onPrevious}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-lg text-white hover:bg-black/90"
            aria-label="Previous image"
          >
            ‹
          </button>
        )}

        <button
          onClick={onClose}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-3 py-1 text-sm text-white hover:bg-black/90"
          aria-label="Close image viewer"
        >
          ✕
        </button>

        <img
          src={images[index]}
          alt="Enlarged"
          className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
        />

        {images.length > 1 && (
          <button
            onClick={onNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 px-3 py-2 text-lg text-white hover:bg-black/90"
            aria-label="Next image"
          >
            ›
          </button>
        )}

        {images.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
            {index + 1} / {images.length}
          </div>
        )}
      </div>
    </div>
  )
}
