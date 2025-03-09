// db/users.ts
import db from './index';
import { UserStats, CountResult, SearchResult } from '../types';

export function trackUser(userId: number, firstName: string, username: string): boolean {
  const now = new Date().toISOString();
  
  try {
    // Insert or ignore new user
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, first_name, username, joined_date, last_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertUser.run(userId, firstName || '', username || '', now, now);
    
    // Update last active timestamp
    const updateActivity = db.prepare(`
      UPDATE users SET last_active = ? WHERE id = ?
    `);
    updateActivity.run(now, userId);
    
    return true;
  } catch (error) {
    console.error('Error tracking user:', error);
    return false;
  }
}

export function logActivity(userId: number, activityType: string, searchQuery: string = ''): boolean {
  const now = new Date().toISOString();
  
  try {
    const logActivity = db.prepare(`
      INSERT INTO user_activity (user_id, activity_type, search_query, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    logActivity.run(userId, activityType, searchQuery, now);
    return true;
  } catch (error) {
    console.error('Error logging activity:', error);
    return false;
  }
}

export function getAllUsers(): { id: number }[] {
  try {
    return db.prepare('SELECT id FROM users').all() as { id: number }[];
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

export function getUserStats(): UserStats {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as CountResult;
    
    const activeToday = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM user_activity 
      WHERE timestamp > datetime('now', '-1 day')
    `).get() as CountResult;
    
    const activeWeek = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM user_activity 
      WHERE timestamp > datetime('now', '-7 day')
    `).get() as CountResult;
    
    const popularSearches = db.prepare(`
      SELECT search_query, COUNT(*) as count 
      FROM user_activity 
      WHERE search_query != '' AND search_query NOT LIKE '/%'
      GROUP BY search_query 
      ORDER BY count DESC 
      LIMIT 5
    `).all() as SearchResult[];
    
    return { totalUsers, activeToday, activeWeek, popularSearches };
  } catch (error) {
    console.error('Error getting user stats:', error);
    return { 
      totalUsers: { count: 0 }, 
      activeToday: { count: 0 }, 
      activeWeek: { count: 0 }, 
      popularSearches: [] 
    };
  }
}