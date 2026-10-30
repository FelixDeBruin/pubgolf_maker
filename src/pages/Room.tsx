import { useEffect, useState } from 'react'
import { ensureSignedIn } from '../lib/firebase'
import { checkIsHost, forgetGame, isExpired, rememberGame, watchPlayers, watchRoom } from '../lib/game'
import type { Player, Room as RoomData } from '../lib/game'
import { navigate } from '../lib/nav'
import Card from './Card'
import Lobby from './Lobby'
import Scoreboard from './Scoreboard'

export default function Room({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<RoomData | null | undefined>(undefined)
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [isHost, setIsHost] = useState<boolean | null>(null)

  useEffect(() => {
    let stops: (() => void)[] = []
    let cancelled = false
    ensureSignedIn().then(async (user) => {
      const host = await checkIsHost(roomId)
      if (cancelled) return
      setUid(user.uid)
      setIsHost(host)
      stops = [watchRoom(roomId, setRoom), watchPlayers(roomId, setPlayers)]
    })
    return () => {
      cancelled = true
      stops.forEach((stop) => stop())
    }
  }, [roomId])

  const me = players?.find((player) => player.uid === uid) ?? null

  useEffect(() => {
    if (room && players && isHost === false && !me && room.status !== 'ended') {
      forgetGame()
      navigate(`/join/${room.code}`)
      return
    }
    if (room && me) rememberGame(room.id, me.id)
    if (room && isHost && !me) rememberGame(room.id, null)
  }, [room, players, isHost, me])

  if (room === null || (room && isExpired(room.expireAt))) {
    return (
      <main className="page">
        <p className="lead">This game has ended and been deleted</p>
        <button className="button" onClick={() => navigate('/')}>
          Home
        </button>
      </main>
    )
  }

  if (!room || !players || isHost === null) {
    return (
      <main className="page">
        <p className="lead">Loading...</p>
      </main>
    )
  }

  if (room.status === 'lobby') return <Lobby room={room} players={players} isHost={isHost} me={me} />
  if (room.status === 'playing') return <Card room={room} players={players} isHost={isHost} me={me} />
  return <Scoreboard room={room} players={players} isHost={isHost} />
}
