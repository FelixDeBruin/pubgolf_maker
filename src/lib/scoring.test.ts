import { describe, expect, it } from 'vitest'
import { formatToPar, rankPlayers, resultLabel, scorePlayer } from './scoring'
import type { Hole, PlayerCard } from './scoring'

const holes: Hole[] = [{ par: 3, challengePoints: 1 }, { par: 1 }, { par: 2, challengePoints: 1 }]

function player(
  name: string,
  sips: Record<number, number>,
  ticks: Record<number, boolean> = {},
): PlayerCard {
  return { id: name, name, sips, ticks }
}

const player1 = player('Player1', { 0: 2, 1: 1, 2: 3 }, { 0: true })
const player2 = player('Player2', { 0: 3, 1: 2, 2: 2 }, { 2: true })

describe('scorePlayer', () => {
  it('matches Player1 on the example card', () => {
    expect(scorePlayer(holes, player1)).toEqual({
      gross: 6,
      bonus: 1,
      net: 5,
      toPar: -1,
      thru: 3,
      finished: true,
      running: [-2, -2, -1],
    })
  })

  it('matches Player2 on the example card', () => {
    expect(scorePlayer(holes, player2)).toEqual({
      gross: 7,
      bonus: 1,
      net: 6,
      toPar: 0,
      thru: 3,
      finished: true,
      running: [0, 1, 0],
    })
  })

  it('compares to par only on holes played', () => {
    const score = scorePlayer(holes, player('A', { 0: 2 }))
    expect(score).toMatchObject({ gross: 2, toPar: -1, thru: 1, finished: false })
    expect(score.running).toEqual([-1, null, null])
  })

  it('counts holes played out of order', () => {
    const score = scorePlayer(holes, player('A', { 2: 4 }))
    expect(score).toMatchObject({ toPar: 2, thru: 1 })
    expect(score.running).toEqual([null, null, 2])
  })

  it('treats zero sips as played', () => {
    expect(scorePlayer(holes, player('A', { 1: 0 })).thru).toBe(1)
  })

  it('takes ticked points off even before sips are entered', () => {
    const score = scorePlayer(holes, player('A', {}, { 0: true }))
    expect(score).toMatchObject({ bonus: 1, toPar: -1, thru: 0 })
    expect(score.running).toEqual([null, null, null])
  })

  it('ignores a tick on a hole with no challenge', () => {
    expect(scorePlayer(holes, player('A', {}, { 1: true })).bonus).toBe(0)
  })

  it('does not finish a game with no holes', () => {
    expect(scorePlayer([], player('A', {})).finished).toBe(false)
  })
})

describe('formatToPar', () => {
  it('shows E, plus and minus', () => {
    expect(formatToPar(0)).toBe('E')
    expect(formatToPar(2)).toBe('+2')
    expect(formatToPar(-3)).toBe('-3')
  })
})

describe('resultLabel', () => {
  it('shows a finisher as their score', () => {
    expect(resultLabel(scorePlayer(holes, player1), 3)).toBe('-1')
  })

  it('shows DNF with score and holes played', () => {
    const five: Hole[] = Array.from({ length: 5 }, () => ({ par: 2 }))
    const dnf = player('A', { 0: 1, 1: 1, 2: 1 })
    expect(resultLabel(scorePlayer(five, dnf), 5)).toBe('DNF -3 (3 of 5)')
  })
})

describe('rankPlayers', () => {
  const names = (list: PlayerCard[]) => rankPlayers(holes, list).map((r) => r.player.name)

  it('ranks finishers by lowest To par', () => {
    expect(names([player2, player1])).toEqual(['Player1', 'Player2'])
  })

  it('puts a finisher above a better DNF', () => {
    const worstFinisher = player('Finisher', { 0: 9, 1: 9, 2: 9 })
    const bestDnf = player('Dnf', { 0: 1, 1: 1 }, { 0: true })
    expect(names([bestDnf, worstFinisher])).toEqual(['Finisher', 'Dnf'])
  })

  it('ranks DNF players by holes, then score', () => {
    const two = player('Two', { 0: 9, 1: 9 })
    const oneGood = player('OneGood', { 0: 1 })
    const oneBad = player('OneBad', { 0: 5 })
    expect(names([oneBad, oneGood, two])).toEqual(['Two', 'OneGood', 'OneBad'])
  })

  it('applies the same ranking when nobody finishes', () => {
    const ranked = rankPlayers(holes, [player('A', { 0: 3 }), player('B', { 0: 3, 1: 1 })])
    expect(ranked.map((r) => [r.player.name, r.place])).toEqual([
      ['B', 1],
      ['A', 2],
    ])
  })

  it('shares a place when level, then skips the next', () => {
    const ranked = rankPlayers(holes, [
      player('Low', { 0: 1, 1: 1, 2: 1 }),
      player('TieA', { 0: 3, 1: 1, 2: 2 }),
      player('TieB', { 0: 2, 1: 2, 2: 2 }),
      player('High', { 0: 9, 1: 9, 2: 9 }),
    ])
    expect(ranked.map((r) => r.place)).toEqual([1, 2, 2, 4])
  })

  it('does not tie equal scores with different holes played', () => {
    const ranked = rankPlayers(holes, [
      player('Full', { 0: 3, 1: 1, 2: 2 }),
      player('Part', { 0: 3 }),
    ])
    expect(ranked.map((r) => r.place)).toEqual([1, 2])
  })
})
