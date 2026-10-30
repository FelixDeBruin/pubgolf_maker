import { useEffect, useRef, useState } from 'react'
import { getDraft, newBar, openLobby, reclaimHost, saveDraft } from '../lib/game'
import type { Bar } from '../lib/game'
import { navigate } from '../lib/nav'

const SAVE_DELAY_MS = 600

type SaveState = 'saved' | 'saving' | 'failed'

export default function Draft({ draftId }: { draftId: string }) {
  const [title, setTitle] = useState('')
  const [bars, setBars] = useState<Bar[] | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const dragIndex = useRef<number | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    getDraft(draftId).then((draft) => {
      if (!draft) return setMissing(true)
      setTitle(draft.title)
      setBars(draft.bars)
      setRoomId(draft.roomId)
    })
  }, [draftId])

  useEffect(() => {
    if (!bars || roomId) return
    if (!loaded.current) {
      loaded.current = true
      return
    }
    setSaveState('saving')
    const timer = setTimeout(() => {
      saveDraft(draftId, title, bars)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('failed'))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draftId, title, bars, roomId])

  if (missing) return <Message text="This game has ended and been deleted" />
  if (!bars) return <Message text="Loading..." />

  if (roomId) {
    return (
      <main className="page">
        <h1 className="brand">{title}</h1>
        <p className="lead">The lobby is open, so the bars are locked.</p>
        <button
          className="button primary"
          onClick={() => reclaimHost(roomId, draftId).then(() => navigate(`/room/${roomId}`))}
        >
          Go to the game
        </button>
      </main>
    )
  }

  const update = (i: number, changes: Partial<Bar>) =>
    setBars(bars.map((bar, j) => (j === i ? { ...bar, ...changes } : bar)))

  function move(from: number, to: number) {
    if (!bars || to < 0 || to >= bars.length) return
    const next = [...bars]
    next.splice(to, 0, next.splice(from, 1)[0])
    setBars(next)
  }

  const ready = bars.length > 0 && bars.every((bar) => bar.name.trim() && bar.par > 0)

  async function open() {
    if (!bars) return
    const cleaned = bars.map((bar) => ({
      ...bar,
      name: bar.name.trim(),
      drinks: bar.drinks.map((d) => d.trim()).filter(Boolean),
    }))
    setError('')
    try {
      navigate(`/room/${await openLobby(draftId, title, cleaned)}`)
    } catch {
      setError('Could not open the lobby. Check your connection and try again.')
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(location.href).then(() => setCopied(true))
  }

  return (
    <main className="page">
      <label className="field">
        Game name
        <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <div className="save-row">
        <span>
          {saveState === 'saved' && 'Saved'}
          {saveState === 'saving' && 'Saving...'}
          {saveState === 'failed' && 'Not saved. Check your connection.'}
        </span>
        <button className="link" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy private draft link'}
        </button>
      </div>

      {bars.map((bar, i) => (
        <section
          className="bar-card"
          key={bar.id}
          draggable
          onDragStart={() => (dragIndex.current = i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex.current !== null) move(dragIndex.current, i)
            dragIndex.current = null
          }}
        >
          <header className="bar-head">
            <h2>Hole {i + 1}</h2>
            <div className="bar-actions">
              <button aria-label={`Move hole ${i + 1} up`} onClick={() => move(i, i - 1)} disabled={i === 0}>
                ↑
              </button>
              <button
                aria-label={`Move hole ${i + 1} down`}
                onClick={() => move(i, i + 1)}
                disabled={i === bars.length - 1}
              >
                ↓
              </button>
              <button
                aria-label={`Remove hole ${i + 1}`}
                onClick={() => setBars(bars.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          </header>

          <label className="field">
            Bar
            <input value={bar.name} onChange={(e) => update(i, { name: e.target.value })} />
          </label>

          <div className="field">
            Drinks
            {bar.drinks.map((drink, d) => (
              <div className="drink-row" key={d}>
                <input
                  aria-label={`Drink ${d + 1} at hole ${i + 1}`}
                  value={drink}
                  onChange={(e) =>
                    update(i, { drinks: bar.drinks.map((x, y) => (y === d ? e.target.value : x)) })
                  }
                />
                {bar.drinks.length > 1 && (
                  <button
                    aria-label={`Remove drink ${d + 1}`}
                    onClick={() => update(i, { drinks: bar.drinks.filter((_, y) => y !== d) })}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button className="link" onClick={() => update(i, { drinks: [...bar.drinks, ''] })}>
              Add a drink
            </button>
          </div>

          <label className="field small">
            Par (sips)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={bar.par || ''}
              onChange={(e) => update(i, { par: Math.max(0, Math.floor(Number(e.target.value))) })}
            />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={bar.challenge !== null}
              onChange={(e) =>
                update(i, { challenge: e.target.checked ? { text: '', points: 1 } : null })
              }
            />
            Bonus challenge
          </label>

          {bar.challenge && (
            <>
              <label className="field">
                Challenge
                <input
                  value={bar.challenge.text}
                  onChange={(e) => update(i, { challenge: { ...bar.challenge!, text: e.target.value } })}
                />
              </label>
              <label className="field small">
                Points off total
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={bar.challenge.points || ''}
                  onChange={(e) =>
                    update(i, {
                      challenge: {
                        ...bar.challenge!,
                        points: Math.max(0, Math.floor(Number(e.target.value))),
                      },
                    })
                  }
                />
              </label>
            </>
          )}
        </section>
      ))}

      <button className="button" disabled={bars.length >= 30} onClick={() => setBars([...bars, newBar()])}>
        Add another bar
      </button>
      <button className="button primary" onClick={open} disabled={!ready}>
        Open the lobby
      </button>
      {!ready && <p className="hint">Every hole needs a bar name and a par.</p>}
      {error && <p className="error">{error}</p>}
    </main>
  )
}

function Message({ text }: { text: string }) {
  return (
    <main className="page">
      <p className="lead">{text}</p>
      <button className="button" onClick={() => navigate('/')}>
        Home
      </button>
    </main>
  )
}
