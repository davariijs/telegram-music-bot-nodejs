// db/index.ts
import Database from 'better-sqlite3';
import { DB_PATH } from '../config';
import { SCHEMA } from './schema';

// Initialize database
export const db = new Database(DB_PATH);

// Create tables
db.exec(SCHEMA);

// Close database on process exit
process.once('SIGINT', () => {
  if (db) db.close();
  console.log('Database connection closed');
});

process.once('SIGTERM', () => {
  if (db) db.close();
  console.log('Database connection closed');
});

export default db;