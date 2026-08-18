import { BadRequestException } from '@nestjs/common';

/**
 * Raster-only allowlist — deliberately excludes `image/svg+xml`. An SVG is
 * XML that can embed `<script>`/event-handler attributes; the old
 * `mimetype.startsWith('image/')` check let one through on both the avatar
 * and tenant-logo upload paths, and both paths later serve the stored file
 * back with the caller-supplied Content-Type and no `Content-Disposition`,
 * so an uploaded SVG would execute if its URL were opened directly (found
 * in a security audit). Rejecting outright rather than sanitizing: this
 * app has no legitimate use case for a vector logo/avatar today, and SVG
 * sanitization (stripping scripts/foreignObject/event handlers correctly)
 * is its own real attack surface — not worth adding for a feature nobody
 * asked for.
 */
export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function assertSafeImageMimeType(mimetype: string, label: string): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimetype)) {
    throw new BadRequestException(`${label} must be a PNG, JPEG, GIF, or WebP image`);
  }
}
