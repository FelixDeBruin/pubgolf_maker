import { useState } from 'react'
import { createDraft, rememberedGame } from '../lib/game'
import { navigate } from '../lib/nav'

export default function Home() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remembered = rememberedGame()

  async function host() {
    setBusy(true)
    setError('')
    try {
      navigate(`/draft/${await createDraft()}`)
    } catch {
      setError('Could not create a game. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <main className="page home">
      <h1 className="brand">Pub Golf Maker</h1>
      <p className="lead">Bars for holes, sips for strokes.</p>

      {remembered && (
        <button className="button primary" onClick={() => navigate(`/room/${remembered.roomId}`)}>
          Back to your game
        </button>
      )}

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) navigate(`/join/${code.trim().toUpperCase()}`)
        }}
      >
        <label className="field">
          Room code
          <input
            className="code-input"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button className="button primary" disabled={code.trim().length !== 4}>
          Join a game
        </button>
      </form>

      <button className="button" onClick={host} disabled={busy}>
        Host a game
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
