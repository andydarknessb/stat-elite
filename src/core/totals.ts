import type { BacklogEntry } from './appCore';
import { OUTCOMES, TILE_EVENT_TYPES, type EventRow, type GameRow, type GameTotals, type Outcome, type TileEventType } from './store';
import { OUTCOME_LABELS, TILE_LABELS } from './words';

/** A count field's key in the form's text and its visible label. The scores come first in every form. */
export type CountField = [key: string, label: string];
const BASKETBALL_FIELDS: CountField[] = [
  ['shot2Made', '2PT made'],
  ['shot2Attempted', '2PT attempted'],
  ['shot3Made', '3PT made'],
  ['shot3Attempted', '3PT attempted'],
  ['freeThrowMade', 'FT made'],
  ['freeThrowAttempted', 'FT attempted'],
  ...(Object.keys(TILE_LABELS) as TileEventType[]).map((type): CountField => [`tile:${type}`, TILE_LABELS[type]]),
];
const BATTING_FIELDS: CountField[] = [
  ...OUTCOMES.map((outcome): CountField => [`outcome:${outcome}`, OUTCOME_LABELS[outcome]]),
  ['rbi', 'RBI'],
  ['runs', 'Runs'],
  ['steals', 'Stolen bases'],
];

/** The count fields a sport's form shows after the scores: basketball's shots, Free Throws and tiles, or batting's Outcomes, RBI, runs and steals. */
export const countFields = (sport: GameRow['sport']): CountField[] => (sport === 'basketball' ? BASKETBALL_FIELDS : BATTING_FIELDS);

/** Every Game count as the form's text, a 0 included, so an Edit prefills and saves the same numbers. */
export function textOf(totals: GameTotals): Record<string, string> {
  const common = { teamScore: String(totals.team), opponentScore: String(totals.opponent) };
  if ('shots' in totals) {
    return {
      ...common,
      shot2Made: String(totals.shots[2].made),
      shot2Attempted: String(totals.shots[2].attempted),
      shot3Made: String(totals.shots[3].made),
      shot3Attempted: String(totals.shots[3].attempted),
      freeThrowMade: String(totals.freeThrows.made),
      freeThrowAttempted: String(totals.freeThrows.attempted),
      ...Object.fromEntries((Object.keys(totals.tiles) as TileEventType[]).map((type) => [`tile:${type}`, String(totals.tiles[type])])),
    };
  }
  return {
    ...common,
    ...Object.fromEntries(OUTCOMES.map((outcome) => [`outcome:${outcome}`, String(totals.outcomes[outcome])])),
    rbi: String(totals.rbi),
    runs: String(totals.runs),
    steals: String(totals.steals),
  };
}

/** The Totals the form's text holds. Blank is 0 (Number('') is 0); only digits reach here, see notWhole. */
export function totalsOf(sport: GameRow['sport'], text: Record<string, string>): GameTotals {
  const n = (key: string) => Number((text[key] ?? '').trim());
  const team = n('teamScore');
  const opponent = n('opponentScore');
  if (sport === 'basketball') {
    const tiles = Object.fromEntries((Object.keys(TILE_LABELS) as TileEventType[]).map((type) => [type, n(`tile:${type}`)]));
    return {
      team,
      opponent,
      shots: { 2: { made: n('shot2Made'), attempted: n('shot2Attempted') }, 3: { made: n('shot3Made'), attempted: n('shot3Attempted') } },
      freeThrows: { made: n('freeThrowMade'), attempted: n('freeThrowAttempted') },
      tiles: tiles as Record<TileEventType, number>,
    };
  }
  const outcomes = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, n(`outcome:${outcome}`)]));
  return {
    team,
    opponent,
    outcomes: outcomes as Record<Outcome, number>,
    rbi: n('rbi'),
    runs: n('runs'),
    steals: n('steals'),
  };
}

/** The first field whose text is not a whole number, or undefined: no coercion, no rounding; a blank or spaces around digits pass. */
export const notWhole = (fields: CountField[], text: Record<string, string>): CountField | undefined =>
  fields.find(([key]) => !/^\s*\d*\s*$/.test(text[key] ?? ''));

// whether a value is a count or score a Totals takes: a whole number from 0 to 999
const isCount = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 999;
// the scores and counts a sport's Totals holds, in the form's order; a count the Totals lacks reads undefined, so it is refused
const countsIn = (sport: GameRow['sport'], totals: GameTotals): unknown[] => {
  const scores = [totals.team, totals.opponent];
  if (sport === 'basketball') {
    const { shots, freeThrows, tiles } = totals as Partial<Extract<GameTotals, { shots: unknown }>>;
    return [
      ...scores,
      shots?.[2]?.made,
      shots?.[2]?.attempted,
      shots?.[3]?.made,
      shots?.[3]?.attempted,
      freeThrows?.made,
      freeThrows?.attempted,
      ...TILE_EVENT_TYPES.map((type) => tiles?.[type]),
    ];
  }
  const { outcomes, rbi, runs, steals } = totals as Partial<Extract<GameTotals, { outcomes: unknown }>>;
  return [...scores, ...OUTCOMES.map((outcome) => outcomes?.[outcome]), rbi, runs, steals];
};
// a count as a row from another phone may hold it: missing, null, not a number or negative reads as 0, and a count is capped at 999
const readCount = (n: unknown): number => (typeof n === 'number' && n > 0 ? Math.min(Math.floor(n), 999) : 0);

// a real calendar day from 1900 on: the date must survive a round trip, so 2026-02-31 and 0000-00-00 fail (Postgres refuses both)
const isRealDay = (day: string): boolean => {
  const [year, month, date] = day.split('-').map(Number);
  return day >= '1900-01-01' && new Date(Date.UTC(year, month - 1, date)).toISOString().startsWith(day);
};

/** The sentence to show for a Backlogged Game entry that must not be saved, or undefined when it may be (ADR 0005). */
export const backlogProblem = (entry: Omit<BacklogEntry, 'athleteId'>, today: string): string | undefined => {
  const { sport, opponentName, gameDate, totals } = entry;
  if (opponentName.trim() === '') return 'A Game needs an Opponent.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate) || !isRealDay(gameDate)) return 'A Game needs a date, as YYYY-MM-DD.';
  if (gameDate > today) return "A Game can't be dated after today.";
  // basketball's Totals carry shots; softball's and baseball's carry outcomes
  if ((sport === 'basketball') !== ('shots' in totals)) return "Totals don't match this sport.";
  if (!countsIn(sport, totals).every(isCount)) return 'Counts and scores are whole numbers from 0 to 999.';
  if ('shots' in totals) {
    const attempts = [totals.freeThrows, totals.shots[2], totals.shots[3]];
    return attempts.some(({ made, attempted }) => made > attempted) ? "Made can't be more than attempted." : undefined;
  }
  // a Plate Appearance is any Outcome counted
  const plateAppearances = Object.values(totals.outcomes).reduce((sum, n) => sum + n, 0);
  if (totals.rbi > 0 && plateAppearances === 0) return 'RBI needs at least one Plate Appearance.';
  if (totals.runs < totals.outcomes.home_run) return "Runs can't be fewer than home runs.";
  return undefined;
};

// the fields an Event leaves empty: each Event sets only the ones its type carries
export const NO_FIELDS = {
  retracts_id: null,
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
};

/**
 * A Backlogged Game's Totals as the Events they stand for, built in memory and never stored (ADR 0005): each counted thing is one
 * Event in Period 1, and the last is the game_end carrying the Final Score. The Events share the Game's created_at, so it has no
 * time on court, and its Playing Share reads 0.
 */
export const eventsFromTotals = (game: GameRow): EventRow[] => {
  const totals = game.totals!;
  const events: EventRow[] = [];
  const add = (fields: Pick<EventRow, 'type'> & Partial<EventRow>) => {
    const seq = events.length + 1;
    events.push({ ...NO_FIELDS, id: `${game.id}:${seq}`, game_id: game.id, seq, client_ts: game.created_at, period: 1, ...fields });
  };
  // shortcut: a row from another phone is not validated, so readCount reads a count it holds badly as 0 and caps each at 999 to keep the Events bounded, upgrade when a download validates Totals
  const times = (count: number, make: () => void) => {
    for (let i = 0; i < count; i++) make();
  };
  // the Game's sport picks the shape, not the keys the row holds
  if (game.sport === 'basketball') {
    const { shots, freeThrows, tiles } = totals as Extract<GameTotals, { shots: unknown }>;
    for (const value of [2, 3] as const) {
      const made = readCount(shots?.[value]?.made);
      times(made, () => add({ type: 'shot', shot_value: value, made: true }));
      times(readCount(shots?.[value]?.attempted) - made, () => add({ type: 'shot', shot_value: value, made: false }));
    }
    const freeThrowsMade = readCount(freeThrows?.made);
    times(freeThrowsMade, () => add({ type: 'free_throw', made: true }));
    times(readCount(freeThrows?.attempted) - freeThrowsMade, () => add({ type: 'free_throw', made: false }));
    for (const type of TILE_EVENT_TYPES) times(readCount(tiles?.[type]), () => add({ type }));
  } else {
    const { outcomes, rbi, runs, steals } = totals as Extract<GameTotals, { outcomes: unknown }>;
    // one Plate Appearance per Outcome counted, all the RBI on the first
    const counted = OUTCOMES.flatMap((outcome) => Array.from({ length: readCount(outcomes?.[outcome]) }, () => outcome));
    counted.forEach((outcome, i) => add({ type: 'plate_appearance', outcome, rbi: i === 0 ? readCount(rbi) : 0 }));
    // the fold already counts each home run as a run, so only the other runs are moves home
    times(readCount(runs) - readCount(outcomes?.home_run), () => add({ type: 'baserunning', base: 'home', stolen: false }));
    times(readCount(steals), () => add({ type: 'baserunning', base: 'second', stolen: true }));
  }
  add({ type: 'game_end', team_score: readCount(totals.team), opponent_score: readCount(totals.opponent) });
  return events;
};
