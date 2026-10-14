'use client'

/** Header semua tahap sesi: judul di tengah, sisa waktu tahap di kanan atas (posisi sama di tiap halaman). */
export function StageHeader({ title, remainingSec }: { title: string; remainingSec: number }) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] items-center gap-2 md:gap-3">
      <div />
      <h1 className="stage-title text-center font-extrabold text-cream">{title}</h1>
      <div className="timer-pill justify-self-end" role="timer" aria-label="Sisa waktu">{formatTimer(remainingSec)}</div>
    </header>
  )
}

export function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}.${String(safe % 60).padStart(2, '0')}`
}
