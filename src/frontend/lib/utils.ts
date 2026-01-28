import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  // Parse date string manually to avoid timezone issues
  // Input format: "2026-01-26" (YYYY-MM-DD)
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function getVerdictColor(verdict: string): string {
  switch (verdict) {
    case 'Strong Buy':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'Neutral':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'Short':
      return 'text-red-600 bg-red-50 border-red-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

export function getIntensityColor(intensity: string): string {
  switch (intensity) {
    case 'High':
      return 'bg-purple-600';
    case 'Medium':
      return 'bg-blue-600';
    case 'Low':
      return 'bg-gray-600';
    default:
      return 'bg-gray-400';
  }
}
