import { create } from 'zustand'

export interface Frame {
  id: string
  name: string
  canvas_w: number
  canvas_h: number
  layout: {
    canvas: { w: number; h: number }
    slots: Array<{ n: number; x: number; y: number; w: number; h: number }>
    text_area?: { x: number; y: number; w: number; h: number }
  }
  extra_price: number
}

export interface Session {
  id: string
  public_code: string
  status: string
  frame_id?: string
  custom_text?: string
  stage_expires_at?: string
  remaining_sec?: number
}

export interface Photo {
  slot_index: number
  dataUrl: string
  clipDataUrl?: string
}

interface KioskState {
  session: Session | null
  selectedFrame: Frame | null
  frames: Frame[]
  photos: Map<number, Photo>
  customText: string
  
  setSession: (session: Session | null) => void
  setFrames: (frames: Frame[]) => void
  selectFrame: (frame: Frame | null) => void
  setPhoto: (slotIndex: number, photo: Photo) => void
  setCustomText: (text: string) => void
  reset: () => void
}

export const useKioskStore = create<KioskState>((set) => ({
  session: null,
  selectedFrame: null,
  frames: [],
  photos: new Map(),
  customText: '',
  
  setSession: (session) => set({ session }),
  setFrames: (frames) => set({ frames }),
  selectFrame: (frame) => set({ selectedFrame: frame }),
  setPhoto: (slotIndex, photo) => 
    set((state) => {
      const newPhotos = new Map(state.photos)
      newPhotos.set(slotIndex, photo)
      return { photos: newPhotos }
    }),
  setCustomText: (text) => set({ customText: text }),
  reset: () => set({
    session: null,
    selectedFrame: null,
    photos: new Map(),
    customText: '',
  }),
}))
