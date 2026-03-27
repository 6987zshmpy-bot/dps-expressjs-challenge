# DPS Backend Coding Challenge

Round-robin tournament service built with `Express`, `TypeScript` and `SQLite`.

## Author

Developed by `Niklas Hinz` with support from `Codex` as a development tool.

## Features

- Create players
- Create tournaments
- Add players to tournaments
- Record exactly one result per player pairing
- Return tournament status and leaderboard in one endpoint
- List recorded matches for a tournament
- Configurable SQLite database path for local, demo and test environments
- Automated integration test for the main tournament workflow

## Stack

- Node.js
- Express 5
- TypeScript
- SQLite via `better-sqlite3`

## Run Locally

```bash
npm install
npm run dev
```

The server starts on `http://localhost:3000`.

Opening `http://localhost:3000` in a browser shows a small interactive UI for creating players and tournaments, adding participants, entering match results and viewing the leaderboard.

For a production-style run:

```bash
npm run build
npm start
```

Run the automated API test:

```bash
npm test
```

Optional environment variables:

```bash
PORT=3000
DATABASE_PATH=./db/db.sqlite3
```

## API

### `GET /health`

Health check endpoint.

### `GET /players`

Returns all players.

### `POST /players`

Creates a player.

Request body:

```json
{
	"name": "Alice"
}
```

### `GET /tournaments`

Returns all tournaments with participant count, played matches, expected matches and status.

### `POST /tournaments`

Creates a tournament.

Request body:

```json
{
	"name": "Spring Cup"
}
```

### `GET /tournaments/:tournamentId`

Returns tournament details and registered participants.

### `POST /tournaments/:tournamentId/players`

Registers a player for a tournament.

Request body:

```json
{
	"playerId": 1
}
```

### `POST /tournaments/:tournamentId/matches`

Records a match result between two registered tournament participants.

Request body:

```json
{
	"playerOneId": 1,
	"playerTwoId": 2,
	"playerOneScore": 3,
	"playerTwoScore": 1
}
```

### `GET /tournaments/:tournamentId/matches`

Returns the recorded matches of a tournament including player names and winner information.

### `GET /tournaments/:tournamentId/leaderboard`

Returns the tournament status together with the current leaderboard.

### `GET /tournaments/:tournamentId/status`

Alias for the leaderboard endpoint above.

## Example Flow

```bash
curl -X POST http://localhost:3000/players \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice"}'

curl -X POST http://localhost:3000/players \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'

curl -X POST http://localhost:3000/tournaments \
  -H "Content-Type: application/json" \
  -d '{"name":"Berlin Open"}'

curl -X POST http://localhost:3000/tournaments/1/players \
  -H "Content-Type: application/json" \
  -d '{"playerId":1}'

curl -X POST http://localhost:3000/tournaments/1/players \
  -H "Content-Type: application/json" \
  -d '{"playerId":2}'

curl -X POST http://localhost:3000/tournaments/1/matches \
  -H "Content-Type: application/json" \
  -d '{"playerOneId":1,"playerTwoId":2,"playerOneScore":2,"playerTwoScore":2}'

curl http://localhost:3000/tournaments/1/leaderboard
```

## Status Rules

- `planning`: no results have been recorded yet
- `started`: at least one result exists, but not all round-robin matches are completed
- `finished`: all required pairings for the current participant set have a result

## Assumptions

- A tournament can have at most `5` participants
- Participants can only be added while the tournament is still in `planning`
- Each pair of participants can only have one recorded result
- Points are calculated as `2` for a win, `1` for a draw, `0` for a loss

## Implementation Notes

- The Express application is created in [src/app.ts](/Users/niklashinz/VS Code/dps-expressjs-challenge/dps-expressjs-challenge/src/app.ts) so it can be started normally and also tested automatically
- The database path can be switched via `DATABASE_PATH`, which makes isolated test databases possible
- Invalid JSON and unknown routes return explicit API errors instead of generic failures

## Persistence

The application stores data in [db/db.sqlite3](/Users/niklashinz/VS Code/dps-expressjs-challenge/dps-expressjs-challenge/db/db.sqlite3). The service creates the required tournament tables automatically on startup.
