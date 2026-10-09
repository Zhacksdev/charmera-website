import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { detectSlots, createKeyedImage } from '../src/detection.js'

describe('detectSlots', () => {
  it('should detect two horizontal slots in portrait frame', async () => {
    const testImage = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: '#FFFFFF'
      }
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1020" height="380">
              <rect width="1020" height="380" fill="#00FF00"/>
            </svg>`
          ),
          left: 90,
          top: 120
        },
        {
          input: Buffer.from(
            `<svg width="1020" height="380">
              <rect width="1020" height="380" fill="#00FF00"/>
            </svg>`
          ),
          left: 90,
          top: 540
        }
      ])
      .png()
      .toBuffer()
    
    const result = await detectSlots(testImage)
    
    expect(result.orientation).toBe('portrait')
    expect(result.slots).toHaveLength(2)
    expect(result.canvas).toEqual({ w: 1200, h: 1800 })
    expect(result.slots[0].n).toBe(1)
    expect(result.slots[1].n).toBe(2)
  })
  
  it('should reject invalid canvas size', async () => {
    const testImage = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: '#FFFFFF'
      }
    })
      .png()
      .toBuffer()
    
    await expect(detectSlots(testImage)).rejects.toThrow()
  })
  
  it('should filter out slots smaller than minimum', async () => {
    const testImage = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: '#FFFFFF'
      }
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="100" height="100">
              <rect width="100" height="100" fill="#00FF00"/>
            </svg>`
          ),
          left: 100,
          top: 100
        }
      ])
      .png()
      .toBuffer()
    
    const result = await detectSlots(testImage, 32, 200)
    expect(result.slots).toHaveLength(0)
  })
})

describe('createKeyedImage', () => {
  it('should make green pixels transparent', async () => {
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: '#00FF00'
      }
    })
      .png()
      .toBuffer()
    
    const keyed = await createKeyedImage(testImage)
    const { info, data } = await sharp(keyed)
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    expect(info.channels).toBe(4)
    
    const alpha = data[3]
    expect(alpha).toBe(0)
  })
  
  it('should preserve non-green pixels', async () => {
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: '#FF0000'
      }
    })
      .png()
      .toBuffer()
    
    const keyed = await createKeyedImage(testImage)
    const { info, data } = await sharp(keyed)
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    expect(info.channels).toBe(4)
    expect(data[0]).toBe(255)
    expect(data[3]).toBe(255)
  })
})
