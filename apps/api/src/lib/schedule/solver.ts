/**
 * The shoot planner. Orders scenes into shoot days the way an assistant director builds a
 * stripboard: all scenes at one place together (fewer company moves), day and night kept
 * apart, each day filled up to a page limit, and actors only on days they are free.
 *
 * This is a constraint problem (the "talent scheduling" problem is NP-hard), so it is solved
 * with rules and repair in code, never by asking a language model to order scenes: the plan
 * must respect every booked date. Claude only explains the result.
 */

export type TimeBucket = 'day' | 'night' | 'dawn_dusk';
export interface PlanScene { id: string; number: number; location: string; time: string; eighths: number; cast: string[] }
export type BlockKind = 'booked' | 'hold' | 'unavailable';
export interface ActorBlock { start: Date; end: Date; kind: BlockKind; note?: string }
/** Who plays which character, and the dates they are not free. Keyed by character name in capitals. */
export type CastDates = Map<string, { actor: string; blocks: ActorBlock[] }>;

export interface PlanOptions { startDate: Date; daysOff?: number[]; maxEighthsPerDay?: number }
export interface PlanDay { number: number; date: Date; locationName: string; sceneIds: string[]; eighths: number; companyMove: boolean }
export interface Conflict { day: number; actor: string; character: string; scene: number; kind: 'booked' | 'unavailable' | 'hold'; note?: string }
export interface PlanResult { days: PlanDay[]; conflicts: Conflict[]; stats: { days: number; companyMoves: number; holdingDays: number } }

const DAY_MS = 86_400_000;
const dayStart = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };

export function bucketOf(time: string, previous: TimeBucket = 'day'): TimeBucket {
  const t = time.toUpperCase();
  if (/NIGHT|EVENING|LATE|RAAT/.test(t)) return 'night';
  if (/DAWN|DUSK|SUNSET|SUNRISE|FAJR|MAGHRIB|TWILIGHT/.test(t)) return 'dawn_dusk';
  if (/CONTINUOUS|SAME|LATER|MOMENTS/.test(t) || !t.trim()) return previous;
  return 'day';
}

/** Shoot dates in order, skipping the weekdays off. */
export function shootDates(start: Date, count: number, daysOff: number[] = []): Date[] {
  const out: Date[] = [];
  let d = dayStart(start);
  for (let guard = 0; out.length < count && guard < count * 7 + 14; guard++) {
    if (!daysOff.includes(d.getUTCDay())) out.push(new Date(d));
    d = new Date(d.getTime() + DAY_MS);
  }
  return out;
}

const overlap = (a: string[], b: string[]) => {
  if (!a.length || !b.length) return 0;
  const s = new Set(a);
  return b.filter((x) => s.has(x)).length / new Set([...a, ...b]).size;
};

interface Cluster { location: string; bucket: TimeBucket; scenes: PlanScene[]; cast: string[]; eighths: number }

/** Groups scenes by place and time of day, then orders the groups so the unit moves as little as possible. */
function orderedClusters(scenes: PlanScene[]): Cluster[] {
  const sorted = [...scenes].sort((a, b) => a.number - b.number);
  const map = new Map<string, Cluster>();
  let prev: TimeBucket = 'day';
  for (const s of sorted) {
    const bucket = bucketOf(s.time, prev);
    prev = bucket;
    const key = `${s.location.toUpperCase()}|${bucket}`;
    const c = map.get(key) ?? { location: s.location, bucket, scenes: [], cast: [], eighths: 0 };
    c.scenes.push(s);
    c.cast = [...new Set([...c.cast, ...s.cast])];
    c.eighths += Math.max(1, s.eighths);
    map.set(key, c);
  }
  const left = [...map.values()];
  const byLocation = (loc: string) => left.filter((c) => c.location.toUpperCase() === loc.toUpperCase()).reduce((n, c) => n + c.eighths, 0);
  // Start at the place with the most pages: it anchors the schedule.
  left.sort((a, b) => byLocation(b.location) - byLocation(a.location) || a.scenes[0].number - b.scenes[0].number);
  const order: Cluster[] = [left.shift()!];
  while (left.length) {
    const last = order[order.length - 1];
    let best = 0;
    let bestScore = -Infinity;
    left.forEach((c, i) => {
      const score = (c.location.toUpperCase() === last.location.toUpperCase() ? 100 : 0) + overlap(c.cast, last.cast) * 50 + (c.bucket === last.bucket ? 10 : 0) - c.scenes[0].number * 0.001;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    order.push(left.splice(best, 1)[0]);
  }
  return order;
}

/** Fills shoot days in cluster order, up to the page limit, starting a new day at each new place. */
function pack(clusters: Cluster[], max: number): { location: string; scenes: PlanScene[]; eighths: number; companyMove: boolean }[] {
  const days: { location: string; scenes: PlanScene[]; eighths: number; companyMove: boolean }[] = [];
  for (const c of clusters) {
    for (const s of c.scenes) {
      const len = Math.max(1, s.eighths);
      const cur = days[days.length - 1];
      const samePlace = cur && cur.location.toUpperCase() === c.location.toUpperCase();
      // A short half-day may take a second nearby place (a company move); otherwise a new place starts a new day.
      const fits = cur && cur.eighths + len <= max && (samePlace || cur.eighths <= max * 0.25);
      if (fits) {
        if (!samePlace) cur.companyMove = true;
        cur.scenes.push(s);
        cur.eighths += len;
      } else {
        days.push({ location: c.location, scenes: [s], eighths: len, companyMove: false });
      }
    }
  }
  return days;
}

const blocksOn = (date: Date, blocks: ActorBlock[]) => blocks.filter((b) => dayStart(b.start) <= date && date <= dayStart(b.end));

/** Dates, conflicts and totals for days in a given order. Used after the planner and after every manual drag. */
export function evaluate(dayScenes: { locationName: string; sceneIds: string[]; companyMove?: boolean }[], scenes: PlanScene[], cast: CastDates, o: PlanOptions): PlanResult {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const dates = shootDates(o.startDate, dayScenes.length, o.daysOff);
  const days: PlanDay[] = dayScenes.map((d, i) => ({
    number: i + 1, date: dates[i], locationName: d.locationName, sceneIds: d.sceneIds,
    eighths: d.sceneIds.reduce((n, id) => n + Math.max(1, byId.get(id)?.eighths ?? 0), 0),
    companyMove: Boolean(d.companyMove) || new Set(d.sceneIds.map((id) => byId.get(id)?.location.toUpperCase())).size > 1,
  }));
  const conflicts: Conflict[] = [];
  const worked = new Map<string, number[]>();
  for (const day of days) {
    for (const id of day.sceneIds) {
      const s = byId.get(id);
      if (!s) continue;
      for (const ch of s.cast) {
        const who = cast.get(ch);
        if (!who) continue;
        worked.set(ch, [...(worked.get(ch) ?? []), day.number]);
        for (const b of blocksOn(day.date, who.blocks)) conflicts.push({ day: day.number, actor: who.actor, character: ch, scene: s.number, kind: b.kind, note: b.note });
      }
    }
  }
  let holdingDays = 0;
  for (const nums of worked.values()) {
    const set = new Set(nums);
    holdingDays += Math.max(...set) - Math.min(...set) + 1 - set.size;
  }
  const companyMoves = days.filter((d, i) => i > 0 && d.locationName.toUpperCase() !== days[i - 1].locationName.toUpperCase()).length + days.filter((d) => d.companyMove).length;
  return { days, conflicts, stats: { days: days.length, companyMoves, holdingDays } };
}

const hard = (c: Conflict) => c.kind !== 'hold';

/** Builds the plan, then swaps whole days around to clear booked and unavailable dates where it can. */
export function plan(scenes: PlanScene[], cast: CastDates, o: PlanOptions): PlanResult {
  if (!scenes.length) return { days: [], conflicts: [], stats: { days: 0, companyMoves: 0, holdingDays: 0 } };
  const max = o.maxEighthsPerDay ?? 40;
  let order = pack(orderedClusters(scenes), max).map((d) => ({ locationName: d.location, sceneIds: d.scenes.map((s) => s.id), companyMove: d.companyMove }));
  let result = evaluate(order, scenes, cast, o);
  for (let round = 0; round < 50 && result.conflicts.some(hard); round++) {
    const bad = result.conflicts.find(hard)!.day - 1;
    let improved = false;
    for (let j = 0; j < order.length && !improved; j++) {
      if (j === bad) continue;
      const trial = [...order];
      [trial[bad], trial[j]] = [trial[j], trial[bad]];
      const r = evaluate(trial, scenes, cast, o);
      const before = result.conflicts.filter(hard).length;
      const after = r.conflicts.filter(hard).length;
      if (after < before) { order = trial; result = r; improved = true; }
    }
    if (!improved) break;
  }
  return result;
}

/** Day-out-of-days: per actor, what they do on each shoot day (SW start, W work, H hold, WF finish, SWF one day only). */
export function dayOutOfDays(result: PlanResult, scenes: PlanScene[], cast: CastDates) {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const rows: { character: string; actor: string; codes: (string | null)[]; workDays: number; holdDays: number }[] = [];
  for (const [character, who] of cast) {
    const work = new Set(result.days.filter((d) => d.sceneIds.some((id) => byId.get(id)?.cast.includes(character))).map((d) => d.number));
    if (!work.size) continue;
    const first = Math.min(...work);
    const last = Math.max(...work);
    const codes = result.days.map((d) => {
      if (d.number < first || d.number > last) return null;
      if (first === last) return 'SWF';
      if (d.number === first) return 'SW';
      if (d.number === last) return 'WF';
      return work.has(d.number) ? 'W' : 'H';
    });
    rows.push({ character, actor: who.actor, codes, workDays: work.size, holdDays: last - first + 1 - work.size });
  }
  return rows.sort((a, b) => b.workDays - a.workDays);
}
