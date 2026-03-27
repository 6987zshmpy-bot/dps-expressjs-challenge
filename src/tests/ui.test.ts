import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

type TournamentStatus = 'planning' | 'started' | 'finished';

interface PlayerRecord {
	id: number;
	name: string;
	createdAt: string;
}

interface TournamentRecord {
	id: number;
	name: string;
	createdAt: string;
}

interface MatchRecord {
	id: number;
	tournamentId: number;
	playerOneId: number;
	playerTwoId: number;
	playerOneScore: number;
	playerTwoScore: number;
	playedAt: string;
}

function createMockApi() {
	let playerId = 1;
	let tournamentId = 1;
	let matchId = 1;
	const players: PlayerRecord[] = [];
	const tournaments: TournamentRecord[] = [];
	const tournamentPlayers = new Map<number, number[]>();
	const matches: MatchRecord[] = [];

	function currentTimestamp(): string {
		return '2026-03-26 18:00:00';
	}

	function getTournamentPlayers(currentTournamentId: number): PlayerRecord[] {
		const participantIds = tournamentPlayers.get(currentTournamentId) ?? [];

		return participantIds
			.map((participantId) =>
				players.find((player) => player.id === participantId),
			)
			.filter((player): player is PlayerRecord => Boolean(player))
			.sort(
				(left, right) =>
					left.name.localeCompare(right.name) || left.id - right.id,
			);
	}

	function expectedMatches(participantCount: number): number {
		return participantCount < 2
			? 0
			: (participantCount * (participantCount - 1)) / 2;
	}

	function getTournamentMatches(currentTournamentId: number): MatchRecord[] {
		return matches.filter(
			(match) => match.tournamentId === currentTournamentId,
		);
	}

	function getTournamentStatus(
		currentTournamentId: number,
	): TournamentStatus {
		const participants = getTournamentPlayers(currentTournamentId);
		const tournamentMatches = getTournamentMatches(currentTournamentId);
		const requiredMatches = expectedMatches(participants.length);

		if (tournamentMatches.length === 0) {
			return 'planning';
		}

		if (
			requiredMatches > 0 &&
			tournamentMatches.length >= requiredMatches
		) {
			return 'finished';
		}

		return 'started';
	}

	function getTournamentSummary(currentTournament: TournamentRecord) {
		const participants = getTournamentPlayers(currentTournament.id);
		const tournamentMatches = getTournamentMatches(currentTournament.id);

		return {
			id: currentTournament.id,
			name: currentTournament.name,
			createdAt: currentTournament.createdAt,
			participantCount: participants.length,
			matchesPlayed: tournamentMatches.length,
			expectedMatches: expectedMatches(participants.length),
			status: getTournamentStatus(currentTournament.id),
		};
	}

	function getLeaderboard(currentTournamentId: number) {
		const summary = getTournamentSummary(
			tournaments.find(
				(tournament) => tournament.id === currentTournamentId,
			)!,
		);
		const participants = getTournamentPlayers(currentTournamentId);
		const tournamentMatches = getTournamentMatches(currentTournamentId);

		const leaderboard = participants
			.map((participant) => {
				let points = 0;
				let wins = 0;
				let draws = 0;
				let losses = 0;
				let matchesPlayed = 0;

				tournamentMatches.forEach((match) => {
					const involved =
						match.playerOneId === participant.id ||
						match.playerTwoId === participant.id;

					if (!involved) {
						return;
					}

					matchesPlayed += 1;

					if (match.playerOneScore === match.playerTwoScore) {
						points += 1;
						draws += 1;
						return;
					}

					const won =
						(match.playerOneId === participant.id &&
							match.playerOneScore > match.playerTwoScore) ||
						(match.playerTwoId === participant.id &&
							match.playerTwoScore > match.playerOneScore);

					if (won) {
						points += 2;
						wins += 1;
					} else {
						losses += 1;
					}
				});

				return {
					playerId: participant.id,
					playerName: participant.name,
					points,
					matchesPlayed,
					wins,
					draws,
					losses,
				};
			})
			.sort(
				(left, right) =>
					right.points - left.points ||
					right.wins - left.wins ||
					right.draws - left.draws ||
					left.playerName.localeCompare(right.playerName) ||
					left.playerId - right.playerId,
			);

		return {
			...summary,
			leaderboard,
		};
	}

	function response(data: unknown, status = 200): Response {
		return new Response(JSON.stringify({ data }), {
			headers: { 'Content-Type': 'application/json' },
			status,
		});
	}

	function error(message: string, status = 400): Response {
		return new Response(JSON.stringify({ error: message }), {
			headers: { 'Content-Type': 'application/json' },
			status,
		});
	}

	return async function fetchMock(
		input: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> {
		const requestUrl =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		const url = new URL(requestUrl, 'http://localhost:3000');
		const method = (init?.method ?? 'GET').toUpperCase();
		const body =
			typeof init?.body === 'string' && init.body
				? JSON.parse(init.body)
				: undefined;

		if (method === 'GET' && url.pathname === '/players') {
			return response(
				[...players].sort((left, right) => right.id - left.id),
			);
		}

		if (method === 'POST' && url.pathname === '/players') {
			const player: PlayerRecord = {
				id: playerId,
				name: String(body.name).trim(),
				createdAt: currentTimestamp(),
			};
			playerId += 1;
			players.push(player);
			return response(player, 201);
		}

		if (method === 'GET' && url.pathname === '/tournaments') {
			return response(
				[...tournaments]
					.map(getTournamentSummary)
					.sort((left, right) => right.id - left.id),
			);
		}

		if (method === 'POST' && url.pathname === '/tournaments') {
			const tournament: TournamentRecord = {
				id: tournamentId,
				name: String(body.name).trim(),
				createdAt: currentTimestamp(),
			};
			tournamentId += 1;
			tournaments.push(tournament);
			tournamentPlayers.set(tournament.id, []);
			return response(getTournamentSummary(tournament), 201);
		}

		const tournamentMatch = url.pathname.match(
			/^\/tournaments\/(\d+)(?:\/(players|matches|leaderboard))?$/,
		);

		if (!tournamentMatch) {
			return error(`Route ${method} ${url.pathname} not found`, 404);
		}

		const currentTournamentId = Number(tournamentMatch[1]);
		const section = tournamentMatch[2];
		const tournament = tournaments.find(
			(entry) => entry.id === currentTournamentId,
		);

		if (!tournament) {
			return error(`Tournament ${currentTournamentId} not found`, 404);
		}

		if (method === 'GET' && !section) {
			return response({
				...getTournamentSummary(tournament),
				participants: getTournamentPlayers(currentTournamentId),
			});
		}

		if (method === 'POST' && section === 'players') {
			const currentStatus = getTournamentStatus(currentTournamentId);

			if (currentStatus !== 'planning') {
				return error(
					'Participants can only be added while the tournament is in planning',
					409,
				);
			}

			const currentPlayers =
				tournamentPlayers.get(currentTournamentId) ?? [];
			const newPlayerId = Number(body.playerId);

			if (currentPlayers.includes(newPlayerId)) {
				return error(
					`Player ${newPlayerId} is already registered for tournament ${currentTournamentId}`,
					409,
				);
			}

			currentPlayers.push(newPlayerId);
			tournamentPlayers.set(currentTournamentId, currentPlayers);

			return response(
				{
					...getTournamentSummary(tournament),
					participants: getTournamentPlayers(currentTournamentId),
				},
				201,
			);
		}

		if (method === 'POST' && section === 'matches') {
			const currentPlayers =
				tournamentPlayers.get(currentTournamentId) ?? [];
			const rawPlayerOneId = Number(body.playerOneId);
			const rawPlayerTwoId = Number(body.playerTwoId);
			const [normalizedPlayerOneId, normalizedPlayerTwoId] =
				rawPlayerOneId < rawPlayerTwoId
					? [rawPlayerOneId, rawPlayerTwoId]
					: [rawPlayerTwoId, rawPlayerOneId];
			const [normalizedPlayerOneScore, normalizedPlayerTwoScore] =
				rawPlayerOneId < rawPlayerTwoId
					? [Number(body.playerOneScore), Number(body.playerTwoScore)]
					: [
							Number(body.playerTwoScore),
							Number(body.playerOneScore),
						];

			if (normalizedPlayerOneId === normalizedPlayerTwoId) {
				return error('A player cannot play against themselves', 400);
			}

			if (
				!currentPlayers.includes(normalizedPlayerOneId) ||
				!currentPlayers.includes(normalizedPlayerTwoId)
			) {
				return error(
					'Both players must be registered in the tournament before recording a result',
					409,
				);
			}

			const duplicate = matches.some(
				(match) =>
					match.tournamentId === currentTournamentId &&
					match.playerOneId === normalizedPlayerOneId &&
					match.playerTwoId === normalizedPlayerTwoId,
			);

			if (duplicate) {
				return error(
					'Each pair of participants can only have one recorded match result',
					409,
				);
			}

			const match: MatchRecord = {
				id: matchId,
				tournamentId: currentTournamentId,
				playerOneId: normalizedPlayerOneId,
				playerTwoId: normalizedPlayerTwoId,
				playerOneScore: normalizedPlayerOneScore,
				playerTwoScore: normalizedPlayerTwoScore,
				playedAt: currentTimestamp(),
			};
			matchId += 1;
			matches.push(match);

			return response(
				{
					...match,
					winnerPlayerId:
						match.playerOneScore === match.playerTwoScore
							? null
							: match.playerOneScore > match.playerTwoScore
								? match.playerOneId
								: match.playerTwoId,
				},
				201,
			);
		}

		if (method === 'GET' && section === 'leaderboard') {
			return response(getLeaderboard(currentTournamentId));
		}

		if (method === 'GET' && section === 'matches') {
			return response(
				getTournamentMatches(currentTournamentId).map((match) => {
					const playerOne = players.find(
						(player) => player.id === match.playerOneId,
					)!;
					const playerTwo = players.find(
						(player) => player.id === match.playerTwoId,
					)!;

					return {
						...match,
						playerOneName: playerOne.name,
						playerTwoName: playerTwo.name,
						winnerPlayerId:
							match.playerOneScore === match.playerTwoScore
								? null
								: match.playerOneScore > match.playerTwoScore
									? match.playerOneId
									: match.playerTwoId,
					};
				}),
			);
		}

		return error(`Route ${method} ${url.pathname} not found`, 404);
	};
}

async function settle(window: {
	setTimeout: (
		handler: (...args: unknown[]) => void,
		timeout?: number,
	) => number;
}): Promise<void> {
	for (let index = 0; index < 6; index += 1) {
		await new Promise((resolve) => window.setTimeout(resolve, 0));
	}
}

test('browser UI keeps forms and dropdowns in sync with tournament state', async () => {
	const html = fs.readFileSync(
		path.resolve(__dirname, '../../public/index.html'),
		'utf8',
	);
	const fetchMock = createMockApi();
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		url: 'http://localhost:3000/',
		beforeParse(window) {
			window.fetch = fetchMock as typeof window.fetch;
		},
	});
	const { window } = dom;
	const { document } = window;

	await settle(window);

	const playerCount = document.getElementById('playerCount')!;
	const tournamentCount = document.getElementById('tournamentCount')!;
	const registrationSubmitButton = document.getElementById(
		'registrationSubmitButton',
	) as HTMLButtonElement;
	const matchSubmitButton = document.getElementById(
		'matchSubmitButton',
	) as HTMLButtonElement;
	const refreshTournamentButton = document.getElementById(
		'refreshTournamentButton',
	) as HTMLButtonElement;
	const playerForm = document.getElementById('playerForm') as HTMLFormElement;
	const tournamentForm = document.getElementById(
		'tournamentForm',
	) as HTMLFormElement;
	const registrationForm = document.getElementById(
		'registrationForm',
	) as HTMLFormElement;
	const matchForm = document.getElementById('matchForm') as HTMLFormElement;
	const playerNameInput = document.getElementById(
		'playerNameInput',
	) as HTMLInputElement;
	const tournamentNameInput = document.getElementById(
		'tournamentNameInput',
	) as HTMLInputElement;
	const registrationPlayerSelect = document.getElementById(
		'registrationPlayerSelect',
	) as HTMLSelectElement;
	const playerOneSelect = document.getElementById(
		'playerOneSelect',
	) as HTMLSelectElement;
	const playerTwoSelect = document.getElementById(
		'playerTwoSelect',
	) as HTMLSelectElement;
	const playerOneScoreInput = document.getElementById(
		'playerOneScoreInput',
	) as HTMLInputElement;
	const playerTwoScoreInput = document.getElementById(
		'playerTwoScoreInput',
	) as HTMLInputElement;
	const leaderboardContainer = document.getElementById(
		'leaderboardContainer',
	)!;
	const matchesContainer = document.getElementById('matchesContainer')!;
	const statusPill = document.getElementById('statusPill')!;
	const flash = document.getElementById('flash')!;

	assert.equal(playerCount.textContent, '0');
	assert.equal(tournamentCount.textContent, '0');
	assert.equal(refreshTournamentButton.disabled, true);
	assert.equal(registrationSubmitButton.disabled, true);
	assert.equal(matchSubmitButton.disabled, true);

	playerNameInput.value = 'Alice';
	playerForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	playerNameInput.value = 'Bob';
	playerForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	playerNameInput.value = 'Charlie <script>';
	playerForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	assert.equal(playerCount.textContent, '3');
	assert.match(flash.textContent ?? '', /Spieler angelegt/);
	assert.ok(
		document
			.getElementById('playersList')!
			.textContent!.includes('Charlie <script>'),
	);

	tournamentNameInput.value = 'Berlin Open';
	tournamentForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	assert.equal(tournamentCount.textContent, '1');
	assert.equal(refreshTournamentButton.disabled, false);
	assert.equal(registrationSubmitButton.disabled, false);

	registrationPlayerSelect.value = '1';
	registrationForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	assert.ok(
		document
			.getElementById('participantsList')!
			.textContent!.includes('Alice'),
	);

	registrationPlayerSelect.value = '2';
	registrationForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	registrationPlayerSelect.value = '3';
	registrationForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	assert.ok(
		document
			.getElementById('participantsList')!
			.textContent!.includes('Charlie <script>'),
	);
	assert.equal(registrationSubmitButton.disabled, true);
	assert.ok(
		(
			document.getElementById('registrationHelp')!.textContent ?? ''
		).includes('keine weiteren Spieler'),
	);

	assert.equal(playerOneSelect.disabled, false);
	assert.equal(playerTwoSelect.disabled, false);
	assert.equal(matchSubmitButton.disabled, false);

	playerOneSelect.value = '1';
	playerOneSelect.dispatchEvent(
		new window.Event('change', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	const playerTwoValuesBeforeMatch = Array.from(playerTwoSelect.options).map(
		(option) => option.value,
	);
	assert.deepEqual(playerTwoValuesBeforeMatch.sort(), ['2', '3']);

	playerTwoSelect.value = '2';
	playerOneScoreInput.value = '2';
	playerTwoScoreInput.value = '0';
	matchForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	playerOneSelect.value = '1';
	playerOneSelect.dispatchEvent(
		new window.Event('change', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	const playerTwoValuesAfterFirstMatch = Array.from(
		playerTwoSelect.options,
	).map((option) => option.value);
	assert.deepEqual(playerTwoValuesAfterFirstMatch, ['3']);

	playerOneSelect.value = '1';
	playerOneSelect.dispatchEvent(
		new window.Event('change', { bubbles: true, cancelable: true }),
	);
	await settle(window);
	playerTwoSelect.value = '3';
	playerOneScoreInput.value = '1';
	playerTwoScoreInput.value = '1';
	matchForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	playerOneSelect.value = '2';
	playerOneSelect.dispatchEvent(
		new window.Event('change', { bubbles: true, cancelable: true }),
	);
	await settle(window);
	playerTwoSelect.value = '3';
	playerOneScoreInput.value = '4';
	playerTwoScoreInput.value = '2';
	matchForm.dispatchEvent(
		new window.Event('submit', { bubbles: true, cancelable: true }),
	);
	await settle(window);

	assert.equal(matchSubmitButton.disabled, true);
	assert.ok(
		(document.getElementById('matchHelp')!.textContent ?? '').includes(
			'keine offenen Paarungen',
		),
	);
	assert.equal(statusPill.textContent, 'finished');
	assert.ok(leaderboardContainer.textContent!.includes('Bob'));
	assert.ok(matchesContainer.textContent!.includes('Alice 2:0 Bob'));
	assert.ok(
		matchesContainer.textContent!.includes('Bob 4:2 Charlie <script>'),
	);

	dom.window.close();
});
