import { useEffect, useState } from 'react'
import { claimPlayer, findRoom, isExpired, joinRoom, playerIdFor, rememberGame, rememberedGame } from '../lib/game'
import type { Room } from '../lib/game'
import { navigate } from '../lib/nav'

export default function Join({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState('')
  const [room, setRoom] = useState<Room | null>(null)
  const [message, setMessage] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initialCode) lookUp(initialCode)
  }, [initialCode])

  async function lookUp(value: string): Promise<Room | null> {
    setMessage('')
    const found = await findRoom(value)
    if (!found) {
      setMessage('No game with that code.')
      return null
    }
    if (isExpired(found.expireAt)) {
      setMessage('This game has ended and been deleted')
      return null
    }
    const remembered = rememberedGame()
    if (remembered?.roomId === found.id && remembered.playerId) navigate(`/room/${found.id}`)
    setRoom(found)
    return found
  }

  function enter(roomId: string) {
    rememberGame(roomId, playerIdFor(name))
    navigate(`/room/${roomId}`)
  }

  async function submit() {
    setBusy(true)
    setMessage('')
    setClaiming(false)
    try {
      const target = room ?? (await lookUp(code))
      if (!target) return
      if (target.status === 'ended') return navigate(`/room/${target.id}`)

      const result = await joinRoom(target, name)
      if (result === 'joined') enter(target.id)
      if (result === 'taken') setMessage('That name is taken. Please choose another.')
      if (result === 'isThisYou') setClaiming(true)
      if (result === 'closed') setMessage('This game has already started.')
    } catch {
      setMessage('Could not join. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function claim() {
    if (!room) return
    await claimPlayer(room.id, playerIdFor(name))
    enter(room.id)
  }

  return (
    <main className="page">
      <h1 className="brand">{room?.title ?? 'Join a game'}</h1>

      {claiming ? (
        <div className="stack">
          <p className="lead">{name.trim()} is already in this game. Is this you?</p>
          <button className="button primary" onClick={claim}>
            Yes, that's me
          </button>
          <button className="button" onClick={() => setClaiming(false)}>
            No, go back
          </button>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {!initialCode && (
            <label className="field">
              Room code
              <input
                className="code-input"
                value={code}
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setRoom(null)
                }}
              />
            </label>
          )}
          <label className="field">
            Your name
            <input
              value={name}
              maxLength={24}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim() || code.trim().length !== 4}>
            Join
          </button>
        </form>
      )}
      {message && <p className="error">{message}</p>}
    </main>
  )
}
