import type { HealthStatus } from '@sceneos/shared';
import type { Tone } from '@/components/ui';

export function pkr(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Not set';
  if (Math.abs(n) >= 1_000_000) return `PKR ${(n / 1_000_000).toFixed(2)}M`;
  return `PKR ${Math.round(n).toLocaleString('en-PK')}`;
}
export const num = (n: number) => n.toLocaleString('en-PK');
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'n/a' : `${Math.round(n)}%`);

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const day = (d: string | Date | null | undefined) => (d ? DAY.format(new Date(d)) : 'No date');
export const isoDay = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
export const fileSize = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const HEALTH: Record<HealthStatus, { label: string; tone: Tone }> = {
  on_track: { label: 'On track', tone: 'ok' },
  needs_attention: { label: 'Needs attention', tone: 'warn' },
  at_risk: { label: 'At risk', tone: 'risk' },
};

/** Tone for the status words used across the product. */
export function tone(status: string): Tone {
  if (['done', 'completed', 'approved', 'signed', 'available', 'written', 'published'].includes(status)) return 'ok';
  if (['in_progress', 'submitted', 'on_set', 'drafting', 'pending_contract', 'needs_review', 'on_hold'].includes(status)) return 'warn';
  if (['delayed', 'rejected', 'expired', 'unavailable', 'failed', 'cancelled'].includes(status)) return 'risk';
  if (['active', 'draft', 'drawing', 'queued'].includes(status)) return 'info';
  return 'idle';
}
