# Pub Golf Maker

A web app for running a pub golf night. A host sets up bars, drinks, pars and bonus challenges. Players join from their phones, fill in a shared golf scorecard, and finish on a podium.

- Live site: https://pubgolf-maker.web.app
- Firebase project: `pubgolf-maker` on the free Spark plan, with Firestore in `africa-south1`
- Original design and rules: `Pub Golf Maker plan.md`. Its Status and TTL text may be out of date, so trust this file on how the app works today.

## Working rules

- Work only on `dev` and push to `origin dev`. No pull requests and no changes to `main`.
- No `Co-Authored-By` line in commits.
- Save anything the owner should look at, such as screenshots, to `_review/`, which git ignores.
- The Firebase web config in `.env.production` is public by design and is committed. The security rules protect the data.
- Run every `npm` and `firebase` command from this folder. `firebase-tools` is a project dev dependency, so `npx firebase` fails from anywhere else.

## Stack

Vite, React and TypeScript as a single-page app with no router library. Firebase provides Firestore, anonymous sign-in and Hosting. `vitest` runs the tests.

| Path | Job |
|---|---|
| `src/App.tsx` | Picks the page from the URL |
| `src/lib/nav.ts` | Small `navigate()` and `usePath()` helpers |
| `src/lib/scoring.ts` | Game rules, with no Firebase in it |
| `src/lib/firebase.ts` | Firebase setup and silent sign-in |
| `src/lib/game.ts` | All Firestore reads and writes, plus reconnect and cleanup |
| `src/pages/` | Home, Draft, Join, Room, Lobby, Card, Scoreboard |
| `src/components/` | ScoreCard table and ExitButton |
| `src/styles.css` | All styling. Colours are the variables at the top |
| `firestore.rules` | Security rules |
| `tests/firestore.rules.test.ts` | Rules tests, which need the emulator |
| `firebase.json` | Hosting, cache headers, emulators, auth providers |

Routes are `/`, `/draft/{secretId}`, `/join/{CODE}` and `/room/{roomId}`. `Room.tsx` subscribes to the game and shows Lobby, Card or Scoreboard by room status.

## Running it locally

Java 21 or newer is needed for the Firestore emulator. It's installed at `C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot`, and an older shell may still find Java 8 first.

```bash
npm install
```

In Git Bash, start the emulators:

```bash
PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.13.9-hotspot/bin:$PATH" npx firebase emulators:start --project demo-pubgolf
```

Then start the app in a second shell:

```bash
npm run dev
```

In the Claude desktop app, use `preview_start` with `pubgolf-emulators` and `pubgolf-web`. Those entries live in `Side Projects/.claude/launch.json`, one folder up.

`npm run dev` always talks to the emulators, because `.env.production` isn't loaded in dev. `npm run build` uses the real project. The first write after an emulator cold start can take several seconds, which isn't an app bug.

## Testing

```bash
npm test
```

```bash
npm run test:rules
```

`npm test` covers scoring. `npm run test:rules` needs the emulators running.

Test every screen change in real browsers. Use Playwright with `browser.newContext()` once per player, because each context gets its own anonymous user, and use a 390 by 844 viewport. Tabs in one context share a user and won't act as separate players.

To simulate a stalled connection, hold `**/Listen/channel**` with `page.route`, then toggle `context.setOffline`. Plain offline tests recover by themselves and won't show stall bugs.

## Deploying

Run the tests first, then:

```bash
npm run build
```

```bash
npx firebase deploy --only firestore,hosting --project pubgolf-maker --non-interactive
```

Use `--only hosting` if the rules didn't change. Hosting serves whatever is in `dist/`, so a deploy without a fresh build ships the old app. Check the result on the live site, and remember that test games left there stay in the real database until they expire.

## How the game works

Status moves from `lobby` to `playing` to `ended`.

1. Home creates `drafts/{secretId}`. The URL is the private link, and edits autosave.
2. Open the lobby runs one transaction that creates the room and its code, adds the first host and sets `roomId` on the draft. Bars are copied to `room.holes`, and the draft locks.
3. Players join in the lobby only. Their name, lowercased and URL-encoded, is their document ID, which keeps names unique.
4. Each player edits only their own row, one hole at a time.
5. Ending sets `ended`, which locks scores, and moves `expireAt` to 15 days ahead.

| Path | Holds |
|---|---|
| `drafts/{secretId}` | `title`, `bars`, `roomId`, `expireAt` |
| `codes/{CODE}` | `roomId`, `expireAt` |
| `rooms/{roomId}` | `title`, `hostUid`, `status`, `code`, `holes`, `endedAt`, `expireAt` |
| `rooms/{roomId}/hosts/{uid}` | `draftId`, `expireAt` |
| `rooms/{roomId}/players/{playerId}` | `name`, `uid`, `sips`, `ticks`, `lastHole`, `expireAt` |

`sips` and `ticks` are maps keyed by hole index, starting at 0. Ranking and the `E` and DNF labels live in `scoring.ts`, so use those functions rather than recomputing them.

Rejoining: a phone keeps its anonymous user and remembers its last game. On another phone, entering a taken name during a game asks "Is this you?", and confirming moves the row by changing `uid`. Without logins this can't prove identity, which the plan accepts. Exiting clears the remembered game but keeps the player's row, so the same name gets them back in.

A second device becomes host by opening the draft link, which creates a `hosts` document. The rules check that the `draftId` it supplies points at this room.

## Traps

- **Check the database exists before any Firestore deploy.** On a project with no database, a rules deploy creates one in `nam5` (US), and the location can't be changed afterwards. Deleting it is the owner's job, and the name then can't be reused for about three minutes.
- **TTL doesn't work on Spark.** Firestore returns 403 "billing disabled". Keep `fieldOverrides` empty in `firestore.indexes.json`, or the deploy fails.
- **Cleanup is run by the app.** `createDraft` calls `cleanUpExpired`, which removes up to 20 expired rooms each time someone hosts. Rooms must be deleted after their `players` and `hosts`, because the rules read the room to allow those deletes. New collections need an `expireAt` and a place in this cleanup.
- **Pages treat anything past `expireAt` as deleted**, even if the documents still exist.
- **Stalled listeners don't recover by themselves.** A phone can stay online while its live connection hangs. `Room.tsx` calls `reconnect()` on returning to view, on network return and every 15 seconds. Don't remove this without testing the stall above.
- **Cached snapshots can be empty.** On a slow connection Firestore can report an empty room or player list from its local cache. `watchRoom` and `watchPlayers` drop those, and `Room.tsx` only redirects a player when `fromServer` is true.
- **Score writes must change one hole.** The rules can't loop over a map, so `saveHole` sends `lastHole` and the rules check only that key. Anything that writes scores must follow this.
- **`room.holes` is locked.** Rules block hosts from changing it after the lobby opens.
- **Rules changes need tests.** Add allowed and blocked cases to `tests/firestore.rules.test.ts`. `assertFails` also passes on a typo in the rules, so include the matching allowed case.
- **Caching:** `firebase.json` sets `no-cache` on pages and long caching on `/assets/**`, so new deploys reach phones on next load. Don't remove it, or phones can run an old build for up to an hour.
- **Limits:** 30 bars, 60 characters for a game name, 24 for a player name and 99 sips per hole. They're in both the UI and the rules, so change both.

## Common changes

- **Game rule:** change `scoring.ts`, add a case in `scoring.test.ts`, then update the rules if a stored field changes.
- **New stored field:** add it to the types and writes in `game.ts`, then allow it in `firestore.rules`. Player rules and room updates use `hasOnly`, so an unlisted field is rejected there.
- **New screen:** add a page in `src/pages/` and a route in `App.tsx`, or a status branch in `Room.tsx`.
- **Look and feel:** edit `src/styles.css`. The scorecard stays calm and golf-like, while the lobby and podium stay loud.
