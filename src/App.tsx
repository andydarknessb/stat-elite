import { liveQuery } from 'dexie';
import { useEffect, useState, type FormEvent } from 'react';
import type { AppCore, Home, Scores, TileEventType, UndoableType } from './core/appCore';

/** Re-renders whenever the store data behind a read model changes. */
function useReadModel<T>(read: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const subscription = liveQuery(read).subscribe({ next: setValue, error: console.error });
    return () => subscription.unsubscribe();
  }, deps);
  return value;
}

export function App({ core }: { core: AppCore }) {
  const home = useReadModel(() => core.home(), [core]);
  // the Game the Recorder just ended stays on screen, showing its Final Score, until Done
  const [ended, setEnded] = useState<string>();
  if (!home) return null;
  if (!home.athlete) return <AthleteForm core={core} />;
  const gameId = home.liveGameId ?? ended;
  if (!gameId) return <HomeScreen core={core} athlete={home.athlete} next={home.next} />;
  return <LiveGame core={core} gameId={gameId} onEnded={setEnded} onDone={() => setEnded(undefined)} />;
}

type AthleteFields = NonNullable<Home['athlete']>;

/** Add Athlete (first run, or from Home) or, when given an Athlete, Edit Athlete. The photo is set only at add. */
function AthleteForm({ core, athlete, onDone }: { core: AppCore; athlete?: AthleteFields; onDone?: () => void }) {
  const [name, setName] = useState(athlete?.name ?? '');
  const [number, setNumber] = useState(athlete?.jerseyNumber ?? '');
  const [photo, setPhoto] = useState<File>();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (athlete) void core.editAthlete({ id: athlete.id, name: name.trim(), jerseyNumber: number });
    else void core.addAthlete({ name: name.trim(), jerseyNumber: number, photo });
    onDone?.();
  };
  return (
    <main>
      <h1>{athlete ? 'Edit Athlete' : 'Add Athlete'}</h1>
      <form onSubmit={submit}>
        <label>
          Athlete name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        </label>
        <label>
          Number
          <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
        </label>
        {!athlete && (
          <label>
            Photo (optional)
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0])} />
          </label>
        )}
        <button className="primary">{athlete ? 'Save' : 'Add Athlete'}</button>
        {onDone && (
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        )}
      </form>
    </main>
  );
}

/** Draws a stored photo. Keyed by Athlete at the call site, so a switch never shows the previous photo. */
function AthletePhoto({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);
  return url ? <img src={url} alt="" /> : null;
}

function HomeScreen({ core, athlete, next }: { core: AppCore; athlete: AthleteFields; next: Home['next'] }) {
  const [form, setForm] = useState<'add' | 'edit'>();
  if (form) {
    return <AthleteForm core={core} athlete={form === 'edit' ? athlete : undefined} onDone={() => setForm(undefined)} />;
  }
  return (
    <main>
      <button
        className="photo"
        disabled={!next}
        aria-label={next ? `Switch to ${next.name}` : athlete.name}
        onClick={() => {
          if (next) void core.switchAthlete(next.id);
        }}
      >
        {athlete.photo && <AthletePhoto key={athlete.id} photo={athlete.photo} />}
      </button>
      <h1>{athlete.name}</h1>
      {athlete.jerseyNumber && <p>#{athlete.jerseyNumber}</p>}
      {/* shortcut: always basketball in quarters, until Game setup exists (#14) */}
      <button
        className="primary"
        onClick={() => void core.startGame({ athleteId: athlete.id, sport: 'basketball', periodFormat: 'quarters' })}
      >
        Start Game
      </button>
      <button onClick={() => setForm('edit')}>Edit</button>
      <button onClick={() => setForm('add')}>Add Athlete</button>
    </main>
  );
}

const TILE_LABELS: Record<TileEventType, string> = {
  reb_off: 'OREB',
  reb_def: 'DREB',
  assist: 'AST',
  steal: 'STL',
  block: 'BLK',
  turnover: 'TO',
  foul: 'FOUL',
};

/** Labels for every Event Undo can retract. */
const EVENT_LABELS: Record<UndoableType, string> = { ...TILE_LABELS, score: 'Score', game_end: 'End Game' };

/** One side of the Team–Opponent strip: its label, a − count + row. */
function ScoreSide({ label, value, onAdjust }: { label: string; value: number; onAdjust: (delta: 1 | -1) => void }) {
  return (
    <div className="side" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        <button aria-label={`${label} -1`} disabled={value === 0} onClick={() => onAdjust(-1)}>
          −
        </button>
        <span className="count">{value}</span>
        <button aria-label={`${label} +1`} onClick={() => onAdjust(1)}>
          +
        </button>
      </div>
    </div>
  );
}

/** End Game: the Final Score, prefilled from the strip. Submit stays disabled until both sides have a whole number. */
function EndGameForm({
  core,
  gameId,
  score,
  onEnded,
  onCancel,
}: {
  core: AppCore;
  gameId: string;
  score: Scores;
  onEnded: () => void;
  onCancel: () => void;
}) {
  const [team, setTeam] = useState(String(score.team));
  const [opponent, setOpponent] = useState(String(score.opponent));
  const valid = /^\d+$/.test(team) && /^\d+$/.test(opponent);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    // leaves the Game on screen before the store closes it, so Home does not flash in between
    onEnded();
    void core.endGame(gameId, { teamScore: Number(team), opponentScore: Number(opponent) });
  };
  return (
    <form onSubmit={submit}>
      <label>
        Team final
        <input value={team} onChange={(e) => setTeam(e.target.value)} inputMode="numeric" autoComplete="off" />
      </label>
      <label>
        Opponent final
        <input value={opponent} onChange={(e) => setOpponent(e.target.value)} inputMode="numeric" autoComplete="off" />
      </label>
      <button className="primary" disabled={!valid}>
        End Game
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

function LiveGame({
  core,
  gameId,
  onEnded,
  onDone,
}: {
  core: AppCore;
  gameId: string;
  onEnded: (gameId: string) => void;
  onDone: () => void;
}) {
  const game = useReadModel(() => core.liveGame(gameId), [core, gameId]);
  // the label of the Event a tap just recorded, shown for 3 seconds
  const [toast, setToast] = useState<string>();
  const [ending, setEnding] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!game) return null;
  if (game.final) {
    return (
      <main>
        <h1>Final</h1>
        <p className="final">
          Team {game.final.team} – Opponent {game.final.opponent}
        </p>
        <button className="primary" onClick={onDone}>
          Done
        </button>
      </main>
    );
  }
  const tap = async (type: TileEventType) => {
    await core.recordTile(gameId, type);
    setToast(TILE_LABELS[type]);
  };
  const adjust = (side: 'team' | 'opponent', delta: 1 | -1) => {
    setToast(EVENT_LABELS.score);
    void core.adjustScore(gameId, side, delta);
  };
  const undo = () => {
    setToast(undefined);
    void core.undo(gameId);
  };
  return (
    <main>
      <section className="strip" aria-label="Score">
        <ScoreSide label="Team" value={game.score.team} onAdjust={(delta) => adjust('team', delta)} />
        <ScoreSide label="Opponent" value={game.score.opponent} onAdjust={(delta) => adjust('opponent', delta)} />
      </section>
      {/* shortcut: only the STL tile, until the full basketball live screen (#15) */}
      <button className="tile" onClick={() => void tap('steal')}>
        STL <span className="count">{game.tiles.steal}</span>
      </button>
      <button className="undo" disabled={!game.undoable} onClick={undo}>
        {game.undoable ? `Undo (last Event): ${EVENT_LABELS[game.undoable.type]}` : 'Undo (last Event)'}
      </button>
      {ending ? (
        <EndGameForm
          core={core}
          gameId={gameId}
          score={game.score}
          onCancel={() => setEnding(false)}
          onEnded={() => {
            setEnding(false);
            onEnded(gameId);
          }}
        />
      ) : (
        <button onClick={() => setEnding(true)}>End Game</button>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={undo}>Undo</button>
        </div>
      )}
    </main>
  );
}
