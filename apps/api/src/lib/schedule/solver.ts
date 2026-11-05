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

/**
 * The set a scene is shot on: "SABZ PARI - WHEELHOUSE" and "SABZ PARI - DECK" are one boat, so
 * moving between them is not a company move.
 */
export const placeKey = (location: string) => location.toUpperCase().split(/\s+-\s+/)[0].trim();
/** Words naming a town or area ("GWADAR" in "NAWAZ'S HOUSE, GWADAR" and "GWADAR FISH HARBOUR"); generic set words are left out. */
const GENERIC = new Set(['HOUSE', 'HOME', 'ROOM', 'OFFICE', 'STREET', 'ROAD', 'CAR', 'KITCHEN', 'BEDROOM', 'HALL', 'SHOP', 'MARKET', 'HOSPITAL', 'SCHOOL', 'BASIC', 'HEALTH', 'UNIT', 'CONTINUOUS', 'LATER', 'SAME', 'INSIDE', 'OUTSIDE', 'FISH', 'MAIN', 'NEAR', 'BACK', 'FRONT']);
const areaWords = (location: string) => new Set(location.toUpperCase().replace(/'S\b/g, '').split(/[^A-Z\u0600-\u06FF]+/).filter((w) => w.length >= 4 && !GENERIC.has(w)));
/** Same set, or the same town or area: a short move the unit can make in a day. */
export function nearby(a: string, b: string) {
  if (placeKey(a) === placeKey(b)) return true;
  const wa = areaWords(a);
  return [...areaWords(b)].some((w) => wa.has(w));
}

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
  const clusters = [...map.values()];
  // Areas: clusters joined by being nearby (same set, or the same town). Each area is shot in one run,
  // so the unit never goes back and forth between towns.
  const parent = clusters.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  clusters.forEach((a, i) => clusters.forEach((b, j) => { if (j > i && nearby(a.location, b.location)) parent[find(j)] = find(i); }));
  const areas = new Map<number, Cluster[]>();
  clusters.forEach((c, i) => areas.set(find(i), [...(areas.get(find(i)) ?? []), c]));
  const pages = (cs: Cluster[]) => cs.reduce((n, c) => n + c.eighths, 0);
  const castOf = (cs: Cluster[]) => [...new Set(cs.flatMap((c) => c.cast))];
  const pendingAreas = [...areas.values()].sort((a, b) => pages(b) - pages(a) || a[0].scenes[0].number - b[0].scenes[0].number);
  const order: Cluster[] = [];
  while (pendingAreas.length) {
    // The next area shares the most cast with what was just shot (actors finish sooner), else the biggest.
    let pick = 0;
    if (order.length) {
      const lastCast = order[order.length - 1].cast;
      let bestScore = -Infinity;
      pendingAreas.forEach((a, i) => { const sc = overlap(castOf(a), lastCast) * 10 + pages(a) * 0.01; if (sc > bestScore) { bestScore = sc; pick = i; } });
    }
    const left = pendingAreas.splice(pick, 1)[0];
    // Within an area: start where most pages are, then follow the same set, shared cast and time of day.
    left.sort((a, b) => b.eighths - a.eighths || a.scenes[0].number - b.scenes[0].number);
    const run: Cluster[] = [left.shift()!];
    while (left.length) {
      const last = run[run.length - 1];
      let best = 0;
      let bestScore = -Infinity;
      left.forEach((c, i) => {
        const score = (placeKey(c.location) === placeKey(last.location) ? 100 : 0) + overlap(c.cast, last.cast) * 50 + (c.bucket === last.bucket ? 15 : 0) - c.scenes[0].number * 0.001;
        if (score > bestScore) { bestScore = score; best = i; }
      });
      run.push(left.splice(best, 1)[0]);
    }
    order.push(...run);
  }
  return order;
}

/** Fills shoot days in cluster order, up to the page limit, starting a new day at each new place. */
function pack(clusters: Cluster[], max: number): { location: string; scenes: PlanScene[]; eighths: number; companyMove: boolean }[] {
  const days: { location: string; scenes: PlanScene[]; eighths: number; companyMove: boolean; bucket: TimeBucket }[] = [];
  for (const c of clusters) {
    for (const s of c.scenes) {
      const len = Math.max(1, s.eighths);
      const cur = days[days.length - 1];
      const samePlace = !!cur && placeKey(cur.location) === placeKey(c.location);
      // Another set the same day only when it is nearby (same set or same town), and at the same time of
      // day or with a short day so far. A move to another town always starts a new day.
      const near = !!cur && nearby(cur.location, c.location);
      const fits = cur && cur.eighths + len <= max && (samePlace || (near && (cur.bucket === c.bucket || cur.eighths <= max * 0.25)));
      if (fits) {
        if (!samePlace) cur.companyMove = true;
        cur.scenes.push(s);
        cur.eighths += len;
      } else {
        days.push({ location: c.location, scenes: [s], eighths: len, companyMove: false, bucket: c.bucket });
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
    companyMove: new Set(d.sceneIds.map((id) => byId.get(id)).filter(Boolean).map((sc) => placeKey(sc!.location))).size > 1,
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
  const companyMoves = days.filter((d, i) => i > 0 && placeKey(d.locationName) !== placeKey(days[i - 1].locationName)).length + days.filter((d) => d.companyMove).length;
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
