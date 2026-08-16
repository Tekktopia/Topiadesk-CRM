/**
 * Conversation state tracker — remembers the "current" account/opportunity/case
 * throughout a multi-turn conversation so users can use pronouns ("it", "them")
 * and refer back to previous entities without re-specifying them.
 *
 * State persists across turns via a Map keyed by user ID, reset on new sessions
 * (e.g., page reload). In production, this could be persisted to Redis or the DB.
 */

export interface ConversationEntity {
  type: 'account' | 'opportunity' | 'case' | 'contact' | 'policy' | 'lead';
  id: string;
  name: string;
  timestamp: Date;
}

export interface ConversationState {
  userId: string;
  currentEntity?: ConversationEntity;
  recentEntities: ConversationEntity[]; // Last 10 entities mentioned
}

/** In-memory store keyed by userId. Replace with Redis in production. */
const conversationStates = new Map<string, ConversationState>();

export function initializeConversationState(userId: string): ConversationState {
  if (!conversationStates.has(userId)) {
    conversationStates.set(userId, {
      userId,
      recentEntities: [],
    });
  }
  return conversationStates.get(userId)!;
}

export function setCurrentEntity(userId: string, entity: ConversationEntity): void {
  const state = initializeConversationState(userId);
  state.currentEntity = entity;

  // Add to recent entities, remove duplicates, keep only last 10
  state.recentEntities = state.recentEntities.filter((e) => e.id !== entity.id);
  state.recentEntities.unshift(entity);
  state.recentEntities = state.recentEntities.slice(0, 10);
}

export function getCurrentEntity(userId: string): ConversationEntity | undefined {
  const state = initializeConversationState(userId);
  return state.currentEntity;
}

export function getRecentEntities(userId: string, type?: ConversationEntity['type']): ConversationEntity[] {
  const state = initializeConversationState(userId);
  if (!type) return state.recentEntities;
  return state.recentEntities.filter((e) => e.type === type);
}

/**
 * Detect pronouns in user message that refer to the current entity.
 * Returns true if the message uses "it", "them", "that", etc. that could refer to current entity.
 */
export function usesContextualPronoun(message: string): boolean {
  const pronounPatterns = /\b(?:it|them|that|this|its|their)\b|\bhow (?:is|are|does) (?:it|that|this)\b/i;
  return pronounPatterns.test(message);
}

/**
 * Detect if user is asking about a DIFFERENT entity (not the current one).
 * Returns true if message mentions a new account/case/etc. name or number.
 */
export function mentionsNewEntity(message: string): boolean {
  // Account/case/policy numbers: TDK-PROP-2026-00042, 123456
  // Capitalized proper nouns (heuristic)
  const identifierPattern = /\b([A-Z]{2,}(?:-[A-Z0-9]+){1,}|\d{6,})\b/;
  const properNounPattern = /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}\b/;
  return identifierPattern.test(message) || properNounPattern.test(message);
}

export function clearConversationState(userId: string): void {
  conversationStates.delete(userId);
}
