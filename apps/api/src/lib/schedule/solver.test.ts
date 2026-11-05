import { describe, expect, it } from 'vitest';
import { bucketOf, dayOutOfDays, evaluate, plan, shootDates, type CastDates, type PlanScene } from './solver';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const scenes: PlanScene[] = [
  { id: 'a', number: 1, location: 'GWADAR HARBOUR', time: 'NIGHT', eighths: 12, cast: ['IDRIS', 'MINA'] },
  { id: 'b', number: 2, location: 'FERRY', time: 'NIGHT', eighths: 18, cast: ['IDRIS', 'LEYLA'] },
  { id: 'c', number: 3, location: 'CHECKPOINT', time: 'NIGHT', eighths: 24, cast: ['RAZA', 'IDRIS'] },
  { id: 'd', number: 4, location: 'FERRY', time: 'NIGHT', eighths: 14, cast: ['LEYLA'] },
  { id: 'e', number: 5, location: 'GWADAR HARBOUR', time: 'DAWN', eighths: 6, cast: ['IDRIS'] },
  { id: 'f', number: 6, location: 'FERRY', time: 'DAY', eighths: 20, cast: ['IDRIS', 'LEYLA'] },
];
const cast = (raza: { start: Date; end: Date }[] = []): CastDates => new Map([
  ['IDRIS', { actor: 'A1', blocks: [] }],
  ['LEYLA', { actor: 'A2', blocks: [] }],
  ['MINA', { actor: 'A3', blocks: [] }],
  ['RAZA', { actor: 'A4', blocks: raza.map((r) => ({ ...r, kind: 'booked' as const })) }],
]);

describe('shoot planner', () => {
  it('reads the time of day', () => {
    expect(bucketOf('NIGHT')).toBe('night');
    expect(bucketOf('DAWN')).toBe('dawn_dusk');
    expect(bucketOf('CONTINUOUS', 'night')).toBe('night');
    expect(bucketOf('DAY')).toBe('day');
  });

  it('skips days off', () => {
    const dates = shootDates(d('2026-11-06'), 3, [0]); // Fri, Sat, (Sun off), Mon
    expect(dates.map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-11-06', '2026-11-07', '2026-11-09']);
  });

  it('keeps one place together and every scene planned once', () => {
    const r = plan(scenes, cast(), { startDate: d('2026-11-03'), maxEighthsPerDay: 40 });
    expect(r.days.flatMap((x) => x.sceneIds).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const ferryDays = r.days.filter((x) => x.locationName === 'FERRY').map((x) => x.number);
    expect(Math.max(...ferryDays) - Math.min(...ferryDays) + 1).toBe(ferryDays.length);
    expect(r.days.every((x) => x.eighths <= 40)).toBe(true);
  });

  it('moves a day away from a booked actor date', () => {
    const first = plan(scenes, cast(), { startDate: d('2026-11-03'), maxEighthsPerDay: 40 });
    const checkpoint = first.days.find((x) => x.sceneIds.includes('c'))!;
    const r = plan(scenes, cast([{ start: checkpoint.date, end: checkpoint.date }]), { startDate: d('2026-11-03'), maxEighthsPerDay: 40 });
    expect(r.conflicts.filter((c) => c.kind === 'booked')).toEqual([]);
  });

  it('flags a booked date after a manual move', () => {
    const r = evaluate([{ locationName: 'CHECKPOINT', sceneIds: ['c'] }], scenes, cast([{ start: d('2026-11-03'), end: d('2026-11-03') }]), { startDate: d('2026-11-03') });
    expect(r.conflicts).toMatchObject([{ day: 1, actor: 'A4', character: 'RAZA', scene: 3, kind: 'booked' }]);
  });

  it('writes day-out-of-days codes', () => {
    const r = evaluate([
      { locationName: 'X', sceneIds: ['a'] }, { locationName: 'Y', sceneIds: ['d'] }, { locationName: 'Z', sceneIds: ['e'] },
    ], scenes, cast(), { startDate: d('2026-11-03') });
    const rows = dayOutOfDays(r, scenes, cast());
    expect(rows.find((x) => x.character === 'IDRIS')!.codes).toEqual(['SW', 'H', 'WF']);
    expect(rows.find((x) => x.character === 'LEYLA')!.codes).toEqual([null, 'SWF', null]);
  });
});
