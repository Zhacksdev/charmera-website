'use client'

import type { ReactNode } from 'react'
import type { Frame } from '../stores/kioskStore'
import { frameImageUrl, shotIndexOf } from '../lib/frame-layout'

type FrameSlot = Frame['layout']['slots'][number]

/**
 * Tampilan frame persis seperti hasil render: isi slot (foto/video/placeholder) di bawah,
 * PNG frame asli di atas, lalu custom text di text_area. Koordinat memakai persen kanvas.
 */
export function FrameComposite({
  frame,
  renderSlot,
  customText,
  className = '',
}: {
  frame: Frame
  renderSlot: (shotIndex: number, slot: FrameSlot) => ReactNode
  customText?: string
  className?: string
}) {
  const canvas = frame.layout?.canvas || { w: frame.canvas_w, h: frame.canvas_h }
  const slots = frame.layout?.slots || []
  const textArea = frame.layout?.text_area

  return (
    <div className={`frame-composite ${className}`} style={{ aspectRatio: `${canvas.w}/${canvas.h}` }}>
      {slots.map((slot, index) => (
        <div
          key={`${slot.n}-${index}`}
          className="frame-composite-slot"
          style={{
            left: `${slot.x / canvas.w * 100}%`,
            top: `${slot.y / canvas.h * 100}%`,
            width: `${slot.w / canvas.w * 100}%`,
            height: `${slot.h / canvas.h * 100}%`,
          }}
        >
          {renderSlot(shotIndexOf(slots, slot), slot)}
        </div>
      ))}
      <img src={frameImageUrl(frame)} alt="" className="frame-composite-overlay" draggable={false} />
      {customText && textArea && (
        // viewBox = kanvas frame, jadi ukuran & posisi teks sama dengan strip hasil render
        <svg className="frame-composite-overlay" viewBox={`0 0 ${canvas.w} ${canvas.h}`} aria-hidden="true">
          <text
            x={textArea.x + textArea.w / 2}
            y={textArea.y + textArea.h / 2}
            fontFamily="Nunito, sans-serif"
            fontSize={32}
            fill="#26211F"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {customText}
          </text>
        </svg>
      )}
    </div>
  )
}
