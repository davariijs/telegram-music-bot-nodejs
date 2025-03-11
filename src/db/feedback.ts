import db from './index';
import { FeedbackMessage, CountResult } from '../types';

export function saveFeedback(userId: number, message: string): number | null {
  const now = new Date().toISOString();
  
  try {
    const insertFeedback = db.prepare(`
      INSERT INTO feedback (user_id, message, timestamp)
      VALUES (?, ?, ?)
    `);
    const result = insertFeedback.run(userId, message, now);
    return Number(result.lastInsertRowid);
  } catch (error) {
    console.error('Error saving feedback:', error);
    return null;
  }
}

export function getPendingFeedback(): FeedbackMessage[] {
  try {
    return db.prepare(`
      SELECT f.id, f.user_id, f.message, f.timestamp, f.status, u.first_name, u.username
      FROM feedback f
      JOIN users u ON f.user_id = u.id
      WHERE f.status = 'pending'
      ORDER BY f.timestamp DESC
      LIMIT 10
    `).all() as FeedbackMessage[];
  } catch (error) {
    console.error('Error getting pending feedback:', error);
    return [];
  }
}

export function getFeedbackById(feedbackId: number): FeedbackMessage | undefined {
  try {
    return db.prepare(`
      SELECT id, user_id, message FROM feedback WHERE id = ?
    `).get(feedbackId) as FeedbackMessage | undefined;
  } catch (error) {
    console.error('Error getting feedback by ID:', error);
    return undefined;
  }
}

export function saveReply(feedbackId: number, reply: string): boolean {
  const now = new Date().toISOString();
  
  try {
    const insertReply = db.prepare(`
      INSERT INTO feedback_replies (feedback_id, reply, timestamp)
      VALUES (?, ?, ?)
    `);
    insertReply.run(feedbackId, reply, now);
    
    const updateStatus = db.prepare(`
      UPDATE feedback SET status = 'replied' WHERE id = ?
    `);
    updateStatus.run(feedbackId);
    
    return true;
  } catch (error) {
    console.error('Error saving reply:', error);
    return false;
  }
}

export function getPendingFeedbackCount(): CountResult {
  try {
    return db.prepare(`
      SELECT COUNT(*) as count FROM feedback WHERE status = 'pending'
    `).get() as CountResult;
  } catch (error) {
    console.error('Error getting pending feedback count:', error);
    return { count: 0 };
  }
}