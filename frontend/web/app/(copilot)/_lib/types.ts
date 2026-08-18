// Hand-typed to match backend/api/src/modules/ai-gateway/dto/chat.dto.ts.
export interface ChatSessionDto {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ChatRole = 'USER' | 'ASSISTANT';

export interface ChatMessageDto {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface SendChatMessageResponseDto {
  userMessage: ChatMessageDto;
  assistantMessage: ChatMessageDto;
  estimatedCostUsd: number;
}
