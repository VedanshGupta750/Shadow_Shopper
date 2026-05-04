import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-standard `cn` helper: combines clsx + tailwind-merge for class-name composition. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
