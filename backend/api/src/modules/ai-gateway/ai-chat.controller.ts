import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import: AiGatewayService is constructor-injected below —
// see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AiGatewayService } from './ai-gateway.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see AiGatewayController's identical comment: @Body() DTOs need the real class at runtime
import { SendChatMessageDto } from './dto/chat.dto';
import type { ChatMessageResponseDto, ChatSessionResponseDto, SendChatMessageResponseDto } from './dto/chat.dto';

/**
 * CRM copilot session/message endpoints — split from AiGatewayController
 * (the one-shot summarize/sentiment/etc. endpoints) since these are a
 * genuinely different resource shape (stateful conversations, not single
 * request/response calls). Gated the same way as every other AI Gateway
 * feature ('ai_usage'/'write' — already granted to ACCOUNT_HANDLER at OWN
 * scope and MANAGER at DEPARTMENT scope in seed.ts, a front-line
 * productivity tool, not admin-only) so the copilot is available to the
 * same people who can already use summarize/reply-draft.
 */
@ApiTags('ai-gateway')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('ai/chat/sessions')
export class AiChatController {
  constructor(private readonly aiGateway: AiGatewayService) {}

  @Post()
  @RequirePermission('ai_usage', 'write')
  @ApiOkResponse({ type: Object, description: 'ChatSessionResponseDto' })
  async createSession(@CurrentUser() user: AuthenticatedUser): Promise<ChatSessionResponseDto> {
    return this.aiGateway.createChatSession(user);
  }

  @Get()
  @RequirePermission('ai_usage', 'write')
  @ApiOkResponse({ type: Object, description: 'ChatSessionResponseDto[]' })
  async listSessions(@CurrentUser() user: AuthenticatedUser): Promise<ChatSessionResponseDto[]> {
    return this.aiGateway.listChatSessions(user);
  }

  @Get(':id/messages')
  @RequirePermission('ai_usage', 'write')
  @ApiOkResponse({ type: Object, description: 'ChatMessageResponseDto[]' })
  async getMessages(@Param('id') id: string): Promise<ChatMessageResponseDto[]> {
    return this.aiGateway.getChatMessages(id);
  }

  @Post(':id/messages')
  @RequirePermission('ai_usage', 'write')
  @ApiOkResponse({ type: Object, description: 'SendChatMessageResponseDto' })
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SendChatMessageResponseDto> {
    return this.aiGateway.sendChatMessage(id, dto.content, user);
  }

  @Delete(':id')
  @RequirePermission('ai_usage', 'write')
  @HttpCode(204)
  async deleteSession(@Param('id') id: string): Promise<void> {
    await this.aiGateway.deleteChatSession(id);
  }
}
