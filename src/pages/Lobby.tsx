import { useState } from 'react'
import { joinRoom, startGame } from '../lib/game'
import type { Player, Room } from '../lib/game'

interface Props {
  room: Room
  players: Player[]
  isHost: boolean
  me: Player | null
}

export default function Lobby({ room, players, isHost, me }: Props) {
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const link = `${location.origin}/join/${room.code}`

  function share() {
    navigator.share({ title: room.title, url: link }).catch(() => undefined)
  }

  function copy() {
    navigator.clipboard.writeText(link).then(() => setCopied(true))
  }

  async function addHost() {
    setError('')
    const result = await joinRoom(room, name)
    if (result === 'taken') setError('That name is taken. Please choose another.')
    else setName('')
  }

  return (
    <main className="lobby">
      <p className="lobby-title">{room.title}</p>
      <p className="lobby-label">Room code</p>
      <p className="lobby-code">{room.code}</p>

      <div className="lobby-actions">
        {'share' in navigator && (
          <button className="button loud" onClick={share}>
            Share
          </button>
        )}
        <button className="button loud" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <ul className="tags">
        {players.map((player) => (
          <li className="tag" key={player.id}>
            {player.name}
          </li>
        ))}
      </ul>

      {players.length === 0 && <p className="lobby-wait">Waiting for players...</p>}

      {isHost && !me && (
        <form
          className="lobby-join"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) addHost()
          }}
        >
          <input
            aria-label="Your name"
            placeholder="Playing too? Your name"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="button loud">Join</button>
        </form>
      )}
      {error && <p className="lobby-error">{error}</p>}

      {isHost ? (
        <button className="button start" onClick={() => startGame(room.id)} disabled={players.length === 0}>
          Start
        </button>
      ) : (
        <p className="lobby-wait">Waiting for the host to start...</p>
      )}
    </main>
  )
}
