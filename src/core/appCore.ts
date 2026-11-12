import type { Table } from 'dexie';
import {
  BASES,
  OUTCOMES,
  PITCHES,
  type AthletePhotoRow,
  type AthleteRow,
  type BaseMove,
  type EventRow,
  type GameRow,
  type GameTotals,
  type MadeAttempted,
  type OutboxRow,
  type Outcome,
  type Pitch,
  type Store,
  type TileEventType,
} from './store';
import { RowRefused, type MemberRow, type Server, type SyncedTable, type UploadRow } from './server';
import { createPhoneAccount } from './phoneAccount';
import { battingRates, fold, type Base, type Batting, type Baserunning, type Counts, type Fold, type PitchCount, type Scores, type ShotSpot, type Shift, type Undoable } from './eventLog';
import { HALF_COURT } from './court';
import { backlogProblem, eventsFromTotals, NO_FIELDS } from './totals';
import { gameLineText, initials, signed } from './words';

export type { TileEventType };
export type { Base, Batting, Baserunning, Counts, PitchCount, Scores, Shift, StrikeKind, UndoableType } from './eventLog';

export type GameFormat =
  | { sport: 'basketball'; periodFormat: 'halves' | 'quarters' | 'eighths' }
  | { sport: 'softball' | 'baseball'; periodFormat: 'innings' };

/** What Game setup opens with: the Athlete's last Game's sport and Opponent, and today's date. */
export interface GameSetup {
  sport: GameFormat['sport'];
  /** Basketball's period format; softball and baseball are always innings. */
  basketballPeriods: 'halves' | 'quarters' | 'eighths';
  /** Whether the Athlete's last recorded basketball Game had Three-Pointers on; on when there is none. */
  threePointers: boolean;
  opponentName: string;
  gameDate: string;
}

/** A Backlogged Game as the Recorder enters it: its Athlete, sport, Opponent, date played and Totals (ADR 0005). */
export interface BacklogEntry {
  athleteId: string;
  sport: GameRow['sport'];
  opponentName: string;
  gameDate: string;
  totals: GameTotals;
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
const FIELD_MODE = 'fieldMode';
// A photo is stored as its bytes (#217); a row a Phone stored before that holds the Blob itself
const photoOf = (row?: AthletePhotoRow): Blob | undefined => row?.photo ?? (row?.bytes && new Blob([row.bytes], { type: row.type }));
/** Settings key prefix, one per Athlete another account owns and shared with this phone (ADR 0004). */
const SHARED = 'shared:';
/** Settings key prefix, one per Game this phone first received by download: another phone records it (ADR 0009). */
const RECEIVED = 'received:';
/** Settings key prefix, one per Athlete the Owner removed this account from, valued with its name: the line the phone shows until its OK (ADR 0004). */
const REMOVED = 'removed:';
/** Settings key prefix, one per Athlete this Owner's phone holds the Members of, valued with their ids and labels as the phone last saw them (ADR 0004). */
const MEMBERS = 'members:';
/** Settings key prefix, one per Member this Owner's phone saw leave an Athlete: the line it shows until its OK (ADR 0004). */
const GONE = 'gone:';
type KeptMember = { id: string; label: string };
const goneKey = (athleteId: string, memberId: string) => `${GONE}${athleteId} ${memberId}`;
/** Settings key: the seq of the row the server last refused. Home's Refused Row notice reads it while that row still waits (#208, #237). */
const REFUSED_ROW = 'refusedRow';
const NOT_SYNCED = 'Not everything on this Athlete has synced yet';
/** What Sign out says when the phone is not cleared: rows still queued, or the server refuses or cannot be reached. */
export const SIGN_OUT_REFUSED = 'Could not sign out. Wait for everything to sync and check the connection, then try again.';
export interface LiveGame extends Counts {
  id: string;
  sport: GameRow['sport'];
  /** Off only for a Game whose Recorder turned Three-Pointers off in Game setup (GLOSSARY: Three-Pointers). */
  threePointers: boolean;
  /** The name of the Game's Athlete as it reads now, or 'Athlete' if their record is missing: the Team's label (GLOSSARY: Team). */
  athleteName: string;
  /** The current Period's label in the Game's format (H1, Q3, OT1, Inn 4). */
  periodLabel: string;
  /** The latest Score Snapshot not retracted; 0–0 before the first one. */
  score: Scores;
  /** The Final Score, once End Game has closed the Game. */
  final?: Scores;
  /** The Event the next Undo retracts: the newest one not already retracted. Made is set on a Shot or Free Throw, value on a Shot, pitch on a Pitch; strikeout on a strikeout Plate Appearance; base and stolen on a baserunning move. */
  undoable?: Undoable;
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
  /** Each Shot's Spot and result, not retracted (the Summary's dots). */
  spots: ShotSpot[];
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
  /** As on LiveGame. */
  athleteName: string;
  opponent: string;
  gameDate: string;
  /** Today, Yesterday, This Week (2 to 6 days back) or Earlier, by the phone's local date. */
  group: 'today' | 'yesterday' | 'this-week' | 'earlier';
  final: Scores;
  line: Line;
  /** The batting line: the stat line on softball and baseball (gameLineText). */
  batting: Batting;
  /** The runs and stolen bases a softball or baseball line adds to its batting (gameLineText). */
  baserunning: Baserunning;
  tiles: Record<TileEventType, number>;
  playingShare: number;
  /** Each Shot's Spot and result, not retracted: the Summary draws them on the half court. A Backlogged Game has none (ADR 0005). */
  spots: ShotSpot[];
  /** A Backlogged Game, entered from its Totals after it was played (ADR 0005). */
  backlogged: boolean;
}

/** One sport's season: the basketball Games' totals, or the softball or baseball Games' batting and baserunning (plan: Home). */
export type Season = { sport: 'basketball'; line: Line } | { sport: 'softball' | 'baseball'; batting: Batting; baserunning: Baserunning };

/** The Games feed: a season line for each sport the Athlete has finished Games in, and every finished Game, newest first. */
export interface GameFeed {
  seasons: Season[];
  games: FeedGame[];
}

/** The hashtag a Game's copy text ends with, by sport (GLOSSARY: Game). */
const SPORT_TAG: Record<GameRow['sport'], string> = { basketball: '#basketball', softball: '#softball', baseball: '#baseball' };

/** A Score Snapshot takes whole scores from 0 to 999, the limit Totals have: a larger score saves on the phone and the server refuses it. */
export const SCORE_MAX = 999;
const isScore = (n: number) => Number.isInteger(n) && n >= 0 && n <= SCORE_MAX;

const { widthFt, basketFt, arcFt, cornerFt, cornerEndFt } = HALF_COURT;
// a spot's distance in feet from the basket: the measure arcPreset and the Zones share
const basketDistanceFt = (x: number, y: number) => Math.hypot((x / 100) * widthFt - widthFt / 2, (y / 100) * HALF_COURT.lengthFt - basketFt);

/**
 * The value a spot presets: 3 beyond the three-point line, which is the NFHS arc from the basket plus the corners
 * (5.25 ft in from each sideline, out to where they meet the arc), else 2. A spot is 0–100 on each axis.
 */
export function arcPreset(x: number, y: number): 2 | 3 {
  const fx = (x / 100) * HALF_COURT.widthFt;
  const fy = (y / 100) * HALF_COURT.lengthFt;
  const fromBasket = basketDistanceFt(x, y);
  const inCorner = (fx < cornerFt || fx > widthFt - cornerFt) && fy < cornerEndFt;
  return fromBasket > arcFt || inCorner ? 3 : 2;
}

/** A spot on the half court is 0–100 on each axis. */
const isSpot = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
/** Rounds to the 2 decimal places the schema keeps (numeric(5,2)), so the phone's copy matches the server's. */
const spot = (n: number) => Math.round(n * 100) / 100;

// the Periods a regulation Game has: 2 halves, 8 eighths, else 4 quarters (innings are not counted here)
const regulationOf = (periodFormat: GameRow['period_format']) => (periodFormat === 'halves' ? 2 : periodFormat === 'eighths' ? 8 : 4);

/** A Period's label in its Game's format: H1–H2 for halves, Q1–Q4 for quarters, P1–P8 for eighths, then OT1, OT2 past regulation; Inn 1, Inn 2 for innings (GLOSSARY: Period). */
export function periodLabel(periodFormat: GameRow['period_format'], period: number): string {
  if (periodFormat === 'innings') return `Inn ${period}`;
  const regulation = regulationOf(periodFormat);
  if (period > regulation) return `OT${period - regulation}`;
  const prefix = periodFormat === 'halves' ? 'H' : periodFormat === 'eighths' ? 'P' : 'Q';
  return `${prefix}${period}`;
}

const ORDER: Record<Base | 'home', number> = { first: 1, second: 2, third: 3, home: 4 };
/** Where the Athlete on a base can move next: each base ahead of it, and Out (GLOSSARY: Baserunning). */
export const movesFrom = (base: Base): BaseMove[] => BASES.filter((to) => to === 'out' || ORDER[to] > ORDER[base]);

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

// a season's runs and stolen bases: its Games' counts summed
const baserunningOfGames = (games: LiveGame[]): Baserunning => ({
  runs: games.reduce((total, game) => total + game.baserunning.runs, 0),
  stolenBases: games.reduce((total, game) => total + game.baserunning.stolenBases, 0),
});

// Today, Yesterday, This Week (2 to 6 days back), else Earlier; both dates are local calendar days, so the difference is whole days
const groupOf = (gameDate: string, today: string): FeedGame['group'] => {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${gameDate}T00:00:00Z`)) / 86_400_000;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days <= 6 ? 'this-week' : 'earlier';
};

// The phone keeps its own columns of a downloaded row, whatever more the server sends.
const pick = <T, K extends keyof T>(row: T, keys: K[]): Pick<T, K> => Object.fromEntries(keys.map((key) => [key, row[key]])) as Pick<T, K>;
const athleteOf = (row: AthleteRow): AthleteRow => pick(row, ['id', 'owner_id', 'name', 'jersey_number', 'created_at', 'updated_at']);
const gameOf = (row: GameRow): GameRow =>
  pick(row, ['id', 'athlete_id', 'sport', 'period_format', 'opponent_name', 'game_date', 'created_at', 'updated_at', 'recorded_by', 'totals', 'removed', 'three_pointers']);
const eventOf = (row: EventRow): EventRow =>
  pick(row, [
    'id', 'game_id', 'seq', 'client_ts', 'period', 'type', 'retracts_id', 'court_x', 'court_y', 'shot_value', 'made', 'team_score', 'opponent_score', 'outcome', 'rbi', 'pitch', 'base', 'stolen',
  ]);

// the downloaded rows the phone does not hold yet, given what the store already has under their ids
const lacking = <T>(rows: T[], held: (T | undefined)[]): T[] => rows.filter((_, i) => held[i] === undefined);
// latest edit wins (ADR 0001): a downloaded Athlete or Game replaces the phone's copy only when its edit is later
const later = (row: { updated_at: string }, held?: { updated_at: string }) =>
  !held || Date.parse(row.updated_at) > Date.parse(held.updated_at);

/** A Member as the Owner's list shows it: named by its sign-in email, or by when it joined when none was recorded. */
export type Member = MemberRow & { label: string };
const labelled = (member: MemberRow): Member => ({
  ...member,
  label: member.email ?? `Joined ${new Date(member.joined_at).toLocaleDateString()}`,
});

/** A Member an Owner's phone saw leave one of its Athletes, named for the line that says so (ADR 0004). */
export type GoneMember = { athleteId: string; memberId: string; label: string; athleteName: string };

/** What deleting the account does to one Athlete the phone holds (ADR 0004): it passes to its first Member, is deleted with its Games, or this account leaves it. A Phone whose Session the server ended only clears itself: 'removed'. */
export type AthleteFate =
  | { name: string; fate: 'passes'; to: string }
  | { name: string; fate: 'deleted'; games: number }
  | { name: string; fate: 'left' }
  | { name: string; fate: 'removed' };

/** What deleting the account does: each Athlete's fate, the photos this phone clears, and the rows not yet uploaded. */
export interface DeletionSummary {
  athletes: AthleteFate[];
  photos: number;
  unsynced: number;
}

/** A Practice Focus card: the rule that fired, its title, and the drill it recommends (GLOSSARY: Practice Focus). */
export interface PracticeFocus {
  title: string;
  drill: string;
}

/** Attempts of one kind and how many went in (GLOSSARY: Practice Focus). */
const tally = (): MadeAttempted => ({ made: 0, attempted: 0 });
const count = (t: MadeAttempted, made: boolean | null) => {
  t.attempted++;
  if (made) t.made++;
};

/** A Zone: where a Shot falls for Practice Focus (GLOSSARY: Zone). rim and the two center Zones feed no rule. */
export type Zone = 'rim' | `${'mid' | 'three'}-${'left' | 'center' | 'right'}`;
// rim under 8 ft from the basket, else mid or three by the Shot's value, then left, center or right by its court_x
// shared with the court's name (#248), so a keyboard Shot names the Zone Practice Focus will count it in
export const zoneOf = (x: number, y: number, value: 2 | 3): Zone => {
  if (basketDistanceFt(x, y) < 8) return 'rim';
  const side = x < 40 ? 'left' : x <= 60 ? 'center' : 'right';
  return `${value === 2 ? 'mid' : 'three'}-${side}`;
};

// high is at least 20 points above low: exact fractions, cross-multiplied so no float rounding (high − low ≥ 1/5)
const atLeast20Above = (high: MadeAttempted, low: MadeAttempted) => 5 * (high.made * low.attempted - low.made * high.attempted) >= high.attempted * low.attempted;

// the cards the rules make over the given Games, each Game's Events already live (none retracted)
const practiceFocusOf = (games: { periodFormat: GameRow['period_format']; events: EventRow[] }[]): PracticeFocus[] => {
  const freeThrows = { early: tally(), late: tally() };
  const zones: Partial<Record<Zone, MadeAttempted>> = {};
  for (const { periodFormat, events } of games) {
    for (const event of events) {
      // late is past half of regulation: Q3 on in quarters, H2 on in halves, P5 on in 8 Periods, every overtime
      if (event.type === 'free_throw') count(event.period > regulationOf(periodFormat) / 2 ? freeThrows.late : freeThrows.early, event.made);
      if (event.type === 'shot' && event.court_x !== null && event.court_y !== null && event.shot_value !== null) {
        const where = zoneOf(event.court_x, event.court_y, event.shot_value);
        count((zones[where] ??= tally()), event.made);
      }
    }
  }
  const zoneTally = (z: Zone) => zones[z] ?? tally();

  const { early, late } = freeThrows;
  const freeThrowCards: PracticeFocus[] =
    early.attempted >= 10 && late.attempted >= 10 && atLeast20Above(early, late)
      ? [{ title: 'Free Throws when tired', drill: 'End practice with 10 Free Throws right after a hard sprint. Count the makes.' }]
      : [];
  // a mirrored pair of Zones with 10 attempts each: the lower one, 20 points under its mirror, names the weak side
  const weakSide = (spot: 'mid' | 'three', label: string): PracticeFocus[] => {
    const left = zoneTally(`${spot}-left`);
    const right = zoneTally(`${spot}-right`);
    if (left.attempted < 10 || right.attempted < 10) return [];
    const side = atLeast20Above(right, left) ? 'left' : atLeast20Above(left, right) ? 'right' : undefined;
    return side ? [{ title: 'Weak side', drill: `25 shots from the ${side} ${label} spot, then 10 drives to that side finishing with that hand.` }] : [];
  };
  return [...freeThrowCards, ...weakSide('mid', 'mid-range'), ...weakSide('three', '3-point')];
};

// the account that recorded a Game: a Game stored before Recorders were is the Owner's, and one waiting on sign-in has none yet, so this phone recorded it
const recorderOf = (game: GameRow, owner: string | undefined) => (game.recorded_by === undefined ? owner : game.recorded_by);

/** The fields a command sets on its Event: its type, and whichever others that type carries. */
type Fields = Pick<EventRow, 'type'> & Partial<EventRow>;

export function createAppCore({ clock, store, server }: { clock: () => Date; store: Store; server: Server }) {
  const now = () => clock().toISOString();
  // a Game's Events in seq order
  const gameEvents = (gameId: string) => store.events.where('[game_id+seq]').between([gameId, 0], [gameId, Infinity]);
  // the Athlete's Games in the Games tab's order: game_date newest first, created_at newest first within a date (the sort is stable)
  // a removed Game is hidden on every phone (ADR 0006)
  const gamesNewestFirst = async (athleteId: string) =>
    (await store.games.where('athlete_id').equals(athleteId).sortBy('created_at'))
      .filter((g) => !g.removed)
      .reverse()
      .sort((a, b) => b.game_date.localeCompare(a.game_date));
  // Every write queues its row for upload in the same transaction (ADR 0001), then tries to upload. The Game table is always in scope, since append reads the Game (ADR 0005).
  const write = async <T>(tables: Table[], scope: () => Promise<T>): Promise<T> => {
    const result = await store.transaction('rw', [...new Set([...tables, store.games, store.outbox])], scope);
    void flush();
    return result;
  };
  const queue = (table: SyncedTable, id: string) => store.outbox.add({ table, id });
  // The Event log's one append: the Game's Events are read once, a Backlogged or ended Game is refused before the command's decision
  // (ADR 0005; a Game has ended while its last Event is a game_end), a Game another phone records is refused too (ADR 0009), and the Event and its
  // Outbox row are written in one transaction. A decision of none writes nothing. One rw transaction at a time per store, so taps in
  // quick succession still get distinct seqs. Undo alone may write to an ended Game, and only to retract its game_end (Undo End Game).
  function append(gameId: string, decide: (log: Fold) => Fields, options?: { undo?: boolean }): Promise<EventRow>;
  function append(gameId: string, decide: (log: Fold) => Fields | undefined, options?: { undo?: boolean }): Promise<EventRow | undefined>;
  function append(gameId: string, decide: (log: Fold) => Fields | undefined, { undo = false } = {}): Promise<EventRow | undefined> {
    return write([store.events, store.settings], async () => {
      if ((await store.games.get(gameId))?.totals) throw new Error('A Backlogged Game has no Events');
      if (await store.settings.get(RECEIVED + gameId)) throw new Error('This Game is recorded on another Phone');
      const events = await gameEvents(gameId).toArray();
      const log = fold(events, now());
      if (log.ended && !(undo && log.undoable?.type === 'game_end')) throw new Error('This Game has ended');
      const fields = decide(log);
      if (!fields) return undefined;
      const event: EventRow = {
        ...NO_FIELDS,
        id: crypto.randomUUID(),
        game_id: gameId,
        seq: (events.at(-1)?.seq ?? 0) + 1,
        client_ts: now(),
        period: log.period,
        ...fields,
      };
      await store.events.add(event);
      await queue('events', event.id);
      return event;
    });
  }

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

  // the tables a download or a drop writes together, so each runs in one transaction over them
  const phoneRows = [store.athletes, store.athletePhotos, store.games, store.events, store.settings];
  // drops Athletes the phone no longer shares: their Games, Events, photo and marker go with them
  const dropAthletes = async (ids: string[]) => {
    const gone = new Set(await store.games.where('athlete_id').anyOf(ids).primaryKeys());
    await store.events.filter((e) => gone.has(e.game_id)).delete();
    await store.games.bulkDelete([...gone]);
    await store.athletePhotos.bulkDelete(ids);
    await store.athletes.bulkDelete(ids);
    await store.settings.bulkDelete([...ids.map((id) => SHARED + id), ...ids.map((id) => MEMBERS + id), ...[...gone].map((id) => RECEIVED + id)]);
    for (const id of ids) await store.settings.where('key').startsWith(GONE + id + ' ').delete();
  };
  // the phone's sign-in: the Remembered Account, the ended-Session flag and the download markers (#172)
  const phone = createPhoneAccount(store, server);
  // clears every table on this phone, as a sign-out or a deletion leaves it
  const clearPhone = () => store.transaction('rw', store.tables, () => Promise.all(store.tables.map((table) => table.clear())));
  // uploads one queued row as it is now; false when the server does not take it, and the row stays queued.
  // A refusal (RowRefused) is recorded for Home by its row's seq; a dropped connection is not one, so it records nothing.
  const sendEntry = async (entry: OutboxRow): Promise<boolean> => {
    const loaded = await loadRow(entry);
    if (!loaded) {
      await store.outbox.delete(entry.seq!);
      return true;
    }
    const athlete = await store.athletes.get(loaded.athleteId ?? '');
    try {
      await server.upload(entry.table, { ...loaded.row, owner_id: athlete?.owner_id });
    } catch (error) {
      // shortcut: one seq is kept, so a refused row that lands while an earlier one still waits clears the notice until the next drain, upgrade with a set of refused seqs
      if (error instanceof RowRefused) await store.settings.put({ key: REFUSED_ROW, value: String(entry.seq) });
      return false;
    }
    await store.outbox.delete(entry.seq!);
    return true;
  };
  const queuedOn = async (athleteId: string) => {
    for (const entry of await store.outbox.toArray()) {
      if ((await loadRow(entry))?.athleteId === athleteId) return true;
    }
    return false;
  };

  // the Athlete a Phone opens on when none is chosen: the one whose newest Game that is not removed is latest, else the first Athlete added
  const openingAthleteId = async (): Promise<string | undefined> => {
    let opening: { id: string; newest: number } | undefined;
    for (const athlete of await store.athletes.orderBy('created_at').toArray()) {
      const newest = (await store.games.where('athlete_id').equals(athlete.id).toArray()).reduce(
        (latest, game) => (game.removed ? latest : Math.max(latest, Date.parse(game.created_at))),
        -Infinity,
      );
      // a tie keeps the Athlete added first
      if (!opening || newest > opening.newest) opening = { id: athlete.id, newest };
    }
    return opening?.id;
  };

  // a Phone with no Athlete chosen, or whose chosen Athlete was just dropped, chooses once and keeps it until someone switches
  const chooseOpening = async () => {
    const chosen = (await store.settings.get(SELECTED_ATHLETE))?.value;
    if (chosen && (await store.athletes.get(chosen))) return;
    const opening = await openingAthleteId();
    if (opening) await store.settings.put({ key: SELECTED_ATHLETE, value: opening });
  };

  // an Owner's phone keeps each Athlete's Members as it last saw them: a kept one this read lacks is gone, and its line waits for OK (ADR 0004)
  const keepMembers = async (athlete: AthleteRow, members: MemberRow[]) => {
    // a Member listed again is no Member gone: its line, if it still waits for OK, goes
    await store.settings.bulkDelete(members.map((m) => goneKey(athlete.id, m.member_id)));
    const kept = (await store.settings.get(MEMBERS + athlete.id))?.value;
    for (const { id, label } of kept ? (JSON.parse(kept) as KeptMember[]) : []) {
      if (members.some((m) => m.member_id === id)) continue;
      const value = { athleteId: athlete.id, memberId: id, label, athleteName: athlete.name };
      await store.settings.put({ key: goneKey(athlete.id, id), value: JSON.stringify(value) });
    }
    await store.settings.put({ key: MEMBERS + athlete.id, value: JSON.stringify(members.map((m) => ({ id: m.member_id, label: labelled(m).label }))) });
  };

  // Brings the account's rows down: Athletes and Games the phone lacks or holds an older edit of, Events it lacks.
  // Fetched before the transaction, since Dexie cannot span the network. Nothing here is queued for upload.
  // `leaving` is the Athlete a Member's own Leave drops: its drop records no removal.
  // shortcut: every visible Event is fetched on each sign-in, launch and reconnect, not only the missing ones, fine for one child's Games; upgrade with a per-Game seq cursor when a season's Events get slow to fetch
  const download = async (leaving?: string) => {
    const before = await server.session();
    const [athletes, games, events] = await Promise.all([
      server.download('athletes'),
      server.download('games'),
      server.download('events'),
    ]);
    // the Members of each Athlete this account owns, read before the session check below: a Session that ends during a read reads as none, and the check drops it
    const owned = before === undefined ? [] : athletes.filter((a) => a.owner_id === before);
    const memberReads = await Promise.all(
      owned.map(async (athlete) => ({
        athlete,
        members: await server.members(athlete.id).catch((error: unknown) => {
          console.error(error);
          return undefined;
        }),
      })),
    );
    // Athletes are dropped or marked only for an account signed in both before and after the downloads: a signed-out or lapsed session drops none
    const me = before !== undefined && before === (await server.session()) ? before : undefined;
    await store.transaction('rw', phoneRows, async () => {
      // a shared Athlete the server no longer sends was shared with this phone, so its Owner removed this account or it left (ADR 0004).
      // An Athlete this phone made is never marked, so a sign-in as another account cannot delete its unsynced rows.
      // a marker names the account that downloaded the Athlete, so only that account's sign-in drops it; one still holding 'shared' is from before, and counts as this account's
      const sent = new Set(athletes.map((a) => a.id));
      const departed =
        me === undefined
          ? []
          : (await store.settings.where('key').startsWith(SHARED).toArray())
              .filter(({ value }) => value === me || value === 'shared')
              .map(({ key }) => key.slice(SHARED.length))
              .filter((id) => !sent.has(id));
      if (departed.length > 0) {
        const dropped = (await store.athletes.bulkGet(departed)).filter((a): a is AthleteRow => a !== undefined);
        await dropAthletes(departed);
        await store.settings.bulkPut(dropped.filter((a) => a.id !== leaving).map((a) => ({ key: REMOVED + a.id, value: a.name })));
      }
      // an Athlete the server sends again is not removed any more, so a line still waiting for its OK goes
      await store.settings.bulkDelete(athletes.map((a) => REMOVED + a.id));
      if (me !== undefined) {
        await store.settings.bulkPut(athletes.filter((a) => a.owner_id !== me).map((a) => ({ key: SHARED + a.id, value: me })));
        for (const { athlete, members } of memberReads) if (members) await keepMembers(athlete, members);
      }
      const athleteRows = athletes.map(athleteOf);
      const athleteHeld = await store.athletes.bulkGet(athleteRows.map((r) => r.id));
      // ownership moves only on the server (ADR 0004), so a held Athlete takes the server's owner even when its own edit is not newer
      for (const [i, row] of athleteRows.entries()) {
        const held = athleteHeld[i];
        if (held && held.owner_id !== row.owner_id) await store.athletes.update(row.id, { owner_id: row.owner_id });
      }
      await store.athletes.bulkPut(athleteRows.filter((r, i) => later(r, athleteHeld[i])));
      const gameRows = games.map(gameOf);
      const gameHeld = await store.games.bulkGet(gameRows.map((r) => r.id));
      // a Game this phone lacks was recorded by another phone (ADR 0009), so it is marked; a row the phone holds never is
      await store.settings.bulkPut(lacking(gameRows, gameHeld).map((r) => ({ key: RECEIVED + r.id, value: 'received' })));
      await store.games.bulkPut(gameRows.filter((r, i) => later(r, gameHeld[i])));
      // an Event never changes, so the phone takes only the ones it lacks
      const eventRows = events.map(eventOf);
      await store.events.bulkAdd(lacking(eventRows, await store.events.bulkGet(eventRows.map((r) => r.id))));
      // only a download that confirmed the session counts: an unconfirmed one may have come back empty (ADR 0007), so it chooses nothing either
      if (me !== undefined) {
        await chooseOpening();
        await phone.confirmDownload(me);
      }
    });
  };

  // Uploads in sequence order, each row as it is now. A row the server cannot take stays queued, and so do the rows behind it.
  // shortcut: a row the server refuses holds up every row behind it until someone fixes it, upgrade when a row behind it should upload past the refusal
  const drain = async () => {
    const owner = await server.session();
    if (!owner) {
      await phone.noteEndedSession();
      return;
    }
    await phone.remember(owner);
    // a sign-in downloads before anything uploads, so the server's newer copies land before this phone's older ones go up
    if (await phone.needsDownload(owner)) {
      try {
        await download();
        await phone.markDownloaded(owner);
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
      if (!(await sendEntry(entry))) return;
    }
  };
  // one task at a time, each starting after the one before it has finished: a drain, or the account's deletion
  let draining: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = draining.then(task);
    draining = run.catch(console.error);
    return run;
  };
  const after = (task: () => Promise<void>): Promise<void> => exclusive(task).catch(console.error);
  const flush = () => after(drain);
  // launch and reconnect: the download runs again, after any drain in flight, then the queue uploads (ADR 0004)
  const refresh = () =>
    after(async () => {
      await phone.forgetDownload();
      await drain();
    });

  // whether this phone's account recorded the Game (its Recorder), or the phone is signed out with none
  const isRecorder = async (game: GameRow) =>
    recorderOf(game, (await store.athletes.get(game.athlete_id))?.owner_id) === (await phone.account())?.id;
  // whether the phone's account owns the Athlete, or the phone is signed out: Invite is the Owner's (ADR 0004)
  const isOwner = async (athleteId: string) => {
    const owner = (await store.athletes.get(athleteId))?.owner_id;
    return owner === undefined || owner === (await phone.account())?.id;
  };

  const liveGame = async (gameId: string): Promise<LiveGame | undefined> => {
    const game = await store.games.get(gameId);
    if (!game) return undefined;
    // a Backlogged Game's Events are its Totals, built here and never stored (ADR 0005)
    const events = game.totals ? eventsFromTotals(game) : await gameEvents(gameId).toArray();
    const log = fold(events, now());
    // the Game's elapsed time runs from its start (startGame's created_at), so a late first Sub In reads its true share
    const elapsed = Date.parse(log.endAt) - Date.parse(game.created_at);
    return {
      ...log.counts,
      id: game.id,
      sport: game.sport,
      threePointers: game.three_pointers !== false,
      athleteName: (await store.athletes.get(game.athlete_id))?.name ?? 'Athlete',
      periodLabel: periodLabel(game.period_format, log.period),
      score: log.score,
      final: log.final,
      undoable: log.undoable,
      count: log.count,
      onCourt: log.onCourt,
      shifts: log.shifts,
      plusMinus: log.plusMinus,
      batting: log.batting,
      onBase: log.onBase,
      baserunning: log.baserunning,
      playingShare: elapsed > 0 ? Math.min(1, Math.max(0, log.shiftMs / elapsed)) : 0,
      spots: log.spots,
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
        athleteName: live.athleteName,
        opponent: game.opponent_name,
        gameDate: game.game_date,
        group: groupOf(game.game_date, today),
        final,
        line: lineOf([live]),
        batting: live.batting,
        baserunning: live.baserunning,
        tiles: live.tiles,
        playingShare: live.playingShare,
        spots: live.spots,
        backlogged: Boolean(game.totals),
      },
    };
  };

  /** Game setup's prefilled fields: the newest Game's sport, period format and Opponent, the last recorded basketball Game's Three-Pointers, and today's date. */
  const gameSetup = async (athleteId: string): Promise<GameSetup> => {
    const games = (await store.games.where('athlete_id').equals(athleteId).sortBy('created_at')).filter((g) => !g.removed);
    const last = games.at(-1);
    return {
      sport: last?.sport ?? 'basketball',
      basketballPeriods: last?.sport === 'basketball' && last.period_format !== 'innings' ? last.period_format : 'quarters',
      // a Backlogged Game has no live screen, so it never sets this
      threePointers: games.filter((g) => g.sport === 'basketball' && !g.totals).at(-1)?.three_pointers !== false,
      opponentName: last?.opponent_name ?? 'Opponent',
      gameDate: localDate(clock()),
    };
  };

  return {
    async addAthlete({ name, jerseyNumber, photo }: { name: string; jerseyNumber?: string; photo?: Blob }): Promise<string> {
      const id = crypto.randomUUID();
      const ts = now();
      // read before the transaction: a non-Dexie await inside its scope ends it early
      const row = photo && { athlete_id: id, bytes: await photo.arrayBuffer(), type: photo.type };
      await write([store.athletes, store.athletePhotos, store.settings], async () => {
        await store.athletes.add({ id, name, jersey_number: jerseyNumber?.trim() || null, created_at: ts, updated_at: ts });
        await queue('athletes', id);
        if (row) await store.athletePhotos.add(row);
        await store.settings.put({ key: SELECTED_ATHLETE, value: id });
      });
      return id;
    },

    async editAthlete({ id, name, jerseyNumber, photo }: { id: string; name: string; jerseyNumber: string; photo?: Blob }): Promise<void> {
      // read before the transaction, as in addAthlete
      const row = photo && { athlete_id: id, bytes: await photo.arrayBuffer(), type: photo.type };
      await write([store.athletes, store.athletePhotos], async () => {
        await store.athletes.update(id, { name, jersey_number: jerseyNumber.trim() || null, updated_at: now() });
        await queue('athletes', id);
        // a photo picked here replaces this phone's; none picked keeps the stored one
        if (row) await store.athletePhotos.put(row);
      });
    },

    async startGame({
      athleteId,
      opponentName,
      gameDate,
      sport,
      periodFormat,
      threePointers = true,
    }: { athleteId: string; opponentName: string; gameDate: string; threePointers?: boolean } & GameFormat): Promise<string> {
      const opponent = opponentName.trim();
      if (!opponent || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) throw new Error('A Game needs an Opponent and a date');
      const id = crypto.randomUUID();
      const date = clock();
      // the signed-in account records the Game; a signed-out phone's Game takes its Recorder at sign-in
      const recorder = (await phone.account())?.id;
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
          // stored only when off, so a Game with Three-Pointers on stays the same row every earlier Game is
          ...(sport === 'basketball' && !threePointers && { three_pointers: false }),
        });
        await queue('games', id);
      });
      return id;
    },

    /** A Backlogged Game: a Game entered after it was played, from its Totals, with no Events (ADR 0005). Refused, with no row written, for an entry backlogProblem names. */
    async backlogGame(entry: BacklogEntry): Promise<string> {
      const problem = backlogProblem(entry, localDate(clock()));
      if (problem) throw new Error(problem);
      const id = crypto.randomUUID();
      const ts = now();
      // basketball takes the Athlete's last Game's period format; softball and baseball are always innings
      const periodFormat = entry.sport === 'basketball' ? (await gameSetup(entry.athleteId)).basketballPeriods : 'innings';
      // the signed-in account records the Game, as startGame does; a signed-out phone's Game takes its Recorder at sign-in
      const recorder = (await phone.account())?.id;
      await write([store.games], async () => {
        await store.games.add({
          id,
          athlete_id: entry.athleteId,
          sport: entry.sport,
          period_format: periodFormat,
          opponent_name: entry.opponentName.trim(),
          game_date: entry.gameDate,
          created_at: ts,
          updated_at: ts,
          recorded_by: recorder,
          totals: entry.totals,
        });
        await queue('games', id);
      });
      return id;
    },

    /** Edits a Backlogged Game's Opponent, date and Totals. Only its Recorder edits it, and its sport stays as saved (ADR 0005). */
    async editBacklog(gameId: string, entry: Pick<BacklogEntry, 'opponentName' | 'gameDate' | 'totals'>): Promise<void> {
      const game = await store.games.get(gameId);
      if (!game?.totals) throw new Error('Only a Backlogged Game can be edited');
      if (!(await isRecorder(game))) throw new Error('Only the Recorder can edit this Game');
      const problem = backlogProblem({ ...entry, sport: game.sport }, localDate(clock()));
      if (problem) throw new Error(problem);
      await write([store.games], async () => {
        await store.games.update(gameId, {
          opponent_name: entry.opponentName.trim(),
          game_date: entry.gameDate,
          totals: entry.totals,
          updated_at: now(),
        });
        await queue('games', gameId);
      });
    },

    /** Removes a finished Game from every phone: a Game edit that hides it, its row and Events kept on the server (ADR 0006, ADR 0008). Only its Recorder removes it, and only a finished Game. */
    async removeGame(gameId: string): Promise<void> {
      const game = await store.games.get(gameId);
      if (!game || !(await finishedGame(game, localDate(clock())))) throw new Error('Only a finished Game can be removed');
      if (!(await isRecorder(game))) throw new Error('Only the Recorder can remove this Game');
      await write([store.games], async () => {
        await store.games.update(gameId, { removed: true, updated_at: now() });
        await queue('games', gameId);
      });
    },

    /** Whether this account can remove the Game: a finished Game that is not removed, and whose Recorder it is (ADR 0008). */
    async canRemoveGame(gameId: string): Promise<boolean> {
      const game = await store.games.get(gameId);
      if (!game || game.removed) return false;
      return (await finishedGame(game, localDate(clock()))) !== undefined && (await isRecorder(game));
    },

    /** The form's prefill for a Backlogged Game: undefined unless the Game has Totals and this account is its Recorder (ADR 0005). */
    async backlogEntry(gameId: string): Promise<BacklogEntry | undefined> {
      const game = await store.games.get(gameId);
      if (!game?.totals || !(await isRecorder(game))) return undefined;
      return {
        athleteId: game.athlete_id,
        sport: game.sport,
        opponentName: game.opponent_name,
        gameDate: game.game_date,
        totals: game.totals,
      };
    },

    /** Writes the Event to the store before resolving (ADR 0001). */
    recordTile(gameId: string, type: TileEventType): Promise<EventRow> {
      return append(gameId, () => ({ type }));
    },

    /** A Shot: its spot, value and result, written together when the Recorder taps MAKE or MISS (GLOSSARY: Shot). */
    async recordShot(gameId: string, shot: { x: number; y: number; value: 2 | 3; made: boolean }): Promise<EventRow> {
      if (!isSpot(shot.x) || !isSpot(shot.y) || (shot.value !== 2 && shot.value !== 3)) {
        throw new Error('A Shot needs a spot on the court and a value of 2 or 3');
      }
      return append(gameId, () => ({ type: 'shot', court_x: spot(shot.x), court_y: spot(shot.y), shot_value: shot.value, made: shot.made }));
    },

    /** A Free Throw: its result, and no spot (GLOSSARY: Free Throw). */
    recordFreeThrow(gameId: string, made: boolean): Promise<EventRow> {
      return append(gameId, () => ({ type: 'free_throw', made }));
    },

    /** Turns Three-Pointers on for the rest of a Game that started with them off; Shots already recorded keep their value (GLOSSARY: Three-Pointers). */
    async turnOnThreePointers(gameId: string): Promise<void> {
      await write([store.events, store.settings], async () => {
        const game = await store.games.get(gameId);
        if (!game || game.totals) throw new Error('Only a Game in progress can turn on Three-Pointers');
        if (await store.settings.get(RECEIVED + gameId)) throw new Error('This Game is recorded on another Phone');
        if (fold(await gameEvents(gameId).toArray(), now()).ended) throw new Error('This Game has ended');
        await store.games.update(gameId, { three_pointers: true, updated_at: now() });
        await queue('games', gameId);
      });
    },

    /** A Pitch: one ball, strike or foul in the Plate Appearance in progress; Pitches are optional (GLOSSARY: Pitch, Count). */
    async recordPitch(gameId: string, pitch: Pitch): Promise<EventRow> {
      if (!PITCHES.includes(pitch)) throw new Error('A Pitch is a ball, a called or swinging strike, or a foul');
      return append(gameId, () => ({ type: 'pitch', pitch }));
    },

    /** A Plate Appearance: its Outcome and RBI count, written together once the Recorder picks the RBI chip (GLOSSARY: Plate Appearance). */
    async recordPlateAppearance(gameId: string, { outcome, rbi }: { outcome: Outcome; rbi: number }): Promise<EventRow> {
      if (!OUTCOMES.includes(outcome) || !Number.isInteger(rbi) || rbi < 0 || rbi > 4) {
        throw new Error('A Plate Appearance needs an Outcome and an RBI count of 0 to 4');
      }
      return append(gameId, () => ({ type: 'plate_appearance', outcome, rbi }));
    },

    /** A baserunning move: where the Athlete on base goes, and whether it was a steal; the Athlete only, never a teammate (GLOSSARY: Baserunning). */
    async recordBaserunning(gameId: string, { base, stolen }: { base: BaseMove; stolen: boolean }): Promise<EventRow> {
      if (!BASES.includes(base) || typeof stolen !== 'boolean') throw new Error('A baserunning move needs a base and whether it was a steal');
      return append(gameId, (log) => {
        if (!log.onBase) throw new Error('Only an Athlete on base can move');
        if (!movesFrom(log.onBase).includes(base)) throw new Error(`An Athlete on ${log.onBase} cannot move to ${base}`);
        return { type: 'baserunning', base, stolen };
      });
    },

    /** Next period: a period_start Event that opens the Period after the current one, and carries it (GLOSSARY: Period). */
    nextPeriod(gameId: string): Promise<EventRow> {
      return append(gameId, (log) => ({ type: 'period_start', period: log.period + 1 }));
    },

    /** Moves one side of the strip one point and records the new absolute scores as a Score Snapshot (ADR 0002). */
    adjustScore(gameId: string, side: 'team' | 'opponent', delta: 1 | -1): Promise<EventRow | undefined> {
      return append(gameId, ({ score }) => {
        const team = score.team + (side === 'team' ? delta : 0);
        const opponent = score.opponent + (side === 'opponent' ? delta : 0);
        if (!isScore(team) || !isScore(opponent)) return undefined;
        return { type: 'score', team_score: team, opponent_score: opponent };
      });
    },

    /** Sub In when the Athlete is off court, else Sub Out; each records the strip's Score Snapshot (GLOSSARY: Sub In / Sub Out). */
    toggleSub(gameId: string): Promise<EventRow> {
      return append(gameId, ({ onCourt, score }) => ({
        type: onCourt ? 'sub_out' : 'sub_in',
        team_score: score.team,
        opponent_score: score.opponent,
      }));
    },

    /** End Game: the Final Score, recorded as a game_end Event, closes the Game. Refused without whole scores. */
    async endGame(gameId: string, final: { teamScore: number; opponentScore: number }): Promise<EventRow> {
      if (!isScore(final.teamScore) || !isScore(final.opponentScore)) throw new Error('End Game needs a Final Score');
      return append(gameId, () => ({ type: 'game_end', team_score: final.teamScore, opponent_score: final.opponentScore }));
    },

    /** Appends a Retraction for the newest Event not yet retracted; no Event is changed. On an ended Game that is its End Game, this reopens it (Undo End Game). */
    undo(gameId: string): Promise<EventRow | undefined> {
      return append(gameId, ({ undoable }) => undoable && { type: 'retraction', retracts_id: undoable.id }, { undo: true });
    },

    gameSetup,

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

    /** Field mode is a phone setting: off until a Recorder turns it on (GLOSSARY: Field mode). */
    async fieldMode(): Promise<boolean> {
      return (await store.settings.get(FIELD_MODE))?.value === 'on';
    },

    async setFieldMode(on: boolean): Promise<void> {
      await store.settings.put({ key: FIELD_MODE, value: on ? 'on' : 'off' });
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
      const games = await store.games.where('athlete_id').equals(athlete.id).sortBy('created_at');
      // every read is Dexie's: a liveQuery stops observing at an await that is not Dexie's, and End Game would never re-run Home
      const unclosed = [];
      for (const game of [...games].reverse()) {
        // a Backlogged Game has no Events, so it is never the one in progress (ADR 0005); a removed Game is never in progress either, since a second phone may hold its row before its Events (ADR 0008)
        if (game.totals || game.removed) continue;
        if ((await gameEvents(game.id).last())?.type !== 'game_end') unclosed.push(game);
      }
      const session = (await phone.account())?.id;
      // the newest Game that End Game has not closed is the one in progress, and only its Recorder's phone records on it
      // a Game stored before Recorders were is the Owner's; one waiting on sign-in has no Recorder yet, and this phone recorded it
      // a Game this phone received is another phone's to record, so it is skipped (ADR 0009)
      const received = await store.settings.bulkGet(unclosed.map((game) => RECEIVED + game.id));
      const liveGameId = unclosed.find((game, i) => !received[i] && recorderOf(game, athlete.owner_id) === session)?.id;
      return {
        athlete: { id: athlete.id, name: athlete.name, jerseyNumber: athlete.jersey_number, photo: photoOf(photo) },
        next: athletes.length > 1 ? { id: next.id, name: next.name } : undefined,
        liveGameId,
      };
    },

    /** The first download of a sign-in (ADR 0007): rejects unless the download confirms this phone's session, so the screen can say so and offer Retry. */
    firstDownload(): Promise<void> {
      return exclusive(async () => {
        await download();
        if (!(await phone.downloadConfirmed())) {
          throw new Error('The Athletes were not downloaded: the session could not be confirmed');
        }
      });
    },

    liveGame,

    /** The Games feed: the season line over the Athlete's finished basketball Games, and every finished Game, newest first. */
    async gameFeed(athleteId: string): Promise<GameFeed> {
      // shortcut: reads every Game's Events on each feed read, fine for one Athlete's season; upgrade with a stored season line when the feed reads slow
      const today = localDate(clock());
      const rows = await gamesNewestFirst(athleteId);
      const finished = (await Promise.all(rows.map((row) => finishedGame(row, today)))).flatMap((f) => (f ? [f] : []));
      const games = finished.map(({ row }) => row);
      const lives = finished.map(({ live }) => live);
      // a season for each sport played; with no finished Game, the basketball season reads zero, as Home always has
      const seasons: Season[] = (['basketball', 'softball', 'baseball'] as const).flatMap((sport) => {
        const played = lives.filter((live) => live.sport === sport);
        if (played.length === 0) return [];
        return [
          sport === 'basketball'
            ? { sport, line: lineOf(played) }
            : { sport, batting: battingOfGames(played), baserunning: baserunningOfGames(played) },
        ];
      });
      return { seasons: seasons.length > 0 ? seasons : [{ sport: 'basketball', line: lineOf([]) }], games };
    },

    /** A finished Game's summary; undefined while the Game is still in progress, or once it is removed. */
    async gameSummary(gameId: string): Promise<FeedGame | undefined> {
      const game = await store.games.get(gameId);
      if (!game || game.removed) return undefined;
      return (await finishedGame(game, localDate(clock())))?.row;
    },

    /** Game Complete's ready-to-paste text: the Final Score, the Athlete's line and Plus/Minus, and the sport's hashtag; undefined while the Game is in progress. Counts only un-retracted Events, as the summary does. */
    async gameCopyText(gameId: string): Promise<string | undefined> {
      const game = await store.games.get(gameId);
      const summary = game && (await finishedGame(game, localDate(clock())))?.row;
      if (!game || !summary) return undefined;
      const name = summary.athleteName;
      return [
        `${name} vs ${summary.opponent}: ${summary.final.team}–${summary.final.opponent} final`,
        // Plus/Minus is defined per Shift, and only basketball has Shifts (docs/plan.md, ADR 0002)
        `${name}: ${gameLineText(summary)}${summary.sport === 'basketball' ? ` · Plus/Minus ${signed(summary.line.plusMinus)}` : ''}`,
        SPORT_TAG[game.sport],
      ].join('\n');
    },

    /** Practice Focus: the rules over the Athlete's last 5 finished basketball Games, newest first, read from this phone's store only (GLOSSARY: Practice Focus). */
    async practiceFocus(athleteId: string): Promise<PracticeFocus[]> {
      const games: { periodFormat: GameRow['period_format']; events: EventRow[] }[] = [];
      for (const game of await gamesNewestFirst(athleteId)) {
        if (games.length === 5) break;
        if (game.sport !== 'basketball') continue;
        const events = await gameEvents(game.id).toArray();
        // a Game has ended while its last Event is a game_end
        if (events.at(-1)?.type !== 'game_end') continue;
        games.push({ periodFormat: game.period_format, events: fold(events, now()).live });
      }
      return practiceFocusOf(games);
    },

    /** Game Complete's share card: the Athlete's name and photo, the Opponent, the Final Score, the line, the jersey number or initials and the Shots; undefined while the Game is in progress. The photo only leaves the phone inside the image. */
    async gameCard(gameId: string) {
      const game = await store.games.get(gameId);
      const summary = game && (await finishedGame(game, localDate(clock())))?.row;
      if (!game || !summary) return undefined;
      const photo = await store.athletePhotos.get(game.athlete_id);
      const athlete = await store.athletes.get(game.athlete_id);
      const line = gameLineText(summary);
      return {
        athlete: summary.athleteName,
        photo: photoOf(photo),
        mark: athlete?.jersey_number || initials(summary.athleteName),
        opponent: summary.opponent,
        final: summary.final,
        // the line's labels carry no digits, so a line with no 1 to 9 is all zeros and the card leaves it off
        line: /[1-9]/.test(line) ? line : undefined,
        shots: summary.spots,
      };
    },

    /** Sends the sign-in code to the address. The Recorder is signed in once the code is entered (verifyCode). While an Account is remembered, only its own address may sign in again (ADR 0007). */
    signIn(email: string): Promise<void> {
      return phone.signIn(email);
    },

    /** Signs the Recorder in with the emailed code, then uploads everything recorded so far. */
    async verifyCode(email: string, code: string): Promise<void> {
      await phone.verifyCode(email, code);
      await flush();
    },

    /** Makes an Invite to one of the Recorder's Athletes; its token goes out in the share link. */
    createInvite(athleteId: string): Promise<string> {
      return server.createInvite(athleteId);
    },

    /** Whether Invite co-parent is offered: the signed-in account is the Athlete's Owner. */
    async canInvite(athleteId: string): Promise<boolean> {
      const owner = (await store.athletes.get(athleteId))?.owner_id;
      return owner !== undefined && owner === (await phone.account())?.id;
    },

    isOwner,

    /** Makes the signed-in account a Member of the Invite's Athlete, then brings the Athlete and its Games down; resolves to the Athlete's name (ADR 0004). */
    async acceptInvite(token: string): Promise<string> {
      // cleared first, so a download that fails after the accept is retried by the next flush
      await phone.forgetDownload();
      const athleteId = await server.acceptInvite(token);
      await exclusive(download);
      return (await store.athletes.get(athleteId))?.name ?? 'Athlete';
    },

    /** The Owner's Members list for one of its Athletes, each named for the screen (ADR 0004). */
    async members(athleteId: string): Promise<Member[]> {
      const signedIn = async () => {
        // no Session, the server answers anon with none, which would read as an empty list (#268)
        if ((await server.session()) === undefined) throw new Error('Sign in again to see the Members');
      };
      await signedIn();
      const members = await server.members(athleteId);
      // a Session that ends during the read answers the same none, so it is checked after the read too (#294)
      await signedIn();
      return members.map(labelled);
    },

    /** The Owner removes a Member; the Member's phone drops the Athlete at its next download (ADR 0004). */
    async removeMember(athleteId: string, memberId: string): Promise<void> {
      await server.removeMember(athleteId, memberId);
      // a Member the Owner removes is no Member gone: the kept list drops it, so the next download adds no line
      const kept = (await store.settings.get(MEMBERS + athleteId))?.value;
      if (kept) {
        const rest = (JSON.parse(kept) as KeptMember[]).filter((m) => m.id !== memberId);
        await store.settings.put({ key: MEMBERS + athleteId, value: JSON.stringify(rest) });
      }
    },

    /** A Member leaves an Athlete: the Athlete drops from this phone now, and the Games it recorded stay with the Athlete (ADR 0004). */
    async leave(athleteId: string): Promise<void> {
      // once the membership is gone the server refuses this phone's rows on the Athlete, so they upload first and the leave waits for them
      await flush();
      // this Athlete's rows go up past other Athletes' rows the server refuses, which stay queued
      for (const entry of await store.outbox.orderBy('seq').toArray()) {
        if ((await loadRow(entry))?.athleteId === athleteId) await sendEntry(entry);
      }
      if (await queuedOn(athleteId)) {
        // a removed Member's download no longer sends the Athlete, so it drops it; if the download fails, the rows still wait
        try {
          // queued like a drain, so a deletion that starts meanwhile waits for it and it cannot refill the phone
          await exclusive(() => download(athleteId));
        } catch {
          throw new Error(NOT_SYNCED);
        }
        if (await store.athletes.get(athleteId)) throw new Error(NOT_SYNCED);
        return;
      }
      await server.leave(athleteId);
      // the drop may take the chosen Athlete, so the Phone chooses again in the same transaction
      await store.transaction('rw', phoneRows, async () => {
        await dropAthletes([athleteId]);
        await chooseOpening();
      });
      void flush();
    },

    /** The Athletes the Owner removed this account from, named, until each one's OK clears it (ADR 0004). Live. */
    async removedAthletes(): Promise<{ id: string; name: string }[]> {
      const lines = await store.settings.where('key').startsWith(REMOVED).toArray();
      return lines.map(({ key, value }) => ({ id: key.slice(REMOVED.length), name: value }));
    },

    /** The OK on a removal line: it stays cleared, reload included. */
    async clearRemovedAthlete(athleteId: string): Promise<void> {
      await store.settings.delete(REMOVED + athleteId);
    },

    /** The Members an Owner's phone saw leave its Athletes, named, until each one's OK clears it (ADR 0004). Live. */
    async goneMembers(): Promise<GoneMember[]> {
      const lines = await store.settings.where('key').startsWith(GONE).toArray();
      return lines.map(({ value }) => JSON.parse(value) as GoneMember);
    },

    /** The OK on a gone Member's line: it stays cleared, reload included. */
    async clearGoneMember(athleteId: string, memberId: string): Promise<void> {
      await store.settings.delete(goneKey(athleteId, memberId));
    },

    /** The photos this phone holds, which Sign out clears. Read here, so the Sign out screen needs no connection. */
    photoCount(): Promise<number> {
      return store.athletePhotos.count();
    },

    /** What deleting the account does to each Athlete the phone holds: it passes to its first Member, is deleted with its Games, or this account leaves it. Signed out, the phone clears all of it. Rejects when an Account is remembered but cannot be reached now. */
    async deletionSummary(): Promise<DeletionSummary> {
      const me = await server.session();
      // a remembered Account with no live session may still exist on the server, unless the server ended its session: then the phone acts as having no Account
      await phone.refuseIfUnreachable(me);
      // a signed-in phone first brings the server's owners down, so an Athlete that passed to this account reads as its own
      if (me !== undefined) await exclusive(download);
      const athletes = await store.athletes.orderBy('created_at').toArray();
      // the server ended this phone's session: deletion clears only this phone, so every Athlete reads as removed from it
      const ended = (await phone.phoneAccount()).state === 'session-ended';
      const fates = await Promise.all(
        athletes.map(async (a): Promise<AthleteFate> => {
          if (ended) return { name: a.name, fate: 'removed' };
          // another account's Athlete, shared with this phone: this account is one of its Members, and leaves it
          if (me !== undefined && a.owner_id !== undefined && a.owner_id !== me) return { name: a.name, fate: 'left' };
          // the account's own Athlete passes to the Member who joined first, if it has one
          const members = me === undefined ? [] : await server.members(a.id);
          const [first] = members.sort((x, y) => x.joined_at.localeCompare(y.joined_at));
          if (first) return { name: a.name, fate: 'passes', to: labelled(first).label };
          return { name: a.name, fate: 'deleted', games: await store.games.where('athlete_id').equals(a.id).and((g) => !g.removed).count() };
        }),
      );
      const pending = await store.outbox.toArray();
      return {
        athletes: fates,
        photos: await store.athletePhotos.where('athlete_id').anyOf(athletes.map((a) => a.id)).count(),
        unsynced: new Set(pending.map(({ table, id }) => `${table}:${id}`)).size,
      };
    },

    /** Signs this phone out: the Account and its rows stay on the server, and this phone is cleared. Rejects, and the phone keeps its rows, while anything is still queued or the server refuses. */
    async signOut(): Promise<void> {
      // as leave does, the queue uploads first; a row the server refuses stays queued and refuses the sign-out
      await flush();
      return exclusive(async () => {
        if ((await store.outbox.count()) > 0) throw new Error(SIGN_OUT_REFUSED);
        try {
          await server.signOut();
        } catch {
          throw new Error(SIGN_OUT_REFUSED);
        }
        await clearPhone();
      });
    },

    /** Deletes the account and everything it owns on the server, then clears this phone back to first run. A refusal by the server leaves the phone as it was, and so does an Account the phone remembers but cannot reach now. */
    deleteAccount(): Promise<void> {
      return exclusive(async () => {
        const live = await server.session();
        // a remembered Account with no live session may still exist on the server, so this refuses rather than clear the phone, unless the server ended its session: then it clears without a server call
        await phone.refuseIfUnreachable(live);
        // a phone not signed in has no account on the server, so only its own rows go
        if (live !== undefined) await server.deleteAccount();
        await clearPhone();
      });
    },

    /** The sync badge's read: how many rows still live only on the phone, and whether the server has refused one (Refused Row). Whether the phone is signed in is phoneAccount's (ADR 0007). Live. */
    async sync(): Promise<{ notSynced: number; refused: boolean }> {
      const pending = await store.outbox.toArray();
      // the notice holds only while the refused row is still queued: its landing or its drop from the Outbox ends it
      const refusedSeq = (await store.settings.get(REFUSED_ROW))?.value;
      return {
        notSynced: new Set(pending.map(({ table, id }) => `${table}:${id}`)).size,
        refused: pending.some(({ seq }) => String(seq) === refusedSeq),
      };
    },

    /** Where the phone stands: signed out, the first download due, signed in, or the server ended the session (ADR 0007). Live. */
    phoneAccount: phone.phoneAccount,

    /** Uploads whatever is queued. Called after every write. */
    flush,

    /** Launch and reconnect: brings the account's rows down again, then uploads whatever is queued. */
    refresh,
  };
}

export type AppCore = ReturnType<typeof createAppCore>;
