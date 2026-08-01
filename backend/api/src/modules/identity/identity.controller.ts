import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUserResponseDto } from './dto/current-user-response.dto';

/**
 * Foundation stub — proves the auth/RLS pipeline end-to-end (JWT verify ->
 * local user resolution -> RLS context bind). Batch 1 Agent A owns
 * backend/api/src/modules/identity/: User/Role/Permission/Department/Branch/
 * TeamMember/OrgSetting/IpWhitelistEntry CRUD, Keycloak sync webhook.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity')
export class IdentityController {
  @Get('me')
  @ApiOkResponse({ type: CurrentUserResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): CurrentUserResponseDto {
    return user;
  }
}
