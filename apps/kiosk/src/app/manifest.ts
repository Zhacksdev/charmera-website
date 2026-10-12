import type { MetadataRoute } from 'next'

// "Add to Home Screen" di tablet membuka kiosk tanpa address bar browser
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chamera Photobooth',
    short_name: 'Chamera',
    start_url: '/',
    display: 'fullscreen',
    background_color: '#D62839',
    theme_color: '#D62839',
    icons: [{ src: '/logo.png', sizes: 'any', type: 'image/png' }]
  }
}
