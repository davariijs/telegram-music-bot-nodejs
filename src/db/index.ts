import Database from 'better-sqlite3';
import { DB_PATH } from '../config';
import { SCHEMA } from './schema';


export const db = new Database(DB_PATH);


db.exec(SCHEMA);


process.once('SIGINT', () => {
  if (db) db.close();
  console.log('Database connection closed');
});

process.once('SIGTERM', () => {
  if (db) db.close();
  console.log('Database connection closed');
});

export default db;