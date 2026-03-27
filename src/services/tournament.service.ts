import { HttpError } from '../errors/http-error';
import db from './db.service';

const MAX_PARTICIPANTS = 5;

export type TournamentStatus = 'planning' | 'started' | 'finished';

export interface Player {
	id: number;
	name: string;
	createdAt: string;
}

export interface TournamentSummary {
	id: number;
	name: string;
	createdAt: string;
	participantCount: number;
	matchesPlayed: number;
	expectedMatches: number;
	status: TournamentStatus;
}

export interface TournamentDetail extends TournamentSummary {
	participants: Player[];
}

export interface LeaderboardEntry {
	playerId: number;
	playerName: string;
	points: number;
	matchesPlayed: number;
	wins: number;
	draws: number;
	losses: number;
}

export interface TournamentLeaderboard extends TournamentSummary {
	leaderboard: LeaderboardEntry[];
}

export interface MatchResult {
	id: number;
	tournamentId: number;
	playerOneId: number;
	playerTwoId: number;
	playerOneScore: number;
	playerTwoScore: number;
	playedAt: string;
	winnerPlayerId: number | null;
}

export interface TournamentMatch extends MatchResult {
	playerOneName: string;
	playerTwoName: string;
}

interface PlayerRow {
	id: number;
	name: string;
	createdAt: string;
}

interface TournamentSummaryRow {
	id: number;
	name: string;
	createdAt: string;
	participantCount: number;
	matchesPlayed: number;
}

interface LeaderboardRow {
	playerId: number;
	playerName: string;
	points: number;
	matchesPlayed: number;
	wins: number;
	draws: number;
	losses: number;
}

interface MatchRow {
	id: number;
	tournamentId: number;
	playerOneId: number;
	playerTwoId: number;
	playerOneScore: number;
	playerTwoScore: number;
	playedAt: string;
}

interface TournamentMatchRow extends MatchRow {
	playerOneName: string;
	playerTwoName: string;
}

function normalizeName(value: unknown, fieldName: string): string {
	if (typeof value !== 'string') {
		throw new HttpError(400, `${fieldName} must be a string`);
	}

	const normalizedName = value.trim();

	if (!normalizedName) {
		throw new HttpError(400, `${fieldName} must not be empty`);
	}

	return normalizedName;
}

function normalizeScore(value: unknown, fieldName: string): number {
	if (!Number.isInteger(value) || Number(value) < 0) {
		throw new HttpError(400, `${fieldName} must be a non-negative integer`);
	}

	return Number(value);
}

function expectedMatchCount(participantCount: number): number {
	return participantCount < 2
		? 0
		: (participantCount * (participantCount - 1)) / 2;
}

function deriveStatus(
	participantCount: number,
	matchesPlayed: number,
): TournamentStatus {
	const expectedMatches = expectedMatchCount(participantCount);

	if (matchesPlayed === 0) {
		return 'planning';
	}

	if (expectedMatches > 0 && matchesPlayed >= expectedMatches) {
		return 'finished';
	}

	return 'started';
}

function mapTournamentSummary(row: TournamentSummaryRow): TournamentSummary {
	const participantCount = Number(row.participantCount);
	const matchesPlayed = Number(row.matchesPlayed);

	return {
		id: Number(row.id),
		name: row.name,
		createdAt: row.createdAt,
		participantCount,
		matchesPlayed,
		expectedMatches: expectedMatchCount(participantCount),
		status: deriveStatus(participantCount, matchesPlayed),
	};
}

function mapLeaderboardRow(row: LeaderboardRow): LeaderboardEntry {
	return {
		playerId: Number(row.playerId),
		playerName: row.playerName,
		points: Number(row.points),
		matchesPlayed: Number(row.matchesPlayed),
		wins: Number(row.wins),
		draws: Number(row.draws),
		losses: Number(row.losses),
	};
}

function mapMatchRow(row: MatchRow): MatchResult {
	let winnerPlayerId: number | null = null;

	if (row.playerOneScore > row.playerTwoScore) {
		winnerPlayerId = Number(row.playerOneId);
	}

	if (row.playerTwoScore > row.playerOneScore) {
		winnerPlayerId = Number(row.playerTwoId);
	}

	return {
		id: Number(row.id),
		tournamentId: Number(row.tournamentId),
		playerOneId: Number(row.playerOneId),
		playerTwoId: Number(row.playerTwoId),
		playerOneScore: Number(row.playerOneScore),
		playerTwoScore: Number(row.playerTwoScore),
		playedAt: row.playedAt,
		winnerPlayerId,
	};
}

function mapTournamentMatchRow(row: TournamentMatchRow): TournamentMatch {
	return {
		...mapMatchRow(row),
		playerOneName: row.playerOneName,
		playerTwoName: row.playerTwoName,
	};
}

function getTournamentSummaryRow(
	tournamentId: number,
): TournamentSummaryRow | undefined {
	return db.get<TournamentSummaryRow>(
		`
			SELECT
				t.id,
				t.name,
				t.created_at AS createdAt,
				COUNT(DISTINCT tp.player_id) AS participantCount,
				COUNT(DISTINCT m.id) AS matchesPlayed
			FROM tournaments t
			LEFT JOIN tournament_players tp
				ON tp.tournament_id = t.id
			LEFT JOIN matches m
				ON m.tournament_id = t.id
			WHERE t.id = @tournamentId
			GROUP BY t.id, t.name, t.created_at
		`,
		{ tournamentId },
	);
}

function getTournamentSummaryOrThrow(tournamentId: number): TournamentSummary {
	const tournament = getTournamentSummaryRow(tournamentId);

	if (!tournament) {
		throw new HttpError(404, `Tournament ${tournamentId} not found`);
	}

	return mapTournamentSummary(tournament);
}

function getPlayerOrThrow(playerId: number): Player {
	const player = db.get<PlayerRow>(
		`
			SELECT
				id,
				name,
				created_at AS createdAt
			FROM players
			WHERE id = @playerId
		`,
		{ playerId },
	);

	if (!player) {
		throw new HttpError(404, `Player ${playerId} not found`);
	}

	return player;
}

function getTournamentParticipants(tournamentId: number): Player[] {
	return db.query<PlayerRow>(
		`
			SELECT
				p.id,
				p.name,
				p.created_at AS createdAt
			FROM tournament_players tp
			INNER JOIN players p
				ON p.id = tp.player_id
			WHERE tp.tournament_id = @tournamentId
			ORDER BY p.name ASC, p.id ASC
		`,
		{ tournamentId },
	);
}

function getLeaderboardEntries(tournamentId: number): LeaderboardEntry[] {
	return db
		.query<LeaderboardRow>(
			`
				SELECT
					p.id AS playerId,
					p.name AS playerName,
					COALESCE(
						SUM(
							CASE
								WHEN m.id IS NULL THEN 0
								WHEN m.player_one_score = m.player_two_score THEN 1
								WHEN m.player_one_id = p.id AND m.player_one_score > m.player_two_score THEN 2
								WHEN m.player_two_id = p.id AND m.player_two_score > m.player_one_score THEN 2
								ELSE 0
							END
						),
						0
					) AS points,
					COALESCE(SUM(CASE WHEN m.id IS NULL THEN 0 ELSE 1 END), 0) AS matchesPlayed,
					COALESCE(
						SUM(
							CASE
								WHEN m.player_one_id = p.id AND m.player_one_score > m.player_two_score THEN 1
								WHEN m.player_two_id = p.id AND m.player_two_score > m.player_one_score THEN 1
								ELSE 0
							END
						),
						0
					) AS wins,
					COALESCE(
						SUM(
							CASE
								WHEN m.id IS NOT NULL AND m.player_one_score = m.player_two_score THEN 1
								ELSE 0
							END
						),
						0
					) AS draws,
					COALESCE(
						SUM(
							CASE
								WHEN m.player_one_id = p.id AND m.player_one_score < m.player_two_score THEN 1
								WHEN m.player_two_id = p.id AND m.player_two_score < m.player_one_score THEN 1
								ELSE 0
							END
						),
						0
					) AS losses
				FROM tournament_players tp
				INNER JOIN players p
					ON p.id = tp.player_id
				LEFT JOIN matches m
					ON m.tournament_id = tp.tournament_id
					AND (m.player_one_id = p.id OR m.player_two_id = p.id)
				WHERE tp.tournament_id = @tournamentId
				GROUP BY p.id, p.name
				ORDER BY points DESC, wins DESC, draws DESC, p.name ASC, p.id ASC
			`,
			{ tournamentId },
		)
		.map(mapLeaderboardRow);
}

function canonicalizeMatchInput(
	playerOneId: number,
	playerTwoId: number,
	playerOneScore: number,
	playerTwoScore: number,
) {
	if (playerOneId < playerTwoId) {
		return {
			playerOneId,
			playerTwoId,
			playerOneScore,
			playerTwoScore,
		};
	}

	return {
		playerOneId: playerTwoId,
		playerTwoId: playerOneId,
		playerOneScore: playerTwoScore,
		playerTwoScore: playerOneScore,
	};
}

function getLastInsertedMatch(): MatchResult {
	const match = db.get<MatchRow>(
		`
			SELECT
				id,
				tournament_id AS tournamentId,
				player_one_id AS playerOneId,
				player_two_id AS playerTwoId,
				player_one_score AS playerOneScore,
				player_two_score AS playerTwoScore,
				played_at AS playedAt
			FROM matches
			WHERE id = last_insert_rowid()
		`,
	);

	if (!match) {
		throw new Error('Failed to read the newly created match');
	}

	return mapMatchRow(match);
}

function getLastInsertedPlayer(): Player {
	const player = db.get<PlayerRow>(
		`
			SELECT
				id,
				name,
				created_at AS createdAt
			FROM players
			WHERE id = last_insert_rowid()
		`,
	);

	if (!player) {
		throw new Error('Failed to read the newly created player');
	}

	return player;
}

function getLastInsertedTournament(): TournamentSummary {
	const tournament = db.get<TournamentSummaryRow>(
		`
			SELECT
				id,
				name,
				created_at AS createdAt,
				0 AS participantCount,
				0 AS matchesPlayed
			FROM tournaments
			WHERE id = last_insert_rowid()
		`,
	);

	if (!tournament) {
		throw new Error('Failed to read the newly created tournament');
	}

	return mapTournamentSummary(tournament);
}

export function initializeTournamentSchema(): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS players (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS tournaments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS tournament_players (
			tournament_id INTEGER NOT NULL,
			player_id INTEGER NOT NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (tournament_id, player_id),
			FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
			FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS matches (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tournament_id INTEGER NOT NULL,
			player_one_id INTEGER NOT NULL,
			player_two_id INTEGER NOT NULL,
			player_one_score INTEGER NOT NULL CHECK (player_one_score >= 0),
			player_two_score INTEGER NOT NULL CHECK (player_two_score >= 0),
			played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (tournament_id, player_one_id, player_two_id),
			FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
			FOREIGN KEY (player_one_id) REFERENCES players(id) ON DELETE CASCADE,
			FOREIGN KEY (player_two_id) REFERENCES players(id) ON DELETE CASCADE,
			CHECK (player_one_id <> player_two_id)
		);

		CREATE INDEX IF NOT EXISTS idx_tournament_players_player_id
			ON tournament_players(player_id);

		CREATE INDEX IF NOT EXISTS idx_matches_tournament_id
			ON matches(tournament_id);
	`);
}

export function listPlayers(): Player[] {
	return db.query<PlayerRow>(
		`
			SELECT
				id,
				name,
				created_at AS createdAt
			FROM players
			ORDER BY created_at DESC, id DESC
		`,
	);
}

export function createPlayer(name: unknown): Player {
	const normalizedName = normalizeName(name, 'name');

	return db.withTransaction(() => {
		db.run(
			`
				INSERT INTO players (name)
				VALUES (@name)
			`,
			{ name: normalizedName },
		);

		return getLastInsertedPlayer();
	});
}

export function listTournaments(): TournamentSummary[] {
	return db
		.query<TournamentSummaryRow>(
			`
				SELECT
					t.id,
					t.name,
					t.created_at AS createdAt,
					COUNT(DISTINCT tp.player_id) AS participantCount,
					COUNT(DISTINCT m.id) AS matchesPlayed
				FROM tournaments t
				LEFT JOIN tournament_players tp
					ON tp.tournament_id = t.id
				LEFT JOIN matches m
					ON m.tournament_id = t.id
				GROUP BY t.id, t.name, t.created_at
				ORDER BY t.created_at DESC, t.id DESC
			`,
		)
		.map(mapTournamentSummary);
}

export function createTournament(name: unknown): TournamentSummary {
	const normalizedName = normalizeName(name, 'name');

	return db.withTransaction(() => {
		db.run(
			`
				INSERT INTO tournaments (name)
				VALUES (@name)
			`,
			{ name: normalizedName },
		);

		return getLastInsertedTournament();
	});
}

export function getTournamentDetail(tournamentId: number): TournamentDetail {
	const tournament = getTournamentSummaryOrThrow(tournamentId);

	return {
		...tournament,
		participants: getTournamentParticipants(tournamentId),
	};
}

export function addPlayerToTournament(
	tournamentId: number,
	playerId: number,
): TournamentDetail {
	return db.withTransaction(() => {
		const tournament = getTournamentSummaryOrThrow(tournamentId);
		const player = getPlayerOrThrow(playerId);

		if (tournament.matchesPlayed > 0) {
			throw new HttpError(
				409,
				'Participants can only be added while the tournament is in planning',
			);
		}

		if (tournament.participantCount >= MAX_PARTICIPANTS) {
			throw new HttpError(
				409,
				`A tournament can have at most ${MAX_PARTICIPANTS} participants`,
			);
		}

		const existingParticipant = db.get<{ playerId: number }>(
			`
				SELECT player_id AS playerId
				FROM tournament_players
				WHERE tournament_id = @tournamentId
					AND player_id = @playerId
			`,
			{ tournamentId, playerId },
		);

		if (existingParticipant) {
			throw new HttpError(
				409,
				`Player ${player.id} is already registered for tournament ${tournamentId}`,
			);
		}

		db.run(
			`
				INSERT INTO tournament_players (tournament_id, player_id)
				VALUES (@tournamentId, @playerId)
			`,
			{ tournamentId, playerId },
		);

		return getTournamentDetail(tournamentId);
	});
}

export function recordMatchResult(
	tournamentId: number,
	playerOneId: number,
	playerTwoId: number,
	playerOneScore: unknown,
	playerTwoScore: unknown,
): MatchResult {
	if (playerOneId === playerTwoId) {
		throw new HttpError(400, 'A player cannot play against themselves');
	}

	const normalizedPlayerOneScore = normalizeScore(
		playerOneScore,
		'playerOneScore',
	);
	const normalizedPlayerTwoScore = normalizeScore(
		playerTwoScore,
		'playerTwoScore',
	);

	return db.withTransaction(() => {
		const tournament = getTournamentSummaryOrThrow(tournamentId);

		if (tournament.participantCount < 2) {
			throw new HttpError(
				409,
				'At least two participants must be registered before recording results',
			);
		}

		const participants = getTournamentParticipants(tournamentId);
		const participantIds = new Set(
			participants.map((participant) => participant.id),
		);

		if (
			!participantIds.has(playerOneId) ||
			!participantIds.has(playerTwoId)
		) {
			throw new HttpError(
				409,
				'Both players must be registered in the tournament before recording a result',
			);
		}

		const canonicalMatch = canonicalizeMatchInput(
			playerOneId,
			playerTwoId,
			normalizedPlayerOneScore,
			normalizedPlayerTwoScore,
		);
		const existingMatch = db.get<{ id: number }>(
			`
				SELECT id
				FROM matches
				WHERE tournament_id = @tournamentId
					AND player_one_id = @playerOneId
					AND player_two_id = @playerTwoId
			`,
			{
				tournamentId,
				playerOneId: canonicalMatch.playerOneId,
				playerTwoId: canonicalMatch.playerTwoId,
			},
		);

		if (existingMatch) {
			throw new HttpError(
				409,
				'Each pair of participants can only have one recorded match result',
			);
		}

		db.run(
			`
				INSERT INTO matches (
					tournament_id,
					player_one_id,
					player_two_id,
					player_one_score,
					player_two_score
				)
				VALUES (
					@tournamentId,
					@playerOneId,
					@playerTwoId,
					@playerOneScore,
					@playerTwoScore
				)
			`,
			{
				tournamentId,
				playerOneId: canonicalMatch.playerOneId,
				playerTwoId: canonicalMatch.playerTwoId,
				playerOneScore: canonicalMatch.playerOneScore,
				playerTwoScore: canonicalMatch.playerTwoScore,
			},
		);

		return getLastInsertedMatch();
	});
}

export function getTournamentLeaderboard(
	tournamentId: number,
): TournamentLeaderboard {
	const tournament = getTournamentSummaryOrThrow(tournamentId);

	return {
		...tournament,
		leaderboard: getLeaderboardEntries(tournamentId),
	};
}

export function listTournamentMatches(tournamentId: number): TournamentMatch[] {
	getTournamentSummaryOrThrow(tournamentId);

	return db
		.query<TournamentMatchRow>(
			`
				SELECT
					m.id,
					m.tournament_id AS tournamentId,
					m.player_one_id AS playerOneId,
					m.player_two_id AS playerTwoId,
					m.player_one_score AS playerOneScore,
					m.player_two_score AS playerTwoScore,
					m.played_at AS playedAt,
					player_one.name AS playerOneName,
					player_two.name AS playerTwoName
				FROM matches m
				INNER JOIN players player_one
					ON player_one.id = m.player_one_id
				INNER JOIN players player_two
					ON player_two.id = m.player_two_id
				WHERE m.tournament_id = @tournamentId
				ORDER BY m.played_at DESC, m.id DESC
			`,
			{ tournamentId },
		)
		.map(mapTournamentMatchRow);
}
