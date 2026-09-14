import { describe, expect, it } from 'vitest'
import type { MatrixEvent, Room } from 'matrix-js-sdk'
import { tallyPollVotes } from './poll'
import { POLL_VOTE_RELATION_TYPE } from '../types/events'

function fakeVoteEvent(sender: string, optionIndex: number, pollEventId: string, redacted = false): MatrixEvent {
  return {
    isRedacted: () => redacted,
    getContent: () => ({
      'm.relates_to': { rel_type: POLL_VOTE_RELATION_TYPE, event_id: pollEventId },
      optionIndex,
    }),
    getSender: () => sender,
  } as unknown as MatrixEvent
}

function fakeRoom(events: MatrixEvent[]): Room {
  return {
    getLiveTimeline: () => ({ getEvents: () => events }),
  } as unknown as Room
}

function fakePollEvent(id: string): MatrixEvent {
  return { getId: () => id } as unknown as MatrixEvent
}

describe('tallyPollVotes', () => {
  it('считает по одному голосу на отправителя', () => {
    const poll = fakePollEvent('poll1')
    const room = fakeRoom([fakeVoteEvent('@a:s', 0, 'poll1'), fakeVoteEvent('@b:s', 1, 'poll1')])

    const tally = tallyPollVotes(room, poll, 2, null)

    expect(tally.counts).toEqual([1, 1])
    expect(tally.total).toBe(2)
  })

  it('берёт последний голос от каждого отправителя, а не первый', () => {
    const poll = fakePollEvent('poll1')
    const room = fakeRoom([fakeVoteEvent('@a:s', 0, 'poll1'), fakeVoteEvent('@a:s', 1, 'poll1')])

    const tally = tallyPollVotes(room, poll, 2, null)

    expect(tally.counts).toEqual([0, 1])
    expect(tally.total).toBe(1)
  })

  it('игнорирует отредактированные (удалённые) голоса', () => {
    const poll = fakePollEvent('poll1')
    const room = fakeRoom([fakeVoteEvent('@a:s', 0, 'poll1', true)])

    const tally = tallyPollVotes(room, poll, 2, null)

    expect(tally.total).toBe(0)
  })

  it('игнорирует голоса за другой опрос в той же комнате', () => {
    const poll = fakePollEvent('poll1')
    const room = fakeRoom([fakeVoteEvent('@a:s', 0, 'other-poll')])

    const tally = tallyPollVotes(room, poll, 2, null)

    expect(tally.total).toBe(0)
  })

  it('определяет myVote для текущего пользователя', () => {
    const poll = fakePollEvent('poll1')
    const room = fakeRoom([fakeVoteEvent('@me:s', 1, 'poll1'), fakeVoteEvent('@other:s', 0, 'poll1')])

    const tally = tallyPollVotes(room, poll, 2, '@me:s')

    expect(tally.myVote).toBe(1)
  })

  it('игнорирует голос с индексом вне диапазона вариантов', () => {
    const poll = fakePollEvent('poll1')
    const room = fakeRoom([fakeVoteEvent('@a:s', 5, 'poll1')])

    const tally = tallyPollVotes(room, poll, 2, null)

    expect(tally.total).toBe(0)
  })
})
