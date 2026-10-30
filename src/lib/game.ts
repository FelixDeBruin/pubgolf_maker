import {
  Timestamp,
  collection,
  deleteDoc,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db, ensureSignedIn } from './firebase'
import type { Hole, PlayerCard } from './scoring'

export interface Challenge {
  text: string
  points: number
}

export interface Bar {
  id: string
  name: string
  drinks: string[]
  par: number
  challenge: Challenge | null
}

export interface Draft {
  title: string
  bars: Bar[]
  roomId: string | null
  expireAt: Timestamp
}

export type RoomStatus = 'lobby' | 'playing' | 'ended'

export interface Room {
  id: string
  title: string
  hostUid: string
  status: RoomStatus
  code: string
  holes: Bar[]
  endedAt: Timestamp | null
  expireAt: Timestamp
}

export interface Player extends PlayerCard {
  uid: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const UNFINISHED_DAYS = 30
const ENDED_DAYS = 15
const CLEANUP_LIMIT = 20
const CLOCK_MARGIN_MS = 5 * 60 * 1000
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LAST_GAME_KEY = 'pubgolf.lastGame'

function daysFromNow(days: number): Timestamp {
  return Timestamp.fromMillis(Date.now() + days * DAY_MS)
}

function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

export function makeRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('')
}

export function newBar(): Bar {
  return { id: randomId(8), name: '', drinks: [''], par: 3, challenge: null }
}

export function toHoles(bars: Bar[]): Hole[] {
  return bars.map((bar) => ({ par: bar.par, challengePoints: bar.challenge?.points }))
}

export function isExpired(expireAt: Timestamp): boolean {
  return expireAt.toMillis() < Date.now()
}

export function playerIdFor(name: string): string {
  return encodeURIComponent(name.trim().toLowerCase())
}

async function cleanUpExpired(): Promise<void> {
  const cutoff = Timestamp.fromMillis(Date.now() - CLOCK_MARGIN_MS)
  const expired = (name: string) =>
    getDocs(query(collection(db, name), where('expireAt', '<', cutoff), limit(CLEANUP_LIMIT)))

  for (const room of (await expired('rooms')).docs) {
    for (const name of ['players', 'hosts']) {
      const rows = await getDocs(collection(room.ref, name))
      await Promise.all(rows.docs.map((row) => deleteDoc(row.ref)))
    }
    await deleteDoc(room.ref)
  }
  for (const name of ['codes', 'drafts']) {
    const rows = await expired(name)
    await Promise.all(rows.docs.map((row) => deleteDoc(row.ref)))
  }
}

export async function createDraft(): Promise<string> {
  await ensureSignedIn()
  cleanUpExpired().catch(() => undefined)
  const id = randomId(24)
  await setDoc(doc(db, 'drafts', id), {
    title: 'Stellenbosch Pub Golf',
    bars: [newBar()],
    roomId: null,
    expireAt: daysFromNow(UNFINISHED_DAYS),
  })
  return id
}

export async function getDraft(id: string): Promise<Draft | null> {
  await ensureSignedIn()
  const snap = await getDoc(doc(db, 'drafts', id))
  if (!snap.exists()) return null
  const draft = snap.data() as Draft
  return isExpired(draft.expireAt) ? null : draft
}

export function saveDraft(id: string, title: string, bars: Bar[]): Promise<void> {
  return updateDoc(doc(db, 'drafts', id), {
    title,
    bars,
    expireAt: daysFromNow(UNFINISHED_DAYS),
  })
}

export async function openLobby(draftId: string, title: string, bars: Bar[]): Promise<string> {
  const user = await ensureSignedIn()
  await saveDraft(draftId, title, bars)
  const roomRef = doc(collection(db, 'rooms'))
  const expireAt = daysFromNow(UNFINISHED_DAYS)

  await runTransaction(db, async (tx) => {
    let code = makeRoomCode()
    while ((await tx.get(doc(db, 'codes', code))).exists()) code = makeRoomCode()

    tx.set(roomRef, {
      title,
      hostUid: user.uid,
      status: 'lobby',
      code,
      holes: bars,
      endedAt: null,
      expireAt,
    })
    tx.set(doc(db, 'codes', code), { roomId: roomRef.id, expireAt })
    tx.update(doc(db, 'drafts', draftId), { roomId: roomRef.id, expireAt })
    tx.set(doc(db, 'rooms', roomRef.id, 'hosts', user.uid), { draftId, expireAt })
  })
  return roomRef.id
}

export async function reclaimHost(roomId: string, draftId: string): Promise<void> {
  const user = await ensureSignedIn()
  const ref = doc(db, 'rooms', roomId, 'hosts', user.uid)
  if ((await getDoc(ref)).exists()) return
  await setDoc(ref, { draftId, expireAt: daysFromNow(UNFINISHED_DAYS) })
}

export async function checkIsHost(roomId: string): Promise<boolean> {
  const user = await ensureSignedIn()
  return (await getDoc(doc(db, 'rooms', roomId, 'hosts', user.uid))).exists()
}

export async function findRoom(code: string): Promise<Room | null> {
  await ensureSignedIn()
  const codeSnap = await getDoc(doc(db, 'codes', code.trim().toUpperCase()))
  if (!codeSnap.exists()) return null
  const roomSnap = await getDoc(doc(db, 'rooms', codeSnap.data().roomId))
  if (!roomSnap.exists()) return null
  return { id: roomSnap.id, ...roomSnap.data() } as Room
}

export function watchRoom(roomId: string, onChange: (room: Room | null) => void): () => void {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (!snap.exists() && snap.metadata.fromCache) return
    onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as Room) : null)
  })
}

export function watchPlayers(
  roomId: string,
  onChange: (players: Player[], fromServer: boolean) => void,
): () => void {
  return onSnapshot(
    collection(db, 'rooms', roomId, 'players'),
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.empty && snap.metadata.fromCache) return
      const players = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Player)
      onChange(players, !snap.metadata.fromCache)
    },
  )
}

let reconnecting = false

export async function reconnect(): Promise<void> {
  if (reconnecting) return
  reconnecting = true
  try {
    await disableNetwork(db)
    await enableNetwork(db)
  } finally {
    reconnecting = false
  }
}

export type JoinResult = 'joined' | 'taken' | 'isThisYou' | 'closed'

export async function joinRoom(room: Room, name: string): Promise<JoinResult> {
  const user = await ensureSignedIn()
  const id = playerIdFor(name)
  const ref = doc(db, 'rooms', room.id, 'players', id)

  return runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      if (existing.data().uid === user.uid) return 'joined'
      return room.status === 'lobby' ? 'taken' : 'isThisYou'
    }
    if (room.status !== 'lobby') return 'closed'
    tx.set(ref, {
      name: name.trim(),
      uid: user.uid,
      sips: {},
      ticks: {},
      expireAt: room.expireAt,
    })
    return 'joined'
  })
}

export async function claimPlayer(roomId: string, playerId: string): Promise<void> {
  const user = await ensureSignedIn()
  await updateDoc(doc(db, 'rooms', roomId, 'players', playerId), { uid: user.uid })
}

export function saveHole(
  roomId: string,
  player: Player,
  hole: number,
  sips: number | null,
  ticked: boolean,
): Promise<void> {
  const nextSips = { ...player.sips }
  const nextTicks = { ...player.ticks }
  if (sips === null) delete nextSips[hole]
  else nextSips[hole] = sips
  if (ticked) nextTicks[hole] = true
  else delete nextTicks[hole]

  return updateDoc(doc(db, 'rooms', roomId, 'players', player.id), {
    sips: nextSips,
    ticks: nextTicks,
    lastHole: hole,
    expireAt: daysFromNow(UNFINISHED_DAYS),
  })
}

export function startGame(roomId: string): Promise<void> {
  return updateDoc(doc(db, 'rooms', roomId), {
    status: 'playing',
    expireAt: daysFromNow(UNFINISHED_DAYS),
  })
}

export async function endGame(room: Room): Promise<void> {
  const expireAt = daysFromNow(ENDED_DAYS)
  const players = await getDocs(collection(db, 'rooms', room.id, 'players'))
  const batch = writeBatch(db)
  batch.update(doc(db, 'rooms', room.id), {
    status: 'ended',
    endedAt: serverTimestamp(),
    expireAt,
  })
  batch.update(doc(db, 'codes', room.code), { expireAt })
  players.forEach((player) => batch.update(player.ref, { expireAt }))
  await batch.commit()
}

export function rememberGame(roomId: string, playerId: string | null): void {
  try {
    localStorage.setItem(LAST_GAME_KEY, JSON.stringify({ roomId, playerId }))
  } catch {
    return
  }
}

export function forgetGame(): void {
  try {
    localStorage.removeItem(LAST_GAME_KEY)
  } catch {
    return
  }
}

export function rememberedGame():{ roomId: string; playerId: string | null } | null {
  try {
    const saved = localStorage.getItem(LAST_GAME_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}
