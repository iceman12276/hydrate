import { describe, expect, it } from 'vitest'
import { mlToOz, ozToMl } from './units'

describe('units', () => {
  it('round-trips ml -> oz -> ml', () => {
    expect(ozToMl(mlToOz(500))).toBeCloseTo(500, 6)
  })

  it('500 ml is about 16.91 US fl oz', () => {
    expect(mlToOz(500)).toBeCloseTo(16.907, 2)
  })
})
