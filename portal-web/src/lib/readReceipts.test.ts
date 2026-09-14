import { describe, expect, it } from 'vitest'
import type { MatrixEvent, Room } from 'matrix-js-sdk'
import { compareEventPosition, isReadByUser } from './readReceipts'

function fakeEvent(id: string): MatrixEvent {
  return { getId: () => id } as unknown as MatrixEvent
}

function fakeRoom(eventIds: string[], readUpTo: Record<string, string | null> = {}): Room {
  const events = eventIds.map(fakeEvent)
  return {
    getUnfilteredTimelineSet: () => ({
      getTimelines: () => [{ getEvents: () => events }],
    }),
    getEventReadUpTo: (userId: string) => readUpTo[userId] ?? null,
  } as unknown as Room
}

describe('compareEventPosition', () => {
  it('возвращает 0 для одного и того же события', () => {
    const room = fakeRoom(['e1', 'e2', 'e3'])
    expect(compareEventPosition(room, 'e2', 'e2')).toBe(0)
  })

  it('возвращает -1, если первое событие раньше второго', () => {
    const room = fakeRoom(['e1', 'e2', 'e3'])
    expect(compareEventPosition(room, 'e1', 'e3')).toBe(-1)
  })

  it('возвращает 1, если первое событие позже второго', () => {
    const room = fakeRoom(['e1', 'e2', 'e3'])
    expect(compareEventPosition(room, 'e3', 'e1')).toBe(1)
  })

  it('возвращает null, если событие не найдено в загруженном таймлайне', () => {
    const room = fakeRoom(['e1', 'e2'])
    expect(compareEventPosition(room, 'e1', 'e-unknown')).toBeNull()
  })

  it('склеивает несколько сегментов таймлайна в общий порядок', () => {
    const room = {
      getUnfilteredTimelineSet: () => ({
        getTimelines: () => [{ getEvents: () => [fakeEvent('e1'), fakeEvent('e2')] }, { getEvents: () => [fakeEvent('e3')] }],
      }),
    } as unknown as Room
    expect(compareEventPosition(room, 'e1', 'e3')).toBe(-1)
  })
})

describe('isReadByUser', () => {
  it('true, если receipt указывает точно на это сообщение', () => {
    const room = fakeRoom(['e1', 'e2', 'e3'], { '@a:s': 'e2' })
    expect(isReadByUser(room, '@a:s', 'e2')).toBe(true)
  })

  it('true, если receipt указывает дальше, чем это сообщение', () => {
    const room = fakeRoom(['e1', 'e2', 'e3'], { '@a:s': 'e3' })
    expect(isReadByUser(room, '@a:s', 'e1')).toBe(true)
  })

  it('false, если receipt указывает раньше этого сообщения', () => {
    const room = fakeRoom(['e1', 'e2', 'e3'], { '@a:s': 'e1' })
    expect(isReadByUser(room, '@a:s', 'e3')).toBe(false)
  })

  it('false, если у пользователя нет receipt-а вообще', () => {
    const room = fakeRoom(['e1', 'e2', 'e3'])
    expect(isReadByUser(room, '@a:s', 'e1')).toBe(false)
  })

  it('false (безопасный отказ), если receipt указывает на событие вне загруженного таймлайна', () => {
    const room = fakeRoom(['e1', 'e2'], { '@a:s': 'e-far-in-history' })
    expect(isReadByUser(room, '@a:s', 'e1')).toBe(false)
  })
})
