import type { AthleteFate, FeedGame, Line } from './appCore';
import type { Batting, StrikeKind, Undoable, UndoableType } from './eventLog';
import type { BaseMove, Outcome, Pitch, TileEventType } from './store';

/** The basketball tile Events' labels, on the live screen and in the Totals form. */
export const TILE_LABELS: Record<TileEventType, string> = {
  reb_off: 'OREB',
  reb_def: 'DREB',
  assist: 'AST',
  steal: 'STL',
  block: 'BLK',
  turnover: 'TO',
  foul: 'FOUL',
};

/** Labels for every Event Undo can retract, except a Free Throw or Shot, which name their result (see undoLabel). */
export const EVENT_LABELS: Record<Exclude<UndoableType, 'free_throw' | 'shot'>, string> = {
  ...TILE_LABELS,
  sub_in: 'Sub In',
  sub_out: 'Sub Out',
  score: 'Score',
  game_end: 'End Game',
  period_start: 'Next period',
  plate_appearance: 'Plate Appearance',
  pitch: 'Pitch',
  baserunning: 'Base',
};

/** Pitch button labels, in the order the plan lists them (plan: optional Pitches). */
export const PITCH_LABELS: Record<Pitch, string> = {
  ball: 'Ball',
  called_strike: 'Called strike',
  swinging_strike: 'Swinging strike',
  foul: 'Foul',
};

/** Outcome button labels, as the plan's Outcome grid names them (plan: softball/baseball Outcomes). */
export const OUTCOME_LABELS: Record<Outcome, string> = {
  single: '1B',
  double: '2B',
  triple: '3B',
  home_run: 'HR',
  walk: 'Walk',
  hit_by_pitch: 'Hit by pitch',
  reached_on_error: 'Error',
  fielders_choice: "Fielder's choice",
  strikeout: 'Strikeout',
  ground_out: 'Ground out',
  fly_out: 'Fly out',
  line_out: 'Line out',
  sac_fly: 'Sac fly',
  sac_bunt: 'Sac bunt',
};

/** A batting rate as a scorebook prints it: .333, 1.000; a dash while its denominator is zero. */
export const rateText = (rate?: number) => (rate === undefined ? '—' : rate.toFixed(3).replace(/^0/, ''));

/** An Outcome's label; a strikeout names how it was marked (GLOSSARY: Strikeout looking, Strikeout swinging). */
export const outcomeLabel = (outcome: Outcome, strikeout?: StrikeKind) =>
  outcome === 'strikeout' && strikeout ? `Strikeout ${strikeout}` : OUTCOME_LABELS[outcome];

/** Where the Athlete on base goes, as the diamond names it; a steal says so (GLOSSARY: Baserunning). */
export const BASE_LABELS: Record<BaseMove, string> = { second: '2nd', third: '3rd', home: 'Scored', out: 'Out' };
export const baseLabel = (base: BaseMove, stolen?: boolean) => `${BASE_LABELS[base]}${stolen ? ' (Stole)' : ''}`;

export const freeThrowLabel = (made?: boolean) => (made ? 'Free Throw made' : 'Free Throw missed');
export const shotLabel = (value: 2 | 3 | undefined, made?: boolean) => `${made ? 'Made' : 'Missed'} ${value}PT`;
/** A Shift's time as m:ss. */
export const clockOf = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const undoLabel = (undoable: Undoable) =>
  undoable.type === 'free_throw'
    ? freeThrowLabel(undoable.made)
    : undoable.type === 'shot'
      ? shotLabel(undoable.value, undoable.made)
      : undoable.base
        ? baseLabel(undoable.base, undoable.stolen)
        : undoable.pitch
          ? PITCH_LABELS[undoable.pitch]
          : undoable.outcome
            ? outcomeLabel(undoable.outcome, undoable.strikeout)
            : EVENT_LABELS[undoable.type];

/** A Game's result: the letter its badge shows and the word it reads (W Won, L Lost, T Tied). */
export const resultOf = ({ team, opponent }: { team: number; opponent: number }) =>
  team > opponent ? { letter: 'W', name: 'Won' } : team < opponent ? { letter: 'L', name: 'Lost' } : { letter: 'T', name: 'Tied' };

/** The first letter of each of the first two names, upper-cased: "Casey Jones" is CJ. */
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');

/** What deleting does to one Athlete, in the words the Recorder reads before it confirms (ADR 0004). */
export const fateLine = (athlete: AthleteFate): string => {
  if (athlete.fate === 'passes') return `${athlete.name}: passes to ${athlete.to}, with its Games and Events.`;
  if (athlete.fate === 'deleted') {
    return `${athlete.name}: deleted with ${athlete.games} ${athlete.games === 1 ? 'Game' : 'Games'} and their Events.`;
  }
  return `${athlete.name}: you leave it; the Games you recorded stay with it.`;
};

/** A count with its sign, as Plus/Minus reads: +3, 0, -2. */
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The totals a season or a Game shows, in words. */
const lineText = (line: Line) =>
  `${line.points} PTS · FG ${line.fg.made}/${line.fg.attempted} · FT ${line.ft.made}/${line.ft.attempted} · ${line.rebounds} REB · ${line.assists} AST`;

/** A batting line in words: hits over At-Bats, and RBI. */
const battingText = (batting: Batting) => `H/AB ${batting.hits}/${batting.atBats} · ${batting.rbi} RBI`;

/** A Game's stat line in words: the basketball line, or on softball and baseball the batting line with its runs and stolen bases. */
export const gameLineText = (game: Pick<FeedGame, 'sport' | 'line' | 'batting' | 'baserunning'>) =>
  game.sport === 'basketball'
    ? lineText(game.line)
    : `${battingText(game.batting)} · ${game.baserunning.runs} R · ${game.baserunning.stolenBases} SB`;
