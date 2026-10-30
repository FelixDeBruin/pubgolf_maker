import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const expireAt = Timestamp.fromMillis(Date.now() + 86400000)
const holes = [
  { id: 'a', name: 'One', drinks: ['Beer'], par: 3, challenge: { text: 'Sing', points: 1 } },
  { id: 'b', name: 'Two', drinks: ['Shot'], par: 1, challenge: null },
]

let env: RulesTestEnvironment

const asUser = (uid: string) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

async function seed(status: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'drafts/secret'), { title: 'T', bars: holes, roomId: 'r1', expireAt })
    await setDoc(doc(db, 'drafts/open'), { title: 'T', bars: holes, roomId: null, expireAt })
    await setDoc(doc(db, 'codes/KX47'), { roomId: 'r1', expireAt })
    await setDoc(doc(db, 'rooms/r1'), {
      title: 'T',
      hostUid: 'host',
      status,
      code: 'KX47',
      holes,
      endedAt: null,
      expireAt,
    })
    await setDoc(doc(db, 'rooms/r1/hosts/host'), { draftId: 'secret', expireAt })
    await setDoc(doc(db, 'rooms/r1/players/ann'), {
      name: 'Ann',
      uid: 'ann-uid',
      sips: {},
      ticks: {},
      expireAt,
    })
  })
}

const newPlayer = (uid: string) => ({ name: 'Bob', uid, sips: {}, ticks: {}, expireAt })
const edit = (sips: object, ticks: object, lastHole: number) => ({ sips, ticks, lastHole, expireAt })

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pubgolf',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(() => env.cleanup())
beforeEach(() => env.clearFirestore())

describe('drafts and codes', () => {
  beforeEach(() => seed('lobby'))

  it('allows reading a draft and a code by id', async () => {
    await assertSucceeds(getDoc(doc(asUser('x'), 'drafts/secret')))
    await assertSucceeds(getDoc(doc(asUser('x'), 'codes/KX47')))
  })

  it('blocks listing drafts and codes', async () => {
    await assertFails(getDocs(collection(asUser('x'), 'drafts')))
    await assertFails(getDocs(collection(asUser('x'), 'codes')))
  })

  it('blocks signed-out reads', async () => {
    await assertFails(getDoc(doc(anon(), 'drafts/secret')))
  })

  it('lets an open draft change but not a locked one', async () => {
    await assertSucceeds(updateDoc(doc(asUser('x'), 'drafts/open'), { title: 'New', expireAt }))
    await assertFails(updateDoc(doc(asUser('x'), 'drafts/secret'), { title: 'New', expireAt }))
  })

  it('blocks pointing a draft at someone else\'s room', async () => {
    await assertFails(updateDoc(doc(asUser('x'), 'drafts/open'), { roomId: 'r1', expireAt }))
  })
})

describe('opening a lobby', () => {
  it('writes room, code, draft and host together', async () => {
    await seed('lobby')
    const db = asUser('new-host')
    const batch = writeBatch(db)
    batch.set(doc(db, 'rooms/r2'), {
      title: 'T',
      hostUid: 'new-host',
      status: 'lobby',
      code: 'ZZ22',
      holes,
      endedAt: null,
      expireAt,
    })
    batch.set(doc(db, 'codes/ZZ22'), { roomId: 'r2', expireAt })
    batch.update(doc(db, 'drafts/open'), { roomId: 'r2', expireAt })
    batch.set(doc(db, 'rooms/r2/hosts/new-host'), { draftId: 'open', expireAt })
    await assertSucceeds(batch.commit())
  })
})

describe('hosts', () => {
  beforeEach(() => seed('lobby'))

  it('only lets hosts change status', async () => {
    await assertFails(updateDoc(doc(asUser('ann-uid'), 'rooms/r1'), { status: 'playing', expireAt }))
    await assertSucceeds(updateDoc(doc(asUser('host'), 'rooms/r1'), { status: 'playing', expireAt }))
  })

  it('blocks skipping or reversing status', async () => {
    await assertFails(updateDoc(doc(asUser('host'), 'rooms/r1'), { status: 'ended', expireAt }))
  })

  it('blocks a host changing the locked holes', async () => {
    await assertFails(
      updateDoc(doc(asUser('host'), 'rooms/r1'), { status: 'playing', holes: [], expireAt }),
    )
  })

  it('lets the draft link reclaim the game', async () => {
    const db = asUser('second-phone')
    await assertSucceeds(setDoc(doc(db, 'rooms/r1/hosts/second-phone'), { draftId: 'secret', expireAt }))
    await assertSucceeds(updateDoc(doc(db, 'rooms/r1'), { status: 'playing', expireAt }))
  })

  it('blocks reclaiming without the right draft', async () => {
    const db = asUser('x')
    await assertFails(setDoc(doc(db, 'rooms/r1/hosts/x'), { draftId: 'open', expireAt }))
    await assertFails(setDoc(doc(db, 'rooms/r1/hosts/x'), { draftId: 'missing', expireAt }))
  })
})

describe('joining', () => {
  it('allows joining in the lobby', async () => {
    await seed('lobby')
    await assertSucceeds(setDoc(doc(asUser('bob-uid'), 'rooms/r1/players/bob'), newPlayer('bob-uid')))
  })

  it('blocks late joins', async () => {
    await seed('playing')
    await assertFails(setDoc(doc(asUser('bob-uid'), 'rooms/r1/players/bob'), newPlayer('bob-uid')))
  })

  it('blocks joining with scores already filled in', async () => {
    await seed('lobby')
    await assertFails(
      setDoc(doc(asUser('bob-uid'), 'rooms/r1/players/bob'), {
        ...newPlayer('bob-uid'),
        sips: { 0: 1 },
      }),
    )
  })

  it('blocks joining as another device', async () => {
    await seed('lobby')
    await assertFails(setDoc(doc(asUser('bob-uid'), 'rooms/r1/players/bob'), newPlayer('other')))
  })
})

describe('scores', () => {
  const ann = (uid = 'ann-uid') => doc(asUser(uid), 'rooms/r1/players/ann')

  it('lets a player enter their own sips and tick', async () => {
    await seed('playing')
    await assertSucceeds(updateDoc(ann(), edit({ 0: 2 }, { 0: true }, 0)))
  })

  it('lets a player clear a score', async () => {
    await seed('playing')
    await assertSucceeds(updateDoc(ann(), edit({ 0: 2 }, {}, 0)))
    await assertSucceeds(updateDoc(ann(), edit({}, {}, 0)))
  })

  it('blocks scores before the game starts', async () => {
    await seed('lobby')
    await assertFails(updateDoc(ann(), edit({ 0: 2 }, {}, 0)))
  })

  it('locks scores once ended', async () => {
    await seed('ended')
    await assertFails(updateDoc(ann(), edit({ 0: 2 }, {}, 0)))
  })

  it('blocks editing another player', async () => {
    await seed('playing')
    await assertFails(updateDoc(ann('bob-uid'), edit({ 0: 2 }, {}, 0)))
  })

  it('blocks non-whole sips', async () => {
    await seed('playing')
    await assertFails(updateDoc(ann(), edit({ 0: 2.5 }, {}, 0)))
    await assertFails(updateDoc(ann(), edit({ 0: -1 }, {}, 0)))
  })

  it('blocks a tick on a hole with no challenge', async () => {
    await seed('playing')
    await assertFails(updateDoc(ann(), edit({ 1: 1 }, { 1: true }, 1)))
  })

  it('blocks a hole that does not exist', async () => {
    await seed('playing')
    await assertFails(updateDoc(ann(), edit({ 5: 1 }, {}, 5)))
  })

  it('blocks changing two holes at once', async () => {
    await seed('playing')
    await assertFails(updateDoc(ann(), edit({ 0: 1, 1: 1 }, {}, 0)))
  })

  it('blocks renaming through a score edit', async () => {
    await seed('playing')
    await assertFails(updateDoc(ann(), { ...edit({ 0: 1 }, {}, 0), name: 'Zed' }))
  })

  it('lets everyone in the room read every score', async () => {
    await seed('playing')
    await assertSucceeds(getDocs(collection(asUser('bob-uid'), 'rooms/r1/players')))
  })

  it('lets a rejoining player move their row', async () => {
    await seed('playing')
    await assertSucceeds(updateDoc(ann('new-phone'), { uid: 'new-phone' }))
  })

  it('blocks moving a row after the game ends', async () => {
    await seed('ended')
    await assertFails(updateDoc(ann('new-phone'), { uid: 'new-phone' }))
  })

  it('lets a host set expiry but not scores', async () => {
    await seed('playing')
    const db = asUser('host')
    await assertSucceeds(updateDoc(doc(db, 'rooms/r1/players/ann'), { expireAt }))
    await assertFails(updateDoc(doc(db, 'rooms/r1/players/ann'), edit({ 0: 1 }, {}, 0)))
  })
})
