import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class names with Tailwind conflict resolution.
 *
 * `clsx` handles the conditionals; `twMerge` guarantees that a caller-supplied
 * `className` wins over a component's defaults instead of the two fighting over
 * specificity.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
