import { useEffect, useState } from 'react'
import ScoreCard from '../components/ScoreCard'
import { toHoles } from '../lib/game'
import type { Player, Room } from '../lib/game'
import { rankPlayers, resultLabel } from '../lib/scoring'

const REVEAL_MS = 1600

export default function Scoreboard({ room, players }: { room: Room; players: Player[] }) {
  const ranked = rankPlayers(toHoles(room.holes), players)
  const podium = ranked.slice(0, 3)
  const rest = ranked.slice(3)
  const [revealed, setRevealed] = useState(0)
  const [showCard, setShowCard] = useState(false)

  useEffect(() => {
    if (revealed >= podium.length) return
    const timer = setTimeout(() => setRevealed(revealed + 1), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [revealed, podium.length])

  if (showCard) {
    return (
      <main className="page wide">
        <ScoreCard title={room.title} code={room.code} bars={room.holes} players={players} />
        <button className="button" onClick={() => setShowCard(false)}>
          Back to the podium
        </button>
      </main>
    )
  }

  const label = (index: number) => resultLabel(podium[index].score, room.holes.length)
  const isShown = (index: number) => revealed >= podium.length - index
  const heights = ['first', 'second', 'third']
  const steps = [1, 0, 2]
    .filter((index) => index < podium.length)
    .map((index) => ({ index, className: heights[podium[index].place - 1] }))

  return (
    <main className="final">
      <h1 className="final-title">Final scoreboard</h1>

      <div className="podium">
        {steps.map(({ index, className }) => (
          <div className={`step ${className} ${isShown(index) ? 'shown' : ''}`} key={index}>
            {isShown(index) && (
              <>
                {podium[index].place === 1 && <span className="drop-flag">⚑</span>}
                <p className="step-name">{podium[index].player.name}</p>
                <p className="step-score">{label(index)}</p>
              </>
            )}
            <div className="block">{isShown(index) ? podium[index].place : ''}</div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <ol className="ranked">
          {rest.map(({ player, score, place }) => (
            <li key={player.id}>
              <span>
                {place}. {player.name}
              </span>
              <span>{resultLabel(score, room.holes.length)}</span>
            </li>
          ))}
        </ol>
      )}

      <button className="button loud" onClick={() => setShowCard(true)}>
        See the full card
      </button>
    </main>
  )
}
