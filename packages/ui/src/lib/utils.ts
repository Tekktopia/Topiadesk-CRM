import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Standard shadcn/ui class-merging helper: clsx for conditional class
 * composition, tailwind-merge to resolve conflicting Tailwind utility
 * classes (e.g. `px-2` vs `px-4`) in favor of the last one. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
