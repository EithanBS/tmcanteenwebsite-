import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility: merge conditional classNames (clsx) and resolve Tailwind conflicts (twMerge).
// Example: cn('px-2', condition && 'hidden', 'px-4') => 'hidden px-4' when condition is true.

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
