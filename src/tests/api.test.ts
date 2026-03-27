import assert from 'assert/strict';
import { once } from 'events';
import fs from 'fs';
import { Server } from 'http';
import os from 'os';
import path from 'path';
import test, { after, before } from 'node:test';
import type { Express } from 'express';

let app: Express;
let server: Server;
let baseUrl: string;
let tempDirectory: string;
let closeDatabase: () => void;

async function request(pathname: string, init?: RequestInit) {
	const response = await fetch(`${baseUrl}${pathname}`, init);
	const body = (await response.json()) as {
		data?: unknown;
		error?: string;
	};

	return {
		status: response.status,
		body,
	};
}

before(async () => {
	tempDirectory = fs.mkdtempSync(
		path.join(os.tmpdir(), 'dps-expressjs-test-'),
	);
	process.env.DATABASE_PATH = path.join(tempDirectory, 'test.sqlite3');

	const appModule = await import('../app');
	const dbModule = await import('../services/db.service');

	app = appModule.createApp();
	closeDatabase = dbModule.default.close;
	server = app.listen(0, '127.0.0.1');

	await once(server, 'listening');

	const address = server.address();

	if (!address || typeof address === 'string') {
		throw new Error('Failed to determine the test server address');
	}

	baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
	if (server.listening) {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	closeDatabase();
	fs.rmSync(tempDirectory, { force: true, recursive: true });
});

test('supports a tournament lifecycle including validation errors', async () => {
	const playerOne = await request('/players', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: 'Alice' }),
	});
	const playerTwo = await request('/players', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: 'Bob' }),
	});
	const tournament = await request('/tournaments', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: 'Berlin Open' }),
	});

	assert.equal(playerOne.status, 201);
	assert.equal(playerTwo.status, 201);
	assert.equal(tournament.status, 201);

	const playerOneId = (playerOne.body.data as { id: number }).id;
	const playerTwoId = (playerTwo.body.data as { id: number }).id;
	const tournamentId = (tournament.body.data as { id: number }).id;

	const registrationOne = await request(
		`/tournaments/${tournamentId}/players`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerId: playerOneId }),
		},
	);
	const registrationTwo = await request(
		`/tournaments/${tournamentId}/players`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerId: playerTwoId }),
		},
	);
	const match = await request(`/tournaments/${tournamentId}/matches`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			playerOneId,
			playerTwoId,
			playerOneScore: 2,
			playerTwoScore: 2,
		}),
	});
	const duplicateMatch = await request(
		`/tournaments/${tournamentId}/matches`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				playerOneId,
				playerTwoId,
				playerOneScore: 1,
				playerTwoScore: 0,
			}),
		},
	);
	const leaderboard = await request(
		`/tournaments/${tournamentId}/leaderboard`,
	);
	const matches = await request(`/tournaments/${tournamentId}/matches`);
	const invalidJson = await fetch(`${baseUrl}/players`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{"name":',
	});
	const invalidJsonBody = (await invalidJson.json()) as { error: string };

	assert.equal(registrationOne.status, 201);
	assert.equal(registrationTwo.status, 201);
	assert.equal(match.status, 201);
	assert.equal(duplicateMatch.status, 409);
	assert.equal(leaderboard.status, 200);
	assert.equal(matches.status, 200);
	assert.equal(invalidJson.status, 400);
	assert.equal(invalidJsonBody.error, 'Request body contains invalid JSON');

	assert.equal(
		(duplicateMatch.body as { error: string }).error,
		'Each pair of participants can only have one recorded match result',
	);

	const leaderboardData = leaderboard.body.data as {
		status: string;
		expectedMatches: number;
		leaderboard: Array<{ playerName: string; points: number }>;
	};
	const matchesData = matches.body.data as Array<{
		playerOneName: string;
		playerTwoName: string;
		winnerPlayerId: number | null;
	}>;
	const compactMatches = matchesData.map(
		({ playerOneName, playerTwoName, winnerPlayerId }) => ({
			playerOneName,
			playerTwoName,
			winnerPlayerId,
		}),
	);
	const compactLeaderboard = leaderboardData.leaderboard.map(
		({ playerName, points }) => ({
			playerName,
			points,
		}),
	);

	assert.equal(leaderboardData.status, 'finished');
	assert.equal(leaderboardData.expectedMatches, 1);
	assert.deepEqual(compactLeaderboard, [
		{ playerName: 'Alice', points: 1 },
		{ playerName: 'Bob', points: 1 },
	]);
	assert.deepEqual(compactMatches, [
		{
			playerOneName: 'Alice',
			playerTwoName: 'Bob',
			winnerPlayerId: null,
		},
	]);
});
