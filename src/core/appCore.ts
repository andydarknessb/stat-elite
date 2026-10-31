import type { Table } from 'dexie';
import {
  BASES,
  OUTCOMES,
  PITCHES,
  TILE_EVENT_TYPES,
  type AthleteRow,
  type BaseMove,
  type EventRow,
  type GameRow,
  type OutboxRow,
  type Outcome,
  type Pitch,
  type Store,
  type TileEventType,
} from './store';
import type { MemberRow, Server, SyncedTable, UploadRow } from './server';

export type { TileEventType };

export type GameFormat =
  | { sport: 'basketball'; periodFormat: 'halves' | 'quarters' }
  | { sport: 'softball' | 'baseball'; periodFormat: 'innings' };

/** What Game setup opens with: the Athlete's last Game's sport and Opponent, and today's date. */
export interface GameSetup {
  sport: GameFormat['sport'];
  /** Basketball's period format; softball and baseball are always innings. */
  basketballPeriods: 'halves' | 'quarters';
  opponentName: string;
  gameDate: string;
}

/** A Score Snapshot's Team and Opponent scores. */
export interface Scores {
  team: number;
  opponent: number;
}

export interface Home {
  athlete?: { id: string; name: string; jerseyNumber: string | null; photo?: Blob };
  /** The Athlete a tap on the photo switches to; present only when there is more than one. */
  next?: { id: string; name: string };
  liveGameId?: string;
}

/** How large the live-game buttons are (GLOSSARY: Button Size). */
export const BUTTON_SIZES = ['compact', 'standard', 'bleacher'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

const SELECTED_ATHLETE = 'selectedAthleteId';
const BUTTON_SIZE = 'buttonSize';
/** The account whose rows this phone last downloaded: a sign-in clears it, so the next one downloads again. */
const DOWNLOADED_FOR = 'downloadedFor';
/** Settings key prefix, one per Athlete another account owns and shared with this phone (ADR 0004). */
const SHARED = 'shared:';

/** Every Event type Undo can retract: all but a Retraction itself. */
export type UndoableType = Exclude<EventRow['type'], 'retraction'>;

/** A Shift: one stretch on court, from a Sub In to the Sub Out that ends it (GLOSSARY: Shift). */
export interface Shift {
  /** Milliseconds on court: to its Sub Out, or while on court, to now (or to the End Game). */
  ms: number;
  /** Team points minus Opponent points between its Score Snapshots (ADR 0002). */
  plusMinus: number;
}

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

/** The Athlete's runs and stolen bases in a Game: a run is a Scored move or a home run, a stolen base a move marked as a steal (GLOSSARY: Baserunning). */
export interface Baserunning {
  runs: number;
  stolenBases: number;
}

/** A base the Athlete holds once on base: the one their Outcome reached, then where they have moved (GLOSSARY: Baserunning). */
export type Base = 'first' | 'second' | 'third';

export interface LiveGame extends Counts {
  id: string;
  sport: GameRow['sport'];
  /** The current Period's label in the Game's format (H1, Q3, OT1, Inn 4). */
  periodLabel: string;
  /** The same stats split by Period: every Period up to the current one, a Period with no Events at zero. */
  byPeriod: Record<number, Counts>;
  /** The latest Score Snapshot not retracted; 0–0 before the first one. */
  score: Scores;
  /** The Final Score, once End Game has closed the Game. */
  final?: Scores;
  /** The Event the next Undo retracts: the newest one not already retracted. Made is set on a Shot or Free Throw, value on a Shot, pitch on a Pitch; strikeout on a strikeout Plate Appearance; base and stolen on a baserunning move. */
  undoable?: { id: string; type: UndoableType; made?: boolean; value?: 2 | 3; outcome?: Outcome; strikeout?: StrikeKind; pitch?: Pitch; base?: BaseMove; stolen?: boolean };
  /** The base the Athlete holds, while they are on base; undefined off base, once they are out or scored (the Athlete-only diamond). */
  onBase?: Base;
  /** The Game's runs and stolen bases, not retracted (softball and baseball). */
  baserunning: Baserunning;
  /** The count of the Plate Appearance in progress, once a Pitch is logged in it (GLOSSARY: Count); undefined before that. */
  count?: PitchCount;
  /** Whether the Athlete is on court: the newest Sub Event not retracted is a Sub In. */
  onCourt: boolean;
  /** The Game's Shifts in order; the one on court, if any, runs to now, or to the End Game once it is over. */
  shifts: Shift[];
  /** Plus/Minus for the Game: the sum over its Shifts (ADR 0002). */
  plusMinus: number;
  /** The Game's batting line: its Plate Appearances, not retracted (softball and baseball). */
  batting: Batting;
  /** Total Shift time over the Game's elapsed time, from its start to now or the End Game; clamped to 0–1 if the clock steps back. */
  playingShare: number;
}

/** The Athlete's stats summed over Games: points, shooting, rebounds, assists and Plus/Minus (GLOSSARY: Plus/Minus). */
export interface Line {
  points: number;
  fg: { made: number; attempted: number };
  ft: { made: number; attempted: number };
  rebounds: number;
  assists: number;
  plusMinus: number;
}

/** A finished Game in the Games feed, or its summary: the Opponent, date, Final Score and the Athlete's stats. */
export interface FeedGame {
  id: string;
  sport: GameRow['sport'];
  opponent: string;
  gameDate: string;
  /** Today, Yesterday, This Week (2 to 6 days back) or Earlier, by the phone's local date. */
  group: 'today' | 'yesterday' | 'this-week' | 'earlier';
  final: Scores;
  line: Line;
  /** The batting line: the stat line on softball and baseball (gameLineText). */
  batting: Batting;
  tiles: Record<TileEventType, number>;
  playingShare: number;
}

/** One sport's season: the basketball Games' totals, or the softball or baseball Games' batting (plan: Home). */
export type Season = { sport: 'basketball'; line: Line } | { sport: 'softball' | 'baseball'; batting: Batting };

/** The Games feed: a season line for each sport the Athlete has finished Games in, and every finished Game, newest first. */
export interface GameFeed {
  seasons: Season[];
  games: FeedGame[];
}

/** A count with its sign, as Plus/Minus reads: +3, 0, -2. */
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The totals a season or a Game shows, in words. */
export const lineText = (line: Line) =>
  `${line.points} PTS · FG ${line.fg.made}/${line.fg.attempted} · FT ${line.ft.made}/${line.ft.attempted} · ${line.rebounds} REB · ${line.assists} AST`;

/** A batting line in words: hits over At-Bats, and RBI. */
export const battingText = (batting: Batting) => `H/AB ${batting.hits}/${batting.atBats} · ${batting.rbi} RBI`;

/** A Game's stat line in words: the basketball line, or the batting line on softball and baseball. */
export const gameLineText = (game: Pick<FeedGame, 'sport' | 'line' | 'batting'>) =>
  game.sport === 'basketball' ? lineText(game.line) : battingText(game.batting);

/** The hashtag a Game's copy text ends with, by sport (GLOSSARY: Game). */
const SPORT_TAG: Record<GameRow['sport'], string> = { basketball: '#basketball', softball: '#softball', baseball: '#baseball' };

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

/** A Score Snapshot takes whole, non-negative scores. */
const isScore = (n: number) => Number.isInteger(n) && n >= 0;

// The half court in feet: x across the 50 ft width, y from the baseline (the basket end) down the 47 ft to the half-court line.
const widthFt = 50;
const basketFt = 5.25;
const arcFt = 23.75;
const cornerFt = 3;
// the corner line runs from the baseline to where it meets the arc
const cornerEndFt = basketFt + Math.sqrt(arcFt ** 2 - (widthFt / 2 - cornerFt) ** 2);
export const HALF_COURT = { widthFt, lengthFt: 47, basketFt, arcFt, cornerFt, cornerEndFt };

/**
 * The value a spot presets: 3 beyond the three-point line, which is the arc from the basket plus the corners
 * (3 ft in from each sideline, out to where they meet the arc), else 2. A spot is 0–100 on each axis.
 * shortcut: NBA lines, so the arc is 23.75 ft; FIBA's 6.75 m arc is 22.1 ft, upgrade when a league is picked
 */
export function arcPreset(x: number, y: number): 2 | 3 {
  const fx = (x / 100) * HALF_COURT.widthFt;
  const fy = (y / 100) * HALF_COURT.lengthFt;
  const fromBasket = Math.hypot(fx - widthFt / 2, fy - basketFt);
  const inCorner = (fx < cornerFt || fx > widthFt - cornerFt) && fy < cornerEndFt;
  return fromBasket > arcFt || inCorner ? 3 : 2;
}

/** A spot on the half court is 0–100 on each axis. */
const isSpot = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
/** Rounds to the 2 decimal places the schema keeps (numeric(5,2)), so the phone's copy matches the server's. */
const spot = (n: number) => Math.round(n * 100) / 100;

/** The points an Event adds to the Athlete's total: a made Shot's value, a made Free Throw's one. */
const pointsOf = (event: EventRow): number => {
  if (!event.made) return 0;
  if (event.type === 'shot') return event.shot_value ?? 0;
  return event.type === 'free_throw' ? 1 : 0;
};

// the Athlete is on court when the newest Sub Event not retracted is a Sub In
const onCourtOf = (events: EventRow[]) => {
  const retracted = retractedIds(events);
  const subs = events.filter((e) => (e.type === 'sub_in' || e.type === 'sub_out') && !retracted.has(e.id));
  return subs.at(-1)?.type === 'sub_in';
};

const isTile = (type: EventRow['type']): type is TileEventType =>
  (TILE_EVENT_TYPES as readonly string[]).includes(type);

// the Period a new Event falls in: the newest Period start not retracted, else the first Period
const currentPeriod = (events: EventRow[]) => {
  const retracted = retractedIds(events);
  return events.filter((e) => e.type === 'period_start' && !retracted.has(e.id)).at(-1)?.period ?? 1;
};

/** A Period's label in its Game's format: H1–H2 for halves, Q1–Q4 for quarters, then OT1, OT2 past regulation; Inn 1, Inn 2 for innings (GLOSSARY: Period). */
export function periodLabel(periodFormat: GameRow['period_format'], period: number): string {
  if (periodFormat === 'innings') return `Inn ${period}`;
  const regulation = periodFormat === 'halves' ? 2 : 4;
  if (period > regulation) return `OT${period - regulation}`;
  return `${periodFormat === 'halves' ? 'H' : 'Q'}${period}`;
}

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

type BattingCounts = Omit<Batting, 'avg' | 'obp' | 'slg'>;

// a batting line from its counts; a rate is undefined over a zero denominator (plan: Stats)
const battingRates = (counts: BattingCounts): Batting => {
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

// the Athlete's base: the one the newest Plate Appearance reached, then each baserunning move after it; undefined once they are out or scored
const onBaseOf = (live: EventRow[]): Base | undefined => {
  let base: Base | undefined;
  for (const event of live) {
    if (event.type === 'plate_appearance') base = event.outcome ? REACHED[event.outcome] : undefined;
    if (event.type === 'baserunning') base = event.base === 'second' || event.base === 'third' ? event.base : undefined;
  }
  return base;
};

const ORDER: Record<Base | 'home', number> = { first: 1, second: 2, third: 3, home: 4 };
/** Where the Athlete on a base can move next: each base ahead of it, and Out (GLOSSARY: Baserunning). */
export const movesFrom = (base: Base): BaseMove[] => BASES.filter((to) => to === 'out' || ORDER[to] > ORDER[base]);

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

/** The phone's local calendar date, not UTC, as YYYY-MM-DD. */
const localDate = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

// the stats Games sum to: a Game's own line is the one-Game case
const lineOf = (games: LiveGame[]): Line => {
  const line: Line = { points: 0, fg: { made: 0, attempted: 0 }, ft: { made: 0, attempted: 0 }, rebounds: 0, assists: 0, plusMinus: 0 };
  for (const game of games) {
    line.points += game.points;
    for (const value of [2, 3] as const) {
      line.fg.made += game.shots[value].made;
      line.fg.attempted += game.shots[value].attempted;
    }
    line.ft.made += game.freeThrows.made;
    line.ft.attempted += game.freeThrows.attempted;
    line.rebounds += game.tiles.reb_off + game.tiles.reb_def;
    line.assists += game.tiles.assist;
    line.plusMinus += game.plusMinus;
  }
  return line;
};

// a season's batting: its Games' counts summed, then the rates worked from the totals
const battingOfGames = (games: LiveGame[]): Batting => {
  const sum = (pick: (batting: Batting) => number) => games.reduce((total, game) => total + pick(game.batting), 0);
  return battingRates({
    atBats: sum((b) => b.atBats),
    hits: sum((b) => b.hits),
    rbi: sum((b) => b.rbi),
    bases: sum((b) => b.bases),
    walks: sum((b) => b.walks),
    hitByPitch: sum((b) => b.hitByPitch),
    sacFlies: sum((b) => b.sacFlies),
  });
};

// Today, Yesterday, This Week (2 to 6 days back), else Earlier; both dates are local calendar days, so the difference is whole days
const groupOf = (gameDate: string, today: string): FeedGame['group'] => {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${gameDate}T00:00:00Z`)) / 86_400_000;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days <= 6 ? 'this-week' : 'earlier';
};

// The phone keeps its own columns of a downloaded row, whatever more the server sends.
const athleteOf = ({ id, owner_id, name, jersey_number, created_at, updated_at }: AthleteRow): AthleteRow => ({
  id,
  owner_id,
  name,
  jersey_number,
  created_at,
  updated_at,
});
const gameOf = ({
  id,
  athlete_id,
  sport,
  period_format,
  opponent_name,
  game_date,
  created_at,
  updated_at,
  recorded_by,
}: GameRow): GameRow => ({
  id,
  athlete_id,
  sport,
  period_format,
  opponent_name,
  game_date,
  created_at,
  updated_at,
  recorded_by,
});
const eventOf = ({
  id,
  game_id,
  seq,
  client_ts,
  period,
  type,
  retracts_id,
  court_x,
  court_y,
  shot_value,
  made,
  team_score,
  opponent_score,
  outcome,
  rbi,
  pitch,
  base,
  stolen,
}: EventRow): EventRow => ({
  id,
  game_id,
  seq,
  client_ts,
  period,
  type,
  retracts_id,
  court_x,
  court_y,
  shot_value,
  made,
  team_score,
  opponent_score,
  outcome,
  rbi,
  pitch,
  base,
  stolen,
});

// the downloaded rows the phone does not hold yet, given what the store already has under their ids
const lacking = <T>(rows: T[], held: (T | undefined)[]): T[] => rows.filter((_, i) => held[i] === undefined);
// latest edit wins (ADR 0001): a downloaded Athlete or Game replaces the phone's copy only when its edit is later
const later = (row: { updated_at: string }, held?: { updated_at: string }) =>
  !held || Date.parse(row.updated_at) > Date.parse(held.updated_at);

export function createAppCore({ clock, store, server }: { clock: () => Date; store: Store; server: Server }) {
  const now = () => clock().toISOString();
  // a Game's Events in seq order
  const gameEvents = (gameId: string) => store.events.where('[game_id+seq]').between([gameId, 0], [gameId, Infinity]);
  // the strip: the latest Score Snapshot not retracted, plus the points of the made Shots and Free Throws after it (ADR 0002); 0–0 before the first one
  const latestScores = (events: EventRow[]): Scores => {
    const retracted = retractedIds(events);
    let base: Scores = { team: 0, opponent: 0 };
    let added = 0;
    for (const event of events) {
      if (retracted.has(event.id)) continue;
      const snapshot = snapshotOf(event);
      if (snapshot) {
        base = snapshot;
        added = 0;
      } else added += pointsOf(event);
    }
    return { team: base.team + added, opponent: base.opponent };
  };
  // the next Event in a Game, appended to its log
  const nextEvent = async (
    gameId: string,
    fields: Pick<EventRow, 'type' | 'retracts_id'> &
      Partial<Pick<EventRow, 'period' | 'made' | 'team_score' | 'opponent_score' | 'court_x' | 'court_y' | 'shot_value' | 'outcome' | 'rbi' | 'pitch' | 'base' | 'stolen'>>,
  ): Promise<EventRow> => {
    const events = await gameEvents(gameId).toArray();
    const last = events.at(-1);
    // End Game is always the last Event of a Game, so nothing is appended after it
    if (last?.type === 'game_end') throw new Error('This Game has ended');
    return {
      id: crypto.randomUUID(),
      game_id: gameId,
      seq: (last?.seq ?? 0) + 1,
      client_ts: now(),
      period: currentPeriod(events),
      court_x: null,
      court_y: null,
      shot_value: null,
      made: null,
      team_score: null,
      opponent_score: null,
      outcome: null,
      rbi: null,
      pitch: null,
      base: null,
      stolen: null,
      ...fields,
    };
  };

  // Every write queues its row for upload in the same transaction (ADR 0001), then tries to upload.
  const write = async <T>(tables: Table[], scope: () => Promise<T>): Promise<T> => {
    const result = await store.transaction('rw', [...tables, store.outbox], scope);
    void flush();
    return result;
  };
  const queue = (table: SyncedTable, id: string) => store.outbox.add({ table, id });

  // the row an outbox entry names, as it is now, and the id of its Athlete: a Game names its Athlete, an Event its Game
  const loadRow = async ({ table, id }: OutboxRow): Promise<{ row: UploadRow; athleteId?: string } | undefined> => {
    if (table === 'athletes') {
      const athlete = await store.athletes.get(id);
      return athlete && { row: athlete, athleteId: id };
    }
    if (table === 'games') {
      const game = await store.games.get(id);
      return game && { row: game, athleteId: game.athlete_id };
    }
    const event = await store.events.get(id);
    return event && { row: event, athleteId: (await store.games.get(event.game_id))?.athlete_id };
  };

  // Brings the account's rows down: Athletes and Games the phone lacks or holds an older edit of, Events it lacks.
  // Fetched before the transaction, since Dexie cannot span the network. Nothing here is queued for upload.
  // shortcut: every visible Event is fetched on each sign-in, launch and reconnect, not only the missing ones, fine for one child's Games; upgrade with a per-Game seq cursor when a season's Events get slow to fetch
  const download = async () => {
    const me = await server.session();
    const [athletes, games, events] = await Promise.all([
      server.download('athletes'),
      server.download('games'),
      server.download('events'),
    ]);
    await store.transaction('rw', [store.athletes, store.athletePhotos, store.games, store.events, store.settings], async () => {
      // a shared Athlete the server no longer sends was shared with this phone, so its Owner removed this account or it left (ADR 0004).
      // An Athlete this phone made is never marked, so a sign-in as another account cannot delete its unsynced rows.
      const sent = new Set(athletes.map((a) => a.id));
      const departed = (await store.settings.where('key').startsWith(SHARED).primaryKeys())
        .map((key) => key.slice(SHARED.length))
        .filter((id) => !sent.has(id));
      if (departed.length > 0) {
        const gone = new Set(await store.games.where('athlete_id').anyOf(departed).primaryKeys());
        await store.events.filter((e) => gone.has(e.game_id)).delete();
        await store.games.bulkDelete([...gone]);
        await store.athletePhotos.bulkDelete(departed);
        await store.athletes.bulkDelete(departed);
        await store.settings.bulkDelete(departed.map((id) => SHARED + id));
      }
      await store.settings.bulkPut(
        (me === undefined ? [] : athletes.filter((a) => a.owner_id !== me)).map((a) => ({ key: SHARED + a.id, value: 'shared' })),
      );
      const athleteRows = athletes.map(athleteOf);
      const athleteHeld = await store.athletes.bulkGet(athleteRows.map((r) => r.id));
      await store.athletes.bulkPut(athleteRows.filter((r, i) => later(r, athleteHeld[i])));
      const gameRows = games.map(gameOf);
      const gameHeld = await store.games.bulkGet(gameRows.map((r) => r.id));
      await store.games.bulkPut(gameRows.filter((r, i) => later(r, gameHeld[i])));
      // an Event never changes, so the phone takes only the ones it lacks
      const eventRows = events.map(eventOf);
      await store.events.bulkAdd(lacking(eventRows, await store.events.bulkGet(eventRows.map((r) => r.id))));
    });
  };

  // Uploads in sequence order, each row as it is now. A row the server cannot take stays queued, and so do the rows behind it.
  // shortcut: a row the server refuses holds up every row behind it until someone fixes it, upgrade when a refusal needs its own state
  const drain = async () => {
    const owner = await server.session();
    if (!owner) return;
    // a sign-in downloads before anything uploads, so the server's newer copies land before this phone's older ones go up
    if ((await store.settings.get(DOWNLOADED_FOR))?.value !== owner) {
      try {
        await download();
        await store.settings.put({ key: DOWNLOADED_FOR, value: owner });
      } catch (error) {
        // the marker stays unset, so the next flush tries again; uploads go on, and the server keeps the later edit either way
        console.error(error);
      }
    }
    // signing in makes the account the Owner of the phone's Athletes
    await store.athletes
      .toCollection()
      .filter((a) => a.owner_id === undefined)
      .modify({ owner_id: owner });
    // a Game recorded before sign-in takes its Recorder now, while it still waits to upload; a downloaded Game is not this phone's
    const waiting = (await store.outbox.toArray()).flatMap((entry) => (entry.table === 'games' ? [entry.id] : []));
    await store.games
      .where('id')
      .anyOf(waiting)
      .and((g) => g.recorded_by === undefined)
      .modify({ recorded_by: owner });
    for (const entry of await store.outbox.orderBy('seq').toArray()) {
      const loaded = await loadRow(entry);
      if (!loaded) {
        await store.outbox.delete(entry.seq!);
        continue;
      }
      const athlete = await store.athletes.get(loaded.athleteId ?? '');
      try {
        await server.upload(entry.table, { ...loaded.row, owner_id: athlete?.owner_id });
      } catch {
        return;
      }
      await store.outbox.delete(entry.seq!);
    }
  };
  // one drain at a time, each starting after the one before it has finished
  let draining: Promise<void> = Promise.resolve();
  const after = (task: () => Promise<void>): Promise<void> => (draining = draining.then(task).catch(console.error));
  const flush = () => after(drain);
  // launch and reconnect: the download runs again, after any drain in flight, then the queue uploads (ADR 0004)
  const refresh = () =>
    after(async () => {
      await store.settings.delete(DOWNLOADED_FOR);
      await drain();
    });

  // whether the phone's account owns the Athlete, or the phone is signed out: Edit and Invite are the Owner's (ADR 0004)
  const isOwner = async (athleteId: string) => {
    const owner = (await store.athletes.get(athleteId))?.owner_id;
    return owner === undefined || owner === (await server.session());
  };

  const liveGame = async (gameId: string): Promise<LiveGame | undefined> => {
    const game = await store.games.get(gameId);
    if (!game) return undefined;
    const events = await gameEvents(gameId).toArray();
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
    // End Game is always the last Event, so a finished Game ends on its game_end
    const last = events.at(-1);
    const period = currentPeriod(events);
    const byPeriod: Record<number, Counts> = {};
    for (let p = 1; p <= period; p++) byPeriod[p] = countOf(live.filter((e) => e.period === p));
    const latest = live.at(-1);
    const pitches = pitchesOf(live);
    const score = latestScores(events);
    // the Shift still on court runs to the strip's latest scores, and to the End Game once the Game is over
    const endAt = last?.type === 'game_end' ? last.client_ts : now();
    if (onCourtSince) shifts.push(shiftBetween(onCourtSince, { at: endAt, scores: score }));
    const total = shifts.reduce((sum, shift) => sum + shift.ms, 0);
    // the Game's elapsed time runs from its start (startGame's created_at), so a late first Sub In reads its true share
    const elapsed = Date.parse(endAt) - Date.parse(game.created_at);
    return {
      ...countOf(live),
      id: game.id,
      sport: game.sport,
      periodLabel: periodLabel(game.period_format, period),
      byPeriod,
      score,
      final: last?.type === 'game_end' ? snapshotOf(last) : undefined,
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
      count: pitches.current.length > 0 ? pitchCountOf(pitches.current) : undefined,
      onCourt: onCourtSince !== undefined,
      shifts,
      plusMinus: shifts.reduce((sum, shift) => sum + shift.plusMinus, 0),
      batting: battingOf(live),
      onBase: onBaseOf(live),
      baserunning: baserunningOf(live),
      playingShare: elapsed > 0 ? Math.min(1, Math.max(0, total / elapsed)) : 0,
    };
  };

  // a Game as the feed and its summary show it, from its live read; undefined while the Game is still in progress
  const finishedGame = async (game: GameRow, today: string): Promise<{ row: FeedGame; live: LiveGame } | undefined> => {
    const live = await liveGame(game.id);
    const final = live?.final;
    if (!live || !final) return undefined;
    return {
      live,
      row: {
        id: game.id,
        sport: game.sport,
        opponent: game.opponent_name,
        gameDate: game.game_date,
        group: groupOf(game.game_date, today),
        final,
        line: lineOf([live]),
        batting: live.batting,
        tiles: live.tiles,
        playingShare: live.playingShare,
      },
    };
  };

  return {
    async addAthlete({ name, jerseyNumber, photo }: { name: string; jerseyNumber?: string; photo?: Blob }): Promise<string> {
      const id = crypto.randomUUID();
      const ts = now();
      await write([store.athletes, store.athletePhotos], async () => {
        await store.athletes.add({ id, name, jersey_number: jerseyNumber?.trim() || null, created_at: ts, updated_at: ts });
        await queue('athletes', id);
        if (photo) await store.athletePhotos.add({ athlete_id: id, photo });
      });
      return id;
    },

    async editAthlete({ id, name, jerseyNumber }: { id: string; name: string; jerseyNumber: string }): Promise<void> {
      await write([store.athletes], async () => {
        await store.athletes.update(id, { name, jersey_number: jerseyNumber.trim() || null, updated_at: now() });
        await queue('athletes', id);
      });
    },

    async startGame({
      athleteId,
      opponentName,
      gameDate,
      sport,
      periodFormat,
    }: { athleteId: string; opponentName: string; gameDate: string } & GameFormat): Promise<string> {
      const opponent = opponentName.trim();
      if (!opponent || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) throw new Error('A Game needs an Opponent and a date');
      const id = crypto.randomUUID();
      const date = clock();
      // the signed-in account records the Game; a signed-out phone's Game takes its Recorder at sign-in
      const recorder = await server.session();
      await write([store.games], async () => {
        await store.games.add({
          id,
          athlete_id: athleteId,
          sport,
          period_format: periodFormat,
          opponent_name: opponent,
          game_date: gameDate,
          created_at: date.toISOString(),
          updated_at: date.toISOString(),
          recorded_by: recorder,
        });
        await queue('games', id);
      });
      return id;
    },

    /** Writes the Event to the store before resolving (ADR 0001). */
    recordTile(gameId: string, type: TileEventType): Promise<EventRow> {
      // One rw transaction at a time per store, so taps in quick succession still get distinct seqs.
      return write([store.events], async () => {
        const event = await nextEvent(gameId, { type, retracts_id: null });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** A Shot: its spot, value and result, written together when the Recorder taps MAKE or MISS (GLOSSARY: Shot). */
    async recordShot(gameId: string, shot: { x: number; y: number; value: 2 | 3; made: boolean }): Promise<EventRow> {
      if (!isSpot(shot.x) || !isSpot(shot.y) || (shot.value !== 2 && shot.value !== 3)) {
        throw new Error('A Shot needs a spot on the court and a value of 2 or 3');
      }
      return write([store.events], async () => {
        const event = await nextEvent(gameId, {
          type: 'shot',
          retracts_id: null,
          court_x: spot(shot.x),
          court_y: spot(shot.y),
          shot_value: shot.value,
          made: shot.made,
        });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** A Free Throw: its result, and no spot (GLOSSARY: Free Throw). */
    recordFreeThrow(gameId: string, made: boolean): Promise<EventRow> {
      return write([store.events], async () => {
        const event = await nextEvent(gameId, { type: 'free_throw', retracts_id: null, made });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** A Pitch: one ball, strike or foul in the Plate Appearance in progress; Pitches are optional (GLOSSARY: Pitch, Count). */
    async recordPitch(gameId: string, pitch: Pitch): Promise<EventRow> {
      if (!PITCHES.includes(pitch)) throw new Error('A Pitch is a ball, a called or swinging strike, or a foul');
      return write([store.events], async () => {
        const event = await nextEvent(gameId, { type: 'pitch', retracts_id: null, pitch });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** A Plate Appearance: its Outcome and RBI count, written together once the Recorder picks the RBI chip (GLOSSARY: Plate Appearance). */
    async recordPlateAppearance(gameId: string, { outcome, rbi }: { outcome: Outcome; rbi: number }): Promise<EventRow> {
      if (!OUTCOMES.includes(outcome) || !Number.isInteger(rbi) || rbi < 0 || rbi > 4) {
        throw new Error('A Plate Appearance needs an Outcome and an RBI count of 0 to 4');
      }
      return write([store.events], async () => {
        const event = await nextEvent(gameId, { type: 'plate_appearance', retracts_id: null, outcome, rbi });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** A baserunning move: where the Athlete on base goes, and whether it was a steal; the Athlete only, never a teammate (GLOSSARY: Baserunning). */
    async recordBaserunning(gameId: string, { base, stolen }: { base: BaseMove; stolen: boolean }): Promise<EventRow> {
      if (!BASES.includes(base) || typeof stolen !== 'boolean') throw new Error('A baserunning move needs a base and whether it was a steal');
      return write([store.events], async () => {
        const runner = onBaseOf(liveOf(await gameEvents(gameId).toArray()));
        if (!runner) throw new Error('Only an Athlete on base can move');
        if (!movesFrom(runner).includes(base)) throw new Error(`An Athlete on ${runner} cannot move to ${base}`);
        const event = await nextEvent(gameId, { type: 'baserunning', retracts_id: null, base, stolen });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** Next period: a period_start Event that opens the Period after the current one, and carries it (GLOSSARY: Period). */
    nextPeriod(gameId: string): Promise<EventRow> {
      return write([store.events], async () => {
        const period = currentPeriod(await gameEvents(gameId).toArray()) + 1;
        const event = await nextEvent(gameId, { type: 'period_start', retracts_id: null, period });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** Moves one side of the strip one point and records the new absolute scores as a Score Snapshot (ADR 0002). */
    adjustScore(gameId: string, side: 'team' | 'opponent', delta: 1 | -1): Promise<EventRow | undefined> {
      return write([store.events], async () => {
        const scores = latestScores(await gameEvents(gameId).toArray());
        const team = scores.team + (side === 'team' ? delta : 0);
        const opponent = scores.opponent + (side === 'opponent' ? delta : 0);
        if (!isScore(team) || !isScore(opponent)) return undefined;
        const event = await nextEvent(gameId, { type: 'score', retracts_id: null, team_score: team, opponent_score: opponent });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** Sub In when the Athlete is off court, else Sub Out; each records the strip's Score Snapshot (GLOSSARY: Sub In / Sub Out). */
    toggleSub(gameId: string): Promise<EventRow> {
      return write([store.events], async () => {
        const events = await gameEvents(gameId).toArray();
        const scores = latestScores(events);
        const event = await nextEvent(gameId, {
          type: onCourtOf(events) ? 'sub_out' : 'sub_in',
          retracts_id: null,
          team_score: scores.team,
          opponent_score: scores.opponent,
        });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** End Game: the Final Score, recorded as a game_end Event, closes the Game. Refused without whole scores. */
    async endGame(gameId: string, final: { teamScore: number; opponentScore: number }): Promise<EventRow> {
      if (!isScore(final.teamScore) || !isScore(final.opponentScore)) throw new Error('End Game needs a Final Score');
      return write([store.events], async () => {
        const event = await nextEvent(gameId, {
          type: 'game_end',
          retracts_id: null,
          team_score: final.teamScore,
          opponent_score: final.opponentScore,
        });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** Appends a Retraction for the newest Event not yet retracted; no Event is changed. */
    undo(gameId: string): Promise<EventRow | undefined> {
      return write([store.events], async () => {
        const events = await gameEvents(gameId).toArray();
        const retracted = retractedIds(events);
        let target: EventRow | undefined;
        for (const event of events) {
          if (event.type !== 'retraction' && !retracted.has(event.id)) target = event;
        }
        if (!target) return undefined;
        const retraction = await nextEvent(gameId, { type: 'retraction', retracts_id: target.id });
        await store.events.add(retraction);
        await queue('events', retraction.id);
        return retraction;
      });
    },

    /** Game setup's prefilled fields: the newest Game's sport, period format and Opponent, and today's date. */
    async gameSetup(athleteId: string): Promise<GameSetup> {
      const last = (await store.games.where('athlete_id').equals(athleteId).sortBy('created_at')).at(-1);
      return {
        sport: last?.sport ?? 'basketball',
        basketballPeriods: last?.sport === 'basketball' && last.period_format === 'halves' ? 'halves' : 'quarters',
        opponentName: last?.opponent_name ?? 'Opponent',
        gameDate: localDate(clock()),
      };
    },

    async switchAthlete(athleteId: string): Promise<void> {
      await store.settings.put({ key: SELECTED_ATHLETE, value: athleteId });
    },

    /** Button Size is a phone setting: Standard until a Recorder picks one. */
    async buttonSize(): Promise<ButtonSize> {
      const value = (await store.settings.get(BUTTON_SIZE))?.value;
      return BUTTON_SIZES.find((size) => size === value) ?? 'standard';
    },

    async setButtonSize(size: ButtonSize): Promise<void> {
      await store.settings.put({ key: BUTTON_SIZE, value: size });
    },

    async home(): Promise<Home> {
      const athletes = await store.athletes.orderBy('created_at').toArray();
      if (athletes.length === 0) return {};
      // falls back to the first Athlete added when nothing is chosen yet
      const selectedId = (await store.settings.get(SELECTED_ATHLETE))?.value;
      const index = Math.max(0, athletes.findIndex((a) => a.id === selectedId));
      const athlete = athletes[index];
      const photo = await store.athletePhotos.get(athlete.id);
      const next = athletes[(index + 1) % athletes.length];
      // the newest Game that End Game has not closed is the one in progress, and only its Recorder's phone records on it
      const games = await store.games.where('athlete_id').equals(athlete.id).sortBy('created_at');
      const session = await server.session();
      let liveGameId: string | undefined;
      for (const game of [...games].reverse()) {
        // a Game stored before Recorders were is the Owner's; one waiting on sign-in has no Recorder yet, and this phone recorded it
        const recorder = game.recorded_by === undefined ? athlete.owner_id : game.recorded_by;
        if (recorder !== session) continue;
        if ((await gameEvents(game.id).last())?.type !== 'game_end') {
          liveGameId = game.id;
          break;
        }
      }
      return {
        athlete: { id: athlete.id, name: athlete.name, jerseyNumber: athlete.jersey_number, photo: photo?.photo },
        next: athletes.length > 1 ? { id: next.id, name: next.name } : undefined,
        liveGameId,
      };
    },

    liveGame,

    /** The Games feed: the season line over the Athlete's finished basketball Games, and every finished Game, newest first. */
    async gameFeed(athleteId: string): Promise<GameFeed> {
      // shortcut: reads every Game's Events on each feed read, fine for one Athlete's season; upgrade with a stored season line when the feed reads slow
      const today = localDate(clock());
      const rows = (await store.games.where('athlete_id').equals(athleteId).sortBy('created_at')).reverse();
      const finished = (await Promise.all(rows.map((row) => finishedGame(row, today)))).flatMap((f) => (f ? [f] : []));
      // the sort is stable, so Games on one date stay newest-started first
      const games = finished.map(({ row }) => row).sort((a, b) => b.gameDate.localeCompare(a.gameDate));
      const lives = finished.map(({ live }) => live);
      // a season for each sport played; with no finished Game, the basketball season reads zero, as Home always has
      const seasons: Season[] = (['basketball', 'softball', 'baseball'] as const).flatMap((sport) => {
        const played = lives.filter((live) => live.sport === sport);
        if (played.length === 0) return [];
        return [sport === 'basketball' ? { sport, line: lineOf(played) } : { sport, batting: battingOfGames(played) }];
      });
      return { seasons: seasons.length > 0 ? seasons : [{ sport: 'basketball', line: lineOf([]) }], games };
    },

    /** A finished Game's summary; undefined while the Game is still in progress. */
    async gameSummary(gameId: string): Promise<FeedGame | undefined> {
      const game = await store.games.get(gameId);
      return game && (await finishedGame(game, localDate(clock())))?.row;
    },

    /** Game Complete's ready-to-paste text: the Final Score, the Athlete's line and Plus/Minus, and the sport's hashtag; undefined while the Game is in progress. Counts only un-retracted Events, as the summary does. */
    async gameCopyText(gameId: string): Promise<string | undefined> {
      const game = await store.games.get(gameId);
      const summary = game && (await finishedGame(game, localDate(clock())))?.row;
      if (!game || !summary) return undefined;
      const name = (await store.athletes.get(game.athlete_id))?.name ?? 'Athlete';
      return [
        `${name} vs ${summary.opponent}: ${summary.final.team}–${summary.final.opponent} final`,
        `${name}: ${gameLineText(summary)} · Plus/Minus ${signed(summary.line.plusMinus)}`,
        SPORT_TAG[game.sport],
      ].join('\n');
    },

    /** Game Complete's share card: the Athlete's name and photo, the Opponent, the Final Score and the line; undefined while the Game is in progress. The photo only leaves the phone inside the image. */
    async gameCard(gameId: string) {
      const game = await store.games.get(gameId);
      const summary = game && (await finishedGame(game, localDate(clock())))?.row;
      if (!game || !summary) return undefined;
      const athlete = await store.athletes.get(game.athlete_id);
      const photo = await store.athletePhotos.get(game.athlete_id);
      return {
        athlete: athlete?.name ?? 'Athlete',
        photo: photo?.photo,
        opponent: summary.opponent,
        final: summary.final,
        line: gameLineText(summary),
      };
    },

    /** Signs the Recorder in with a magic link, then uploads everything recorded so far. An Invite's token rides in the link. */
    async signIn(email: string, invite?: string): Promise<void> {
      await server.signIn(email, invite);
      // the account is signing in here, so it downloads again even if this phone has downloaded it before
      await store.settings.delete(DOWNLOADED_FOR);
      await flush();
    },

    /** Makes an Invite to one of the Recorder's Athletes; its token goes out in the share link. */
    createInvite(athleteId: string): Promise<string> {
      return server.createInvite(athleteId);
    },

    /** Whether Invite co-parent is offered: the signed-in account is the Athlete's Owner. */
    async canInvite(athleteId: string): Promise<boolean> {
      const owner = (await store.athletes.get(athleteId))?.owner_id;
      return owner !== undefined && owner === (await server.session());
    },

    isOwner,

    /** Makes the signed-in account a Member of the Invite's Athlete, then brings the Athlete and its Games down (ADR 0004). */
    async acceptInvite(token: string): Promise<void> {
      // cleared first, so a download that fails after the accept is retried by the next flush
      await store.settings.delete(DOWNLOADED_FOR);
      await server.acceptInvite(token);
      await download();
    },

    /** The Owner's Members list for one of its Athletes (ADR 0004). */
    members(athleteId: string): Promise<MemberRow[]> {
      return server.members(athleteId);
    },

    /** The Owner removes a Member; the Member's phone drops the Athlete at its next download (ADR 0004). */
    removeMember(athleteId: string, memberId: string): Promise<void> {
      return server.removeMember(athleteId, memberId);
    },

    /** A Member leaves an Athlete: the Athlete drops from this phone now, and the Games it recorded stay with the Athlete (ADR 0004). */
    async leave(athleteId: string): Promise<void> {
      // once the membership is gone the server refuses this phone's rows on the Athlete, so they upload first and the leave waits for them
      await flush();
      for (const entry of await store.outbox.toArray()) {
        if ((await loadRow(entry))?.athleteId === athleteId) throw new Error('Not everything on this Athlete has synced yet');
      }
      await server.leave(athleteId);
      await download();
      void flush();
    },

    /** The "N not synced" badge: whether the Recorder is signed in, and how many rows still live only on the phone. */
    async sync(): Promise<{ signedIn: boolean; notSynced: number }> {
      const pending = await store.outbox.toArray();
      return {
        signedIn: (await server.session()) !== undefined,
        notSynced: new Set(pending.map(({ table, id }) => `${table}:${id}`)).size,
      };
    },

    /** Uploads whatever is queued. Called after every write. */
    flush,

    /** Launch and reconnect: brings the account's rows down again, then uploads whatever is queued. */
    refresh,
  };
}

export type AppCore = ReturnType<typeof createAppCore>;
