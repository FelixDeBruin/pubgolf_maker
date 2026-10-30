import { useState } from 'react'
import { toHoles } from '../lib/game'
import type { Bar, Player } from '../lib/game'
import { formatToPar, scorePlayer } from '../lib/scoring'

interface Props {
  title: string
  code: string
  bars: Bar[]
  players: Player[]
  myId?: string
  onPick?: (hole: number) => void
}

function markClass(sips: number, par: number): string {
  if (sips < par) return 'mark under'
  return sips > par ? 'mark over' : 'mark'
}

export default function ScoreCard({ title, code, bars, players, myId, onPick }: Props) {
  const [flagHole, setFlagHole] = useState<number | null>(null)
  const holes = toHoles(bars)
  const totalPar = bars.reduce((sum, bar) => sum + bar.par, 0)
  const flagBar = flagHole === null ? null : bars[flagHole]
  const rows = [...players].sort((a, b) => Number(b.id === myId) - Number(a.id === myId))

  return (
    <section className="card">
      <header className="card-head">
        <h1>{title}</h1>
        <p>
          Room code <strong>{code}</strong>
        </p>
      </header>

      <div className="card-scroll">
        <table className="golf">
          <thead>
            <tr>
              <th className="label">Hole</th>
              {bars.map((bar, i) => (
                <th key={bar.id}>{i + 1}</th>
              ))}
              <th>Gross</th>
              <th>Bonus</th>
              <th>Net</th>
              <th>To par</th>
              <th>Thru</th>
            </tr>
          </thead>
          <tbody>
            <tr className="info">
              <th className="label">Bar</th>
              {bars.map((bar) => (
                <td key={bar.id}>
                  <span className="sideways">{bar.name}</span>
                </td>
              ))}
              <td colSpan={5} />
            </tr>
            <tr className="info">
              <th className="label">Drinks</th>
              {bars.map((bar) => (
                <td className="drinks" key={bar.id}>
                  {bar.drinks.map((drink) => (
                    <div key={drink}>{drink}</div>
                  ))}
                </td>
              ))}
              <td colSpan={5} />
            </tr>
            <tr className="info">
              <th className="label">Par</th>
              {bars.map((bar) => (
                <td key={bar.id}>{bar.par}</td>
              ))}
              <td>{totalPar}</td>
              <td colSpan={4} />
            </tr>
            <tr className="bonus-row">
              <th className="label">Bonus</th>
              {bars.map((bar, i) => (
                <td key={bar.id}>
                  {bar.challenge && (
                    <button className="flag" aria-label={`Challenge at hole ${i + 1}`} onClick={() => setFlagHole(i)}>
                      ⚑
                    </button>
                  )}
                </td>
              ))}
              <td colSpan={5} />
            </tr>

            {rows.map((player) => {
              const score = scorePlayer(holes, player)
              const mine = player.id === myId
              return [
                <tr className={mine ? 'player mine' : 'player'} key={player.id}>
                  <th className="label">{player.name}</th>
                  {bars.map((bar, i) => {
                    const sips = player.sips[i]
                    const content = (
                      <>
                        {sips !== undefined && <span className={markClass(sips, bar.par)}>{sips}</span>}
                        {bar.challenge && (
                          <span className="tick" aria-hidden="true">
                            {player.ticks[i] ? '☑' : '☐'}
                          </span>
                        )}
                      </>
                    )
                    return (
                      <td className="score" key={bar.id}>
                        {mine && onPick ? (
                          <button aria-label={`Enter hole ${i + 1}`} onClick={() => onPick(i)}>
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </td>
                    )
                  })}
                  <td className="total">{score.gross}</td>
                  <td className="total">{score.bonus ? -score.bonus : 0}</td>
                  <td className="total">{score.net}</td>
                  <td className="total strong">{formatToPar(score.toPar)}</td>
                  <td className="total">{score.thru}</td>
                </tr>,
                <tr className="running" key={`${player.id}-running`}>
                  <th className="label">Running</th>
                  {score.running.map((value, i) => (
                    <td key={bars[i].id}>{value === null ? '' : formatToPar(value)}</td>
                  ))}
                  <td colSpan={5} />
                </tr>,
              ]
            })}
          </tbody>
        </table>
      </div>

      <footer className="card-foot">
        <span>Marker ____________</span>
        <span>Attested ____________</span>
      </footer>

      {flagBar?.challenge && flagHole !== null && (
        <div className="sheet-back" onClick={() => setFlagHole(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>
              Hole {flagHole + 1}: {flagBar.challenge.text}
            </h2>
            <p>{flagBar.challenge.points} off your total</p>
            <p>
              Done by:{' '}
              {players
                .filter((player) => player.ticks[flagHole])
                .map((player) => player.name)
                .join(', ') || 'nobody yet'}
            </p>
            <button className="button" onClick={() => setFlagHole(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
