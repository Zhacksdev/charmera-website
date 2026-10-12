// Filter foto pilihan tamu di Preview. Hasil akhir dirender booth-api (services/photo-filter.ts);
// nilai CSS di sini padanan visualnya untuk pratinjau instan di tablet.
export type PhotoFilter = 'none' | 'bw' | 'vintage' | 'sepia' | 'smooth'

export const PHOTO_FILTER_OPTIONS: Array<{ id: PhotoFilter; label: string; css: string }> = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'bw', label: 'Black & White', css: 'grayscale(1)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(0.9) saturate(0.85) brightness(1.03)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(1)' },
  // shiny: lebih terang & hidup dengan sedikit kilau (render memakai glow), bukan blur
  { id: 'smooth', label: 'Smooth', css: 'brightness(1.1) saturate(1.15) contrast(1.03)' },
]

export function filterCss(filter: PhotoFilter): string {
  return PHOTO_FILTER_OPTIONS.find((option) => option.id === filter)?.css || 'none'
}
