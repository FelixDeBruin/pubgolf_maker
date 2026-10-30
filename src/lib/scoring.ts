export interface Hole {
  par: number
  challengePoints?: number
}

export interface PlayerCard {
  id: string
  name: string
  sips: Record<number, number>
  ticks: Record<number, boolean>
}

export interface PlayerScore {
  gross: number
  bonus: number
  net: number
  toPar: number
  thru: number
  finished: boolean
  running: (number | null)[]
}

export interface RankedPlayer {
  player: PlayerCard
  score: PlayerScore
  place: number
}

export function scorePlayer(holes: Hole[], player: PlayerCard): PlayerScore {
  let gross = 0
  let bonus = 0
  let parPlayed = 0
  let thru = 0
  let runningTotal = 0

  const running = holes.map((hole, i) => {
    const sips = player.sips[i]
    const played = sips !== undefined
    const points = player.ticks[i] ? (hole.challengePoints ?? 0) : 0

    bonus += points
    runningTotal -= points
    if (played) {
      gross += sips
      parPlayed += hole.par
      thru += 1
      runningTotal += sips - hole.par
    }
    return played ? runningTotal : null
  })

  return {
    gross,
    bonus,
    net: gross - bonus,
    toPar: gross - parPlayed - bonus,
    thru,
    finished: thru === holes.length && holes.length > 0,
    running,
  }
}

export function formatToPar(value: number): string {
  if (value === 0) return 'E'
  return value > 0 ? `+${value}` : `${value}`
}

export function resultLabel(score: PlayerScore, holeCount: number): string {
  const toPar = formatToPar(score.toPar)
  return score.finished ? toPar : `DNF ${toPar} (${score.thru} of ${holeCount})`
}

export function rankPlayers(holes: Hole[], players: PlayerCard[]): RankedPlayer[] {
  const sorted = players
    .map((player) => ({ player, score: scorePlayer(holes, player) }))
    .sort((a, b) => b.score.thru - a.score.thru || a.score.toPar - b.score.toPar)

  const ranked: RankedPlayer[] = []
  sorted.forEach((entry, i) => {
    const previous = ranked[i - 1]
    const level =
      previous !== undefined &&
      previous.score.thru === entry.score.thru &&
      previous.score.toPar === entry.score.toPar
    ranked.push({ ...entry, place: level ? previous.place : i + 1 })
  })
  return ranked
}
