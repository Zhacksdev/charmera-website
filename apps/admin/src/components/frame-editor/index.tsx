'use client'

import { useEffect, useState } from 'react'

interface Slot {
  n: number
  x: number
  y: number
  w: number
  h: number
}

interface FrameEditorProps {
  canvasW: number
  canvasH: number
  slots: Slot[]
  keyedPreview?: string
  onSlotsChange: (slots: Slot[]) => void
}

export default function FrameEditor({
  canvasW,
  canvasH,
  slots,
  keyedPreview,
  onSlotsChange
}: FrameEditorProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [dragging, setDragging] = useState<{ slot: number; startX: number; startY: number } | null>(null)

  const scale = 0.4
  const displayW = canvasW * scale
  const displayH = canvasH * scale

  const handleMouseDown = (slotIndex: number, e: React.MouseEvent) => {
    setSelectedSlot(slotIndex)
    setDragging({
      slot: slotIndex,
      startX: e.clientX - slots[slotIndex].x * scale,
      startY: e.clientY - slots[slotIndex].y * scale
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    
    const newX = Math.round((e.clientX - dragging.startX) / scale)
    const newY = Math.round((e.clientY - dragging.startY) / scale)
    
    const newSlots = slots.map((slot, i) => {
      if (i === dragging.slot) {
        return {
          ...slot,
          x: Math.max(0, Math.min(canvasW - slot.w, newX)),
          y: Math.max(0, Math.min(canvasH - slot.h, newY))
        }
      }
      return slot
    })
    
    onSlotsChange(newSlots)
  }

  const handleMouseUp = () => {
    setDragging(null)
  }

  const handleDeleteSlot = (slotIndex: number) => {
    const newSlots = slots
      .filter((_, i) => i !== slotIndex)
      .map((slot, i) => ({ ...slot, n: i + 1 }))
    onSlotsChange(newSlots)
    setSelectedSlot(null)
  }

  return (
    <div>
      <div 
        className="relative border border-line rounded-lg overflow-hidden"
        style={{ width: displayW, height: displayH }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {keyedPreview && (
          <img
            src={`data:image/png;base64,${keyedPreview}`}
            className="absolute inset-0 w-full h-full object-contain"
            alt="Frame preview"
          />
        )}
        
        {!keyedPreview && (
          <div className="absolute inset-0 bg-cream" />
        )}
        
        {slots.map((slot, index) => (
          <div
            key={index}
            className={`absolute border-2 ${
              selectedSlot === index ? 'border-cherry' : 'border-sky'
            } bg-sky/20 cursor-move`}
            style={{
              left: slot.x * scale,
              top: slot.y * scale,
              width: slot.w * scale,
              height: slot.h * scale
            }}
            onMouseDown={(e) => handleMouseDown(index, e)}
          >
            <div className="absolute -top-6 left-0 bg-char text-cream text-xs px-1 rounded">
              Slot {slot.n}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-sm text-char opacity-75">
        Klik dan geser slot untuk mengubah posisi. Klik slot untuk memilih.
      </div>
      
      {selectedSlot !== null && (
        <div className="mt-4 card">
          <h4 className="font-bold mb-2">Slot {selectedSlot + 1}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold">X</label>
              <input
                type="number"
                value={slots[selectedSlot].x}
                onChange={(e) => {
                  const newSlots = [...slots]
                  newSlots[selectedSlot].x = parseInt(e.target.value)
                  onSlotsChange(newSlots)
                }}
                className="w-full px-2 py-1 border border-line rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Y</label>
              <input
                type="number"
                value={slots[selectedSlot].y}
                onChange={(e) => {
                  const newSlots = [...slots]
                  newSlots[selectedSlot].y = parseInt(e.target.value)
                  onSlotsChange(newSlots)
                }}
                className="w-full px-2 py-1 border border-line rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Width</label>
              <input
                type="number"
                value={slots[selectedSlot].w}
                onChange={(e) => {
                  const newSlots = [...slots]
                  newSlots[selectedSlot].w = parseInt(e.target.value)
                  onSlotsChange(newSlots)
                }}
                className="w-full px-2 py-1 border border-line rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Height</label>
              <input
                type="number"
                value={slots[selectedSlot].h}
                onChange={(e) => {
                  const newSlots = [...slots]
                  newSlots[selectedSlot].h = parseInt(e.target.value)
                  onSlotsChange(newSlots)
                }}
                className="w-full px-2 py-1 border border-line rounded text-sm"
              />
            </div>
          </div>
          
          <button
            onClick={() => handleDeleteSlot(selectedSlot)}
            className="mt-3 bg-cherry text-cream px-4 py-2 rounded text-sm font-semibold"
          >
            Hapus Slot
          </button>
        </div>
      )}
    </div>
  )
}
