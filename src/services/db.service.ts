import fs from 'fs';
import sqlite from 'better-sqlite3';
import path from 'path';

type SqlParams = Record<string, string | number | null | undefined>;

const databasePath = process.env.DATABASE_PATH
	? path.resolve(process.env.DATABASE_PATH)
	: path.resolve(__dirname, '../../db/db.sqlite3');

fs.mkdirSync(path.dirname(databasePath), {
	recursive: true,
});

const db = new sqlite(databasePath);

db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function query<T>(sql: string, params?: SqlParams): T[] {
	return (
		params ? db.prepare(sql).all(params) : db.prepare(sql).all()
	) as T[];
}

function get<T>(sql: string, params?: SqlParams): T | undefined {
	return (params ? db.prepare(sql).get(params) : db.prepare(sql).get()) as
		| T
		| undefined;
}

function run(sql: string, params?: SqlParams) {
	return params ? db.prepare(sql).run(params) : db.prepare(sql).run();
}

function exec(sql: string): void {
	db.exec(sql);
}

function withTransaction<T>(callback: () => T): T {
	return db.transaction(callback)();
}

function close(): void {
	db.close();
}

export default { close, exec, get, query, run, withTransaction };
