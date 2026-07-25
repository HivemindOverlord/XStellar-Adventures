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

## Current gameplay loop

1. Register / log in.
2. Click **Find Match** — the server queues you until a second player joins.
3. Each player is auto-granted a starter character on first match.
4. Classic turn-based combat: turns are ordered by Speed; each player chooses Attack, Defend, or Flee on their turn.
5. Battle ends in victory, defeat, or a fled match.

This is an early scaffold. Notable things intentionally left as follow-up work:
- Skill/item actions (`BattleAction` types `skill`/`item` are defined but not yet implemented server-side)
- Persisting characters beyond the auto-created starter, leveling, and XP rewards after battle
- Real sprite/tileset art (battle scene currently renders placeholder rectangles)
- Reconnect handling if a player disconnects mid-battle
