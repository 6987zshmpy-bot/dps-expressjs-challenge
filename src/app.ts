import express, { Express, NextFunction, Request, Response } from 'express';
import path from 'path';
import { HttpError, isHttpError } from './errors/http-error';
import {
	addPlayerToTournament,
	createPlayer,
	createTournament,
	getTournamentDetail,
	getTournamentLeaderboard,
	initializeTournamentSchema,
	listPlayers,
	listTournamentMatches,
	listTournaments,
	recordMatchResult,
} from './services/tournament.service';

function parsePositiveInteger(value: unknown, fieldName: string): number {
	const parsedValue = Number(value);

	if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
		throw new HttpError(400, `${fieldName} must be a positive integer`);
	}

	return parsedValue;
}

function handleRoute(
	handler: (req: Request, res: Response, next: NextFunction) => void,
) {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			handler(req, res, next);
		} catch (error) {
			next(error);
		}
	};
}

function isJsonSyntaxError(
	error: unknown,
): error is SyntaxError & { status: number } {
	return (
		error instanceof SyntaxError &&
		'status' in error &&
		typeof error.status === 'number' &&
		error.status === 400
	);
}

export function createApp(): Express {
	initializeTournamentSchema();

	const app = express();

	app.use(express.json());
	app.use(express.static(path.resolve(__dirname, '../public')));

	app.get('/health', (req, res) => {
		res.status(200).json({
			status: 'ok',
			timestamp: new Date().toISOString(),
		});
	});

	app.get(
		'/players',
		handleRoute((req, res) => {
			res.status(200).json({
				data: listPlayers(),
			});
		}),
	);

	app.post(
		'/players',
		handleRoute((req, res) => {
			const player = createPlayer(req.body?.name);

			res.status(201).json({
				data: player,
			});
		}),
	);

	app.get(
		'/tournaments',
		handleRoute((req, res) => {
			res.status(200).json({
				data: listTournaments(),
			});
		}),
	);

	app.post(
		'/tournaments',
		handleRoute((req, res) => {
			const tournament = createTournament(req.body?.name);

			res.status(201).json({
				data: tournament,
			});
		}),
	);

	app.get(
		'/tournaments/:tournamentId',
		handleRoute((req, res) => {
			const tournamentId = parsePositiveInteger(
				req.params.tournamentId,
				'tournamentId',
			);

			res.status(200).json({
				data: getTournamentDetail(tournamentId),
			});
		}),
	);

	app.post(
		'/tournaments/:tournamentId/players',
		handleRoute((req, res) => {
			const tournamentId = parsePositiveInteger(
				req.params.tournamentId,
				'tournamentId',
			);
			const playerId = parsePositiveInteger(
				req.body?.playerId,
				'playerId',
			);

			res.status(201).json({
				data: addPlayerToTournament(tournamentId, playerId),
			});
		}),
	);

	app.post(
		'/tournaments/:tournamentId/matches',
		handleRoute((req, res) => {
			const tournamentId = parsePositiveInteger(
				req.params.tournamentId,
				'tournamentId',
			);
			const playerOneId = parsePositiveInteger(
				req.body?.playerOneId,
				'playerOneId',
			);
			const playerTwoId = parsePositiveInteger(
				req.body?.playerTwoId,
				'playerTwoId',
			);
			const match = recordMatchResult(
				tournamentId,
				playerOneId,
				playerTwoId,
				req.body?.playerOneScore,
				req.body?.playerTwoScore,
			);

			res.status(201).json({
				data: match,
			});
		}),
	);

	app.get(
		'/tournaments/:tournamentId/matches',
		handleRoute((req, res) => {
			const tournamentId = parsePositiveInteger(
				req.params.tournamentId,
				'tournamentId',
			);

			res.status(200).json({
				data: listTournamentMatches(tournamentId),
			});
		}),
	);

	app.get(
		'/tournaments/:tournamentId/leaderboard',
		handleRoute((req, res) => {
			const tournamentId = parsePositiveInteger(
				req.params.tournamentId,
				'tournamentId',
			);

			res.status(200).json({
				data: getTournamentLeaderboard(tournamentId),
			});
		}),
	);

	app.get(
		'/tournaments/:tournamentId/status',
		handleRoute((req, res) => {
			const tournamentId = parsePositiveInteger(
				req.params.tournamentId,
				'tournamentId',
			);

			res.status(200).json({
				data: getTournamentLeaderboard(tournamentId),
			});
		}),
	);

	app.use((req, res) => {
		res.status(404).json({
			error: `Route ${req.method} ${req.originalUrl} not found`,
		});
	});

	app.use(
		(error: unknown, req: Request, res: Response, next: NextFunction) => {
			if (res.headersSent) {
				next(error);
				return;
			}

			if (isJsonSyntaxError(error)) {
				res.status(400).json({
					error: 'Request body contains invalid JSON',
				});
				return;
			}

			if (isHttpError(error)) {
				res.status(error.statusCode).json({
					error: error.message,
				});
				return;
			}

			res.status(500).json({
				error: 'Internal server error',
			});
		},
	);

	return app;
}
