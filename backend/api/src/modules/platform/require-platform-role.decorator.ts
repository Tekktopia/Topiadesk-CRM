import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PLATFORM_ROLE_KEY = 'require_platform_role';

/** Hierarchy, not exact-match — "at least this role". See PlatformRoleGuard's ROLE_RANK. */
export const RequirePlatformRole = (role: 'SUPPORT' | 'SUPER_ADMIN') => SetMetadata(REQUIRE_PLATFORM_ROLE_KEY, role);
