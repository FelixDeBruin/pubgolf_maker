import { useState } from 'react'
import ExitButton from '../components/ExitButton'
import ScoreCard from '../components/ScoreCard'
import { endGame, saveHole, toHoles } from '../lib/game'
import type { Player, Room } from '../lib/game'
import { scorePlayer } from '../lib/scoring'

const NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1)

interface Props {
  room: Room
  players: Player[]
  isHost: boolean
  me: Player | null
}

export default function Card({ room, players, isHost, me }: Props) {
  const [hole, setHole] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const holes = toHoles(room.holes)
  const unfinished = players.filter((player) => !scorePlayer(holes, player).finished).length

  async function save(sips: number | null, ticked: boolean) {
    if (!me || hole === null) return
    setError('')
    try {
      await saveHole(room.id, me, hole, sips, ticked)
    } catch {
      setError('That score did not save. Check your connection and try again.')
    }
  }

  async function end() {
    setError('')
    try {
      await endGame(room)
    } catch {
      setError('Could not end the game. Check your connection and try again.')
      setConfirming(false)
    }
  }

  return (
    <main className="page wide">
      <ScoreCard
        title={room.title}
        code={room.code}
        bars={room.holes}
        players={players}
        myId={me?.id}
        onPick={setHole}
      />
      {error && <p className="error">{error}</p>}
      {isHost && (
        <button className="button" onClick={() => (unfinished ? setConfirming(true) : end())}>
          End the game
        </button>
      )}
      <ExitButton label="Exit game" className="button" />

      {confirming && (
        <div className="sheet-back">
          <div className="sheet">
            <h2>End the game?</h2>
            <p>
              Players with empty holes: {unfinished} of {players.length}. They will be DNF.
            </p>
            <button className="button primary" onClick={end}>
              End the game
            </button>
            <button className="button" onClick={() => setConfirming(false)}>
              Keep playing
            </button>
          </div>
        </div>
      )}

      {hole !== null && me && (
        <Picker
          key={hole}
          holeNumber={hole + 1}
          room={room}
          sips={me.sips[hole] ?? null}
          ticked={me.ticks[hole] === true}
          onChange={save}
          onClose={() => setHole(null)}
        />
      )}
    </main>
  )
}

interface PickerProps {
  holeNumber: number
  room: Room
  sips: number | null
  ticked: boolean
  onChange: (sips: number | null, ticked: boolean) => void
  onClose: () => void
}

function Picker({ holeNumber, room, sips, ticked, onChange, onClose }: PickerProps) {
  const bar = room.holes[holeNumber - 1]
  const [tick, setTick] = useState(ticked)

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          Hole {holeNumber}: {bar.name}
        </h2>
        <p>
          {bar.drinks.join(' or ')}
          {bar.drinks.length > 0 && ', '}par {bar.par}
        </p>
        <div className="numbers">
          {NUMBERS.map((n) => (
            <button
              key={n}
              className={n === sips ? 'number picked' : 'number'}
              onClick={() => onChange(n, tick)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="stepper">
          <button aria-label="One fewer" disabled={!sips || sips <= 1} onClick={() => onChange(sips! - 1, tick)}>
            −
          </button>
          <span>{sips ?? '-'}</span>
          <button aria-label="One more" disabled={sips === 99} onClick={() => onChange((sips ?? 0) + 1, tick)}>
            +
          </button>
        </div>
        {bar.challenge && (
          <label className="check">
            <input
              type="checkbox"
              checked={tick}
              onChange={(e) => {
                setTick(e.target.checked)
                onChange(sips, e.target.checked)
              }}
            />
            {bar.challenge.text} (-{bar.challenge.points})
          </label>
        )}
        <div className="sheet-actions">
          <button className="button" disabled={sips === null} onClick={() => onChange(null, tick)}>
            Clear
          </button>
          <button className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
