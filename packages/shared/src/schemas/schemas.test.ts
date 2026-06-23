import { describe, expect, it } from 'vitest'
import { intakeEntrySchema } from './intake'
import { profileSchema } from './profile'
import { defaultReminderSettings, reminderSettingsSchema } from './reminder-settings'

const base = () => defaultReminderSettings('2026-06-22T00:00:00Z')

describe('reminderSettingsSchema — interval bounds match SQL CHECK (15..1440)', () => {
  it.each([
    [14, false],
    [15, true],
    [1440, true],
    [1441, false],
  ])('intervalMinutes=%i -> valid=%s', (intervalMinutes, valid) => {
    const r = reminderSettingsSchema.safeParse({ ...base(), intervalMinutes })
    expect(r.success).toBe(valid)
  })
})

describe('reminderSettingsSchema — CHECK-equivalent refinements', () => {
  it('rejects equal active window', () => {
    const r = reminderSettingsSchema.safeParse({
      ...base(),
      windowStart: '08:00',
      windowEnd: '08:00',
    })
    expect(r.success).toBe(false)
  })

  it('rejects empty times[] in times mode', () => {
    const r = reminderSettingsSchema.safeParse({ ...base(), mode: 'times', times: [] })
    expect(r.success).toBe(false)
  })

  it('accepts non-empty times[] in times mode', () => {
    const r = reminderSettingsSchema.safeParse({
      ...base(),
      mode: 'times',
      times: ['09:00', '13:30'],
    })
    expect(r.success).toBe(true)
  })

  it('rejects half-set quiet hours (start only)', () => {
    const r = reminderSettingsSchema.safeParse({ ...base(), quietStart: '22:00', quietEnd: null })
    expect(r.success).toBe(false)
  })

  it('rejects equal quiet bounds (the always-suppress bug)', () => {
    const r = reminderSettingsSchema.safeParse({
      ...base(),
      quietStart: '22:00',
      quietEnd: '22:00',
    })
    expect(r.success).toBe(false)
  })

  it('accepts a valid wrap-around quiet window', () => {
    const r = reminderSettingsSchema.safeParse({
      ...base(),
      quietStart: '22:00',
      quietEnd: '07:00',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a malformed HH:mm', () => {
    const r = reminderSettingsSchema.safeParse({ ...base(), windowStart: '8:00' })
    expect(r.success).toBe(false)
  })
})

describe('intakeEntrySchema — amount bounds match SQL CHECK (1..5000)', () => {
  it.each([
    [0, false],
    [1, true],
    [5000, true],
    [5001, false],
  ])('amountMl=%i -> valid=%s', (amountMl, valid) => {
    const r = intakeEntrySchema.safeParse({
      amountMl,
      loggedAt: '2026-06-22T10:00:00Z',
      source: 'quick_add',
    })
    expect(r.success).toBe(valid)
  })
})

describe('profileSchema', () => {
  it.each([
    [249, false],
    [250, true],
    [20000, true],
    [20001, false],
  ])('dailyGoalMl=%i -> valid=%s', (dailyGoalMl, valid) => {
    const r = profileSchema.safeParse({
      dailyGoalMl,
      units: 'ml',
      displayName: null,
      timezone: 'America/New_York',
    })
    expect(r.success).toBe(valid)
  })

  it('rejects an invalid IANA timezone', () => {
    const r = profileSchema.safeParse({
      dailyGoalMl: 2000,
      units: 'ml',
      displayName: null,
      timezone: 'Mars/Phobos',
    })
    expect(r.success).toBe(false)
  })
})
