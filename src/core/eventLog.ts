import { TILE_EVENT_TYPES, type BaseMove, type EventRow, type Outcome, type Pitch, type TileEventType } from './store';

/** A Score Snapshot's Team and Opponent scores. */
export interface Scores {
  team: number;
  opponent: number;
}

/** A Shift: one stretch on court, from a Sub In to the Sub Out that ends it (GLOSSARY: Shift). */
export interface Shift {
  /** Milliseconds on court: to its Sub Out, or while on court, to now (or to the End Game). */
  ms: number;
  /** Team points minus Opponent points between its Score Snapshots (ADR 0002). */
  plusMinus: number;
}

/** Every Event type Undo can retract: all but a Retraction itself. */
export type UndoableType = Exclude<EventRow['type'], 'retraction'>;

/** The stats a set of Events counts: none of them retracted, and no Retraction among them. */
export interface Counts {
  tiles: Record<TileEventType, number>;
  /** Free Throws not retracted: how many went in, of how many were attempted. */
  freeThrows: { made: number; attempted: number };
  /** Shots not retracted, by value: how many went in, of how many were attempted. */
  shots: Record<2 | 3, { made: number; attempted: number }>;
  /** The Athlete's points: made Shots and Free Throws not retracted. */
  points: number;
}

/** How a strikeout is marked: looking or swinging (GLOSSARY: Strikeout looking, Strikeout swinging). */
export type StrikeKind = 'looking' | 'swinging';

/** A Plate Appearance's count from its Pitches: balls and strikes, and how a strikeout would be marked now (GLOSSARY: Count). */
export interface PitchCount {
  balls: number;
  strikes: number;
  /** Undefined without a called or swinging strike: a strikeout then stays unmarked. */
  strikeout?: StrikeKind;
}

/** A softball or baseball Game's batting: its At-Bats, hits and RBI, and AVG, OBP and SLG (plan: Stats; GLOSSARY: At-Bat). The counts are kept so a season sums them. */
export interface Batting {
  atBats: number;
  hits: number;
  rbi: number;
  /** Total bases: 1 per single, 2 per double, 3 per triple, 4 per home run. */
  bases: number;
  walks: number;
  hitByPitch: number;
  sacFlies: number;
  /** H / AB, undefined before the first At-Bat. */
  avg?: number;
  /** (H + BB + HBP) / (AB + BB + HBP + SF), undefined while the denominator is zero. */
  obp?: number;
  /** Total bases / AB, undefined before the first At-Bat. */
  slg?: number;
}

export type BattingCounts = Omit<Batting, 'avg' | 'obp' | 'slg'>;

/** The Athlete's runs and stolen bases in a Game: a run is a Scored move or a home run, a stolen base a move marked as a steal (GLOSSARY: Baserunning). */
export interface Baserunning {
  runs: number;
  stolenBases: number;
}

/** A base the Athlete holds once on base: the one their Outcome reached, then where they have moved (GLOSSARY: Baserunning). */
export type Base = 'first' | 'second' | 'third';

/** The Event the next Undo retracts: the newest one not already retracted, with the fields the Recorder sees on it. */
export interface Undoable {
  id: string;
  type: UndoableType;
  made?: boolean;
  value?: 2 | 3;
  outcome?: Outcome;
  strikeout?: StrikeKind;
  pitch?: Pitch;
  base?: BaseMove;
  stolen?: boolean;
}

/** A Game's Events folded into what its screens read (ADR 0001). */
export interface Fold {
  /** The Events the stats count, in seq order: none a Retraction, none retracted. */
  live: (EventRow & { type: UndoableType })[];
  counts: Counts;
  /** The latest Score Snapshot not retracted, plus the points made since; 0–0 before the first one. */
  score: Scores;
  /** The Period a new Event falls in: the newest Period start not retracted, else the first Period. */
  period: number;
  /** Whether the Athlete is on court: the newest Sub Event not retracted is a Sub In. */
  onCourt: boolean;
  /** The base the Athlete holds, while on base. */
  onBase?: Base;
  /** The count of the Plate Appearance in progress, once a Pitch is logged in it. */
  count?: PitchCount;
  /** The Shifts in order; the one on court, if any, runs to endAt. */
  shifts: Shift[];
  plusMinus: number;
  /** Milliseconds on court, summed over the Shifts. */
  shiftMs: number;
  /** When the Shifts stop: the End Game's time, or now while the Game is open. */
  endAt: string;
  batting: Batting;
  baserunning: Baserunning;
  undoable?: Undoable;
  /** Whether End Game is the Game's last Event. */
  ended: boolean;
  /** The Final Score, once End Game is the last Event. */
  final?: Scores;
}

/** IDs of the Events that a Retraction in this list undoes. */
const retractedIds = (events: EventRow[]) => new Set(events.flatMap((e) => (e.retracts_id ? [e.retracts_id] : [])));

const snapshotOf = (event: EventRow): Scores | undefined =>
  event.team_score !== null && event.opponent_score !== null
    ? { team: event.team_score, opponent: event.opponent_score }
    : undefined;

// a Sub In or Sub Out always carries its Score Snapshot (the schema's per-type CHECK), so the zero fallback never applies
const scoresOf = (event: EventRow): Scores => ({ team: event.team_score ?? 0, opponent: event.opponent_score ?? 0 });

// a Shift from its Sub In to an end (its Sub Out, or now while on court): Plus/Minus is the change in each side between the two Score Snapshots (ADR 0002)
const shiftBetween = (start: EventRow, end: { at: string; scores: Scores }): Shift => {
  const from = scoresOf(start);
  return {
    ms: Date.parse(end.at) - Date.parse(start.client_ts),
    plusMinus: end.scores.team - from.team - (end.scores.opponent - from.opponent),
  };
};

// the points an Event adds to the Athlete's total: a made Shot's value, a made Free Throw's one
const pointsOf = (event: EventRow): number => {
  if (!event.made) return 0;
  if (event.type === 'shot') return event.shot_value ?? 0;
  return event.type === 'free_throw' ? 1 : 0;
};

// the Period a new Event falls in: the newest Period start not retracted, else the first Period (`live` has no retracted Events)
const currentPeriod = (live: EventRow[]) => live.filter((e) => e.type === 'period_start').at(-1)?.period ?? 1;

const isTile = (type: EventRow['type']): type is TileEventType => (TILE_EVENT_TYPES as readonly string[]).includes(type);

// the stats a list of live Events counts, each Event once
const countOf = (live: EventRow[]): Counts => {
  const counts: Counts = {
    tiles: Object.fromEntries(TILE_EVENT_TYPES.map((type) => [type, 0])) as Record<TileEventType, number>,
    freeThrows: { made: 0, attempted: 0 },
    shots: { 2: { made: 0, attempted: 0 }, 3: { made: 0, attempted: 0 } },
    points: 0,
  };
  for (const event of live) {
    if (isTile(event.type)) counts.tiles[event.type]++;
    if (event.type === 'free_throw') {
      counts.freeThrows.attempted++;
      if (event.made) counts.freeThrows.made++;
    }
    if (event.type === 'shot' && event.shot_value) {
      counts.shots[event.shot_value].attempted++;
      if (event.made) counts.shots[event.shot_value].made++;
    }
    counts.points += pointsOf(event);
  }
  return counts;
};

// a batting line from its counts; a rate is undefined over a zero denominator (plan: Stats)
export const battingRates = (counts: BattingCounts): Batting => {
  const { atBats, hits, bases, walks, hitByPitch, sacFlies } = counts;
  const rate = (top: number, bottom: number) => (bottom > 0 ? top / bottom : undefined);
  return {
    ...counts,
    avg: rate(hits, atBats),
    obp: rate(hits + walks + hitByPitch, atBats + walks + hitByPitch + sacFlies),
    slg: rate(bases, atBats),
  };
};

// the batting line a list of live Events makes: each Plate Appearance counts once (plan: Stats)
const battingOf = (live: EventRow[]): Batting => {
  const outcomes = live.flatMap((e) => (e.type === 'plate_appearance' && e.outcome ? [e.outcome] : []));
  const n = (...of: Outcome[]) => outcomes.filter((o) => of.includes(o)).length;
  return battingRates({
    atBats: outcomes.length - n('walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt'),
    hits: n('single', 'double', 'triple', 'home_run'),
    rbi: live.reduce((sum, e) => sum + (e.type === 'plate_appearance' ? (e.rbi ?? 0) : 0), 0),
    bases: n('single') + 2 * n('double') + 3 * n('triple') + 4 * n('home_run'),
    walks: n('walk'),
    hitByPitch: n('hit_by_pitch'),
    sacFlies: n('sac_fly'),
  });
};

// the Outcomes that leave the Athlete on base, and the base each reaches; a home run scores the Athlete and holds no base
const REACHED: Partial<Record<Outcome, Base>> = {
  single: 'first',
  double: 'second',
  triple: 'third',
  walk: 'first',
  hit_by_pitch: 'first',
  reached_on_error: 'first',
  fielders_choice: 'first',
};

// the Athlete's base: the one the newest Plate Appearance reached, then each baserunning move after it; undefined once they are out or scored, and at a new Period
const onBaseOf = (live: EventRow[]): Base | undefined => {
  let base: Base | undefined;
  for (const event of live) {
    if (event.type === 'period_start') base = undefined;
    if (event.type === 'plate_appearance') base = event.outcome ? REACHED[event.outcome] : undefined;
    if (event.type === 'baserunning') base = event.base === 'second' || event.base === 'third' ? event.base : undefined;
  }
  return base;
};

// the stats a list of live Events makes: a run is a Scored move or a home run; a stolen base is a steal that advances, never an Out (a caught stealing)
const baserunningOf = (live: EventRow[]): Baserunning => ({
  runs: live.filter((e) => (e.type === 'baserunning' && e.base === 'home') || (e.type === 'plate_appearance' && e.outcome === 'home_run')).length,
  stolenBases: live.filter((e) => e.type === 'baserunning' && e.stolen && e.base !== 'out').length,
});

// the Events the stats count: none a Retraction and none retracted
const liveOf = (events: EventRow[]) => {
  const retracted = retractedIds(events);
  return events.filter((e): e is EventRow & { type: UndoableType } => e.type !== 'retraction' && !retracted.has(e.id));
};

// the count Pitches make: a foul is a strike only while the count has fewer than two (GLOSSARY: Pitch)
const pitchCountOf = (pitches: Pitch[]): PitchCount => {
  let balls = 0;
  let strikes = 0;
  for (const pitch of pitches) {
    if (pitch === 'ball') balls++;
    else if (pitch === 'foul') {
      if (strikes < 2) strikes++;
    } else strikes++;
  }
  // fouls never mark a strikeout: only the last called or swinging strike does (GLOSSARY: Strikeout looking, Strikeout swinging)
  const last = pitches.filter((pitch) => pitch === 'called_strike' || pitch === 'swinging_strike').at(-1);
  if (last === undefined) return { balls, strikes };
  return { balls, strikes, strikeout: last === 'called_strike' ? 'looking' : 'swinging' };
};

// each Plate Appearance's strikeout mark (undefined for every other Outcome), and the Pitches logged since the newest Plate Appearance or Period
const pitchesOf = (live: EventRow[]) => {
  const strikeouts = new Map<string, StrikeKind | undefined>();
  let pitches: Pitch[] = [];
  for (const event of live) {
    if (event.type === 'pitch' && event.pitch) pitches.push(event.pitch);
    if (event.type === 'period_start') pitches = [];
    if (event.type === 'plate_appearance') {
      if (event.outcome === 'strikeout') strikeouts.set(event.id, pitchCountOf(pitches).strikeout);
      pitches = [];
    }
  }
  return { strikeouts, current: pitches };
};

// the strip: the latest Score Snapshot not retracted, plus the points of the made Shots and Free Throws after it (ADR 0002); 0–0 before the first one
const latestScores = (live: EventRow[]): Scores => {
  let base: Scores = { team: 0, opponent: 0 };
  let added = 0;
  for (const event of live) {
    const snapshot = snapshotOf(event);
    if (snapshot) {
      base = snapshot;
      added = 0;
    } else added += pointsOf(event);
  }
  return { team: base.team + added, opponent: base.opponent };
};

/**
 * A Game's Events folded into what its screens read (ADR 0001). `events` is the Game's whole log in seq order, retracted Events and
 * Retractions included; `now` is the time an open Game's Shifts run to, as an ISO string.
 */
export function fold(events: EventRow[], now: string): Fold {
  const live = liveOf(events);
  const shifts: Shift[] = [];
  let onCourtSince: EventRow | undefined;
  for (const event of live) {
    if (event.type === 'sub_in') onCourtSince ??= event;
    if (event.type === 'sub_out' && onCourtSince) {
      shifts.push(shiftBetween(onCourtSince, { at: event.client_ts, scores: scoresOf(event) }));
      onCourtSince = undefined;
    }
  }
  // a Game has ended while its last Event is a game_end; an Undo End Game retracts it and the Game is open again
  const last = events.at(-1);
  const endAt = last?.type === 'game_end' ? last.client_ts : now;
  const score = latestScores(live);
  // the Shift still on court runs to the strip's latest scores, and to the End Game once the Game is over
  if (onCourtSince) shifts.push(shiftBetween(onCourtSince, { at: endAt, scores: score }));
  const pitches = pitchesOf(live);
  const latest = live.at(-1);
  return {
    live,
    counts: countOf(live),
    score,
    period: currentPeriod(live),
    onCourt: onCourtSince !== undefined,
    onBase: onBaseOf(live),
    count: pitches.current.length > 0 ? pitchCountOf(pitches.current) : undefined,
    shifts,
    plusMinus: shifts.reduce((sum, shift) => sum + shift.plusMinus, 0),
    shiftMs: shifts.reduce((sum, shift) => sum + shift.ms, 0),
    endAt,
    batting: battingOf(live),
    baserunning: baserunningOf(live),
    undoable: latest && {
      id: latest.id,
      type: latest.type,
      made: latest.made ?? undefined,
      value: latest.shot_value ?? undefined,
      outcome: latest.outcome ?? undefined,
      strikeout: pitches.strikeouts.get(latest.id),
      pitch: latest.pitch ?? undefined,
      base: latest.base ?? undefined,
      stolen: latest.stolen ?? undefined,
    },
    ended: last?.type === 'game_end',
    final: last?.type === 'game_end' ? snapshotOf(last) : undefined,
  };
}
