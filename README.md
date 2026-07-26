# XStellar Adventures

A multiplayer, turn-based JRPG built for the browser: 2D pixel-art battles, real-time PvP over WebSockets, and persistent characters.

## Stack

- **Client**: TypeScript, React, [Phaser 3](https://phaser.io/) (2D rendering), Vite, Socket.io client
- **Server**: TypeScript, Node.js, Express, Socket.io, Prisma
- **Database**: PostgreSQL
- **Auth**: JWT (email/password to start)

## Project structure

```
xstellar-adventures/
├── client/    React + Phaser front end
├── server/    Express + Socket.io API and game server
└── shared/    TypeScript types shared by client and server
    (Character, BattleState, Socket.io event contracts, auth payloads)
```

`client` and `server` both depend on `@xstellar/shared` via an npm workspace, so changes to shared types are immediately visible to both.

## Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (local or hosted)

### Setup

```bash
npm install

# Configure the server
cp server/.env.example server/.env
# edit server/.env with your DATABASE_URL and a real JWT_SECRET

# Configure the client (defaults are fine for local dev)
cp client/.env.example client/.env

# Create the database schema
npm run prisma:migrate -w server
```

### Run in development

In two terminals:

```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

Open two browser windows/tabs at `http://localhost:5173`, register two different accounts, and click **Find Match** in both to start a PvP battle.

### Build

```bash
npm run build
```

## Cloud deployment & Android app

The client is also wrapped as a native Android app via [Capacitor](https://capacitorjs.com/) (`client/android/`), configured to load the live-hosted web build in its WebView — so most updates (features, art, balance) ship instantly to the installed app with a normal `git push`, no store review. Native-only changes go out through a GitHub Actions workflow that builds, signs, and publishes to Google Play.

See [CLOUD_SETUP.md](./CLOUD_SETUP.md) for the one-time setup (Neon, Railway, Vercel, Google Play service account, GitHub secrets) and how releases work going forward.

## UI clarity convention

The client intentionally has no forced tutorial — new screens are expected to explain
themselves through in-context copy and empty-state messaging instead. See
[CLARITY.md](./CLARITY.md) for the convention to follow when adding a new screen or panel,
and the in-app **How to Play** reference (`client/src/ui/HowToPlayPanel.tsx`, linked from
`GameScreen`'s header) for the player-facing version.

## Current gameplay loop

1. Register / log in.
2. Click **Find Match** — the server queues you until a second player joins.
3. Each player is auto-granted a starter character on first match.
4. Classic turn-based combat: turns are ordered by Speed; each player chooses Attack, Defend, Skill, Item, or Flee on their turn.
5. Battle ends in victory, defeat, or a fled match — winners and losers both earn XP, and characters level up (with stat growth) and keep their inventory between matches.
6. If a player disconnects mid-battle, they have 45 seconds to reconnect and resume before forfeiting.

This is an early scaffold. Notable things intentionally left as follow-up work:
- Real sprite/tileset art (battle scene currently renders placeholder rectangles)
- A full class/specialization system (currently 4 fixed job classes with one skill each)
- Equipment/gear beyond the starting consumable items
