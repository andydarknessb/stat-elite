import { liveQuery } from 'dexie';
import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import {
  BUTTON_SIZES,
  HALF_COURT,
  arcPreset,
  type AppCore,
  type ButtonSize,
  type GameFormat,
  type GameSetup,
  type Home,
  type LiveGame,
  type Scores,
  type TileEventType,
  type UndoableType,
} from './core/appCore';
import { InviteRefused } from './core/server';
import { InstallPrompt } from './InstallPrompt';

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
  // an Invite link opens its own screen until the invitee is done with it
  const [invite, setInvite] = useState(() => new URLSearchParams(location.search).get('invite') ?? undefined);
  if (invite) {
    const done = () => {
      history.replaceState(null, '', location.pathname);
      setInvite(undefined);
    };
    return <InviteScreen core={core} token={invite} onDone={done} />;
  }
  if (!home) return null;
  const gameId = home.liveGameId ?? ended;
  return (
    <>
      <NotSynced core={core} />
      {!home.athlete ? (
        <FirstRun core={core} />
      ) : !gameId ? (
        <HomeScreen core={core} athlete={home.athlete} next={home.next} />
      ) : (
        <LiveGame core={core} gameId={gameId} onEnded={setEnded} onDone={() => setEnded(undefined)} />
      )}
    </>
  );
}

/** An Invite link. Signed out, the invitee gets a magic link that carries the Invite; signed in, accepting it makes them a Member. */
function InviteScreen({ core, token, onDone }: { core: AppCore; token: string; onDone: () => void }) {
  const sync = useReadModel(() => core.sync(), [core]);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!sync?.signedIn) return;
    core.acceptInvite(token).then(
      () => setJoined(true),
      (refused: unknown) => setError(refusalMessage(refused)),
    );
  }, [core, token, sync?.signedIn]);
  if (!sync) return null;
  if (!sync.signedIn) {
    if (sent) return <main><p>Check your email for the link, then open it on this phone.</p></main>;
    const submit = async (e: FormEvent) => {
      e.preventDefault();
      try {
        await core.signIn(email.trim(), token);
        setSent(true);
      } catch {
        setError('Could not send the link. Check the connection and try again.');
      }
    };
    return (
      <main>
        <h1>Join an Athlete</h1>
        <p>Sign in with your email to become a Member.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <button className="primary">Send link</button>
          {error && <p role="alert">{error}</p>}
        </form>
      </main>
    );
  }
  if (joined) {
    return (
      <main>
        <h1>You&apos;re a Member</h1>
        <p>The Athlete and its Games are on this phone.</p>
        <button className="primary" onClick={onDone}>Continue</button>
      </main>
    );
  }
  if (error) {
    return (
      <main>
        <p role="alert">{error}</p>
        <button className="primary" onClick={onDone}>Continue</button>
      </main>
    );
  }
  return <main><p>Joining…</p></main>;
}

/** What a link that cannot be accepted says, in the words the invitee needs. */
function refusalMessage(error: unknown): string {
  if (!(error instanceof InviteRefused)) return 'Could not join. Check the connection and try again.';
  if (error.reason === 'own') return 'This is your own invite link.';
  if (error.reason === 'used') return 'This invite link has already been used.';
  if (error.reason === 'expired') return 'This invite link has expired. Ask for a new one.';
  return 'This invite link is not valid.';
}

/** Invite co-parent, for the Owner of a signed-in Athlete: makes an Invite, then offers its link to the share sheet (ADR 0004). */
function InviteCoParent({ core, athleteId }: { core: AppCore; athleteId: string }) {
  const canInvite = useReadModel(() => core.canInvite(athleteId), [core, athleteId]);
  const [link, setLink] = useState<string>();
  const [error, setError] = useState<string>();
  if (!canInvite) return null;
  const makeInvite = async () => {
    try {
      const token = await core.createInvite(athleteId);
      setLink(`${location.origin}/?invite=${token}`);
    } catch {
      setError('Could not make an invite. Check the connection and try again.');
    }
  };
  if (!link) {
    return (
      <>
        <button onClick={() => void makeInvite()}>Invite co-parent</button>
        {error && <p role="alert">{error}</p>}
      </>
    );
  }
  return (
    <>
      <p style={{ overflowWrap: 'anywhere' }}>{link}</p>
      <p>Works once, and for 7 days.</p>
      {/* without the share sheet the link above is copied by hand; a cancelled share is not an error */}
      {'share' in navigator && (
        <button onClick={() => void navigator.share({ url: link, title: 'Join StatElite' }).catch(() => undefined)}>
          Share invite link
        </button>
      )}
    </>
  );
}

/** The "N not synced" badge: the rows that still live only on the phone. */
function NotSynced({ core }: { core: AppCore }) {
  const sync = useReadModel(() => core.sync(), [core]);
  if (!sync) return null;
  return <p className="sync">{sync.notSynced} not synced</p>;
}

/** Save this game: a signed-out Recorder gets a magic link, and the rows upload once the account is signed in. */
function SaveGame({ core }: { core: AppCore }) {
  const sync = useReadModel(() => core.sync(), [core]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  if (!sync || sync.signedIn) return null;
  if (!open) return <button onClick={() => setOpen(true)}>Save this game</button>;
  if (sent) return <p>Check your email for the link, then open it on this phone.</p>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await core.signIn(email.trim());
      setSent(true);
    } catch {
      setError('Could not send the link. Check the connection and try again.');
    }
  };
  return (
    <form onSubmit={submit}>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <button className="primary">Send link</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/** No Athlete yet: offers the install and Add Athlete. */
function FirstRun({ core }: { core: AppCore }) {
  return (
    <>
      <AthleteForm core={core} />
      <InstallPrompt />
    </>
  );
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

/** Game setup: the Athlete's last Game prefills it, so starting is usually one tap. */
function GameSetupForm({ core, athleteId, onCancel }: { core: AppCore; athleteId: string; onCancel: () => void }) {
  const setup = useReadModel(() => core.gameSetup(athleteId), [core, athleteId]);
  if (!setup) return null;
  return <SetupFields core={core} athleteId={athleteId} setup={setup} onCancel={onCancel} />;
}

/** The fields hold what the user types from the first render on; the prefill only seeds them. */
function SetupFields({
  core,
  athleteId,
  setup,
  onCancel,
}: {
  core: AppCore;
  athleteId: string;
  setup: GameSetup;
  onCancel: () => void;
}) {
  const [sport, setSport] = useState(setup.sport);
  const [periods, setPeriods] = useState(setup.basketballPeriods);
  const [opponent, setOpponent] = useState(setup.opponentName);
  const [gameDate, setGameDate] = useState(setup.gameDate);
  // a second tap before the Game shows on screen would start a second Game
  const [starting, setStarting] = useState(false);
  const valid = opponent.trim() !== '' && gameDate !== '';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || starting) return;
    setStarting(true);
    const format: GameFormat =
      sport === 'basketball' ? { sport, periodFormat: periods } : { sport, periodFormat: 'innings' };
    void core.startGame({ athleteId, opponentName: opponent, gameDate, ...format });
  };
  return (
    <main>
      <h1>Game setup</h1>
      <form onSubmit={submit}>
        <label>
          Sport
          <select value={sport} onChange={(e) => setSport(e.target.value as GameFormat['sport'])}>
            <option value="basketball">Basketball</option>
            <option value="softball">Softball</option>
            <option value="baseball">Baseball</option>
          </select>
        </label>
        <label>
          Period format
          {sport === 'basketball' ? (
            <select value={periods} onChange={(e) => setPeriods(e.target.value === 'halves' ? 'halves' : 'quarters')}>
              <option value="quarters">Quarters</option>
              <option value="halves">Halves</option>
            </select>
          ) : (
            <select value="innings" disabled>
              <option value="innings">Innings</option>
            </select>
          )}
        </label>
        <label>
          Opponent
          <input value={opponent} onChange={(e) => setOpponent(e.target.value)} required autoComplete="off" />
        </label>
        <label>
          Date
          <input type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} required />
        </label>
        <button className="primary" disabled={!valid || starting}>
          Start
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </main>
  );
}

function HomeScreen({ core, athlete, next }: { core: AppCore; athlete: AthleteFields; next: Home['next'] }) {
  const [form, setForm] = useState<'add' | 'edit' | 'setup' | 'settings'>();
  // a Member records Games on the Athlete too; Edit stays the Owner's
  const owner = useReadModel(() => core.isOwner(athlete.id), [core, athlete.id]);
  if (form === 'setup') {
    return <GameSetupForm core={core} athleteId={athlete.id} onCancel={() => setForm(undefined)} />;
  }
  if (form === 'settings') return <SettingsScreen core={core} onDone={() => setForm(undefined)} />;
  if (form) {
    return <AthleteForm core={core} athlete={form === 'edit' ? athlete : undefined} onDone={() => setForm(undefined)} />;
  }
  return (
    <>
      <main>
        <button
          className="photo"
          disabled={!next}
          aria-label={next ? `Switch to ${next.name}` : athlete.name}
          onClick={() => {
            if (next) void core.switchAthlete(next.id);
          }}
        >
          {athlete.photo ? (
            <AthletePhoto key={athlete.id} photo={athlete.photo} />
          ) : (
            // a downloaded Athlete has no photo here: photos stay on the phone that picked them
            <span className="photo-placeholder" aria-hidden="true">
              {[...athlete.name][0]}
            </span>
          )}
        </button>
        <h1>{athlete.name}</h1>
        {athlete.jerseyNumber && <p>#{athlete.jerseyNumber}</p>}
        <button className="primary" onClick={() => setForm('setup')}>
          Start Game
        </button>
        {owner && <button onClick={() => setForm('edit')}>Edit</button>}
        <button onClick={() => setForm('add')}>Add Athlete</button>
        <button onClick={() => setForm('settings')}>Settings</button>
        <InviteCoParent core={core} athleteId={athlete.id} />
      </main>
      <InstallPrompt />
    </>
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

/** Labels for every Event Undo can retract, except a Free Throw or Shot, which name their result (see undoLabel). */
const EVENT_LABELS: Record<Exclude<UndoableType, 'free_throw' | 'shot'>, string> = {
  ...TILE_LABELS,
  sub_in: 'Sub In',
  sub_out: 'Sub Out',
  score: 'Score',
  game_end: 'End Game',
};

const freeThrowLabel = (made?: boolean) => (made ? 'Free Throw made' : 'Free Throw missed');
const shotLabel = (value: 2 | 3 | undefined, made?: boolean) => `${made ? 'Made' : 'Missed'} ${value}PT`;
/** A Shift's time as m:ss. */
const clockOf = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const undoLabel = (undoable: NonNullable<LiveGame['undoable']>) =>
  undoable.type === 'free_throw'
    ? freeThrowLabel(undoable.made)
    : undoable.type === 'shot'
      ? shotLabel(undoable.value, undoable.made)
      : EVENT_LABELS[undoable.type];

const SIZE_LABELS: Record<ButtonSize, string> = { compact: 'Compact', standard: 'Standard', bleacher: 'Bleacher' };

/** Settings: Button Size, the phone setting the live screen reads (GLOSSARY: Button Size). */
function SettingsScreen({ core, onDone }: { core: AppCore; onDone: () => void }) {
  const size = useReadModel(() => core.buttonSize(), [core]);
  if (!size) return null;
  return (
    <main>
      <h1>Settings</h1>
      <div className="sizes" role="group" aria-label="Button Size">
        {BUTTON_SIZES.map((option) => (
          <button
            key={option}
            aria-pressed={option === size}
            className={option === size ? 'primary' : undefined}
            onClick={() => void core.setButtonSize(option)}
          >
            {SIZE_LABELS[option]}
          </button>
        ))}
      </div>
      <button className="primary" onClick={onDone}>
        Done
      </button>
    </main>
  );
}

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

const toFt = (spot: number, feet: number) => (spot / 100) * feet;
const { widthFt, lengthFt, basketFt, arcFt, cornerFt, cornerEndFt } = HALF_COURT;
// the three-point line: the corner lines from the baseline, then the arc between them
const THREE_POINT_LINE = `M ${cornerFt} 0 V ${cornerEndFt} A ${arcFt} ${arcFt} 0 0 0 ${widthFt - cornerFt} ${cornerEndFt} V 0`;

/** A tap on the half court, and the value the arc presets it to, until MAKE or MISS records it. */
type PendingShot = { x: number; y: number; value: 2 | 3 };

/** Shot entry: tap the spot, then MAKE or MISS. Nothing is saved until the result tap (plan: Shot entry). */
function ShotEntry({
  core,
  gameId,
  shots,
  points,
  onRecorded,
}: {
  core: AppCore;
  gameId: string;
  shots: LiveGame['shots'];
  points: number;
  onRecorded: (label: string) => void;
}) {
  const [pending, setPending] = useState<PendingShot>();
  // the court is drawn in feet, so a spot is read off the box as 0–100 on each axis
  const place = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    setPending({ x, y, value: arcPreset(x, y) });
  };
  // the arc presets the value; the Recorder can flip it until the result tap
  const flip = () => {
    if (pending) setPending({ ...pending, value: pending.value === 2 ? 3 : 2 });
  };
  const record = (made: boolean) => {
    if (!pending) return;
    setPending(undefined);
    void core.recordShot(gameId, { x: pending.x, y: pending.y, value: pending.value, made });
    onRecorded(shotLabel(pending.value, made));
  };
  return (
    <div className="shot-entry">
      <svg className="court" viewBox={`0 0 ${widthFt} ${lengthFt}`} role="img" aria-label="Half court" onClick={place}>
        <rect x="0" y="0" width={widthFt} height={lengthFt} />
        <path d={THREE_POINT_LINE} />
        <circle cx={widthFt / 2} cy={basketFt} r="0.75" />
        {pending && <circle className="spot" cx={toFt(pending.x, widthFt)} cy={toFt(pending.y, lengthFt)} r="1.5" />}
      </svg>
      <div className="shot-controls" role="group" aria-label="Shot result">
        <button aria-pressed={pending?.value === 3} disabled={!pending} onClick={flip}>
          3PT
        </button>
        <button className="make" disabled={!pending} onClick={() => record(true)}>
          MAKE
        </button>
        <button className="miss" disabled={!pending} onClick={() => record(false)}>
          MISS
        </button>
        <p className="shot-count">
          2PT {shots[2].made}/{shots[2].attempted} · 3PT {shots[3].made}/{shots[3].attempted} · {points} pts
        </p>
      </div>
    </div>
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
  // the live Game re-reads each second, so the Shift timer and Playing Share keep running
  // shortcut: re-reads every Event of the Game each second, fine for one Game; upgrade to a UI-side clock if a Game's read gets slow
  const [second, setSecond] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSecond((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const game = useReadModel(() => core.liveGame(gameId), [core, gameId, second]);
  const size = useReadModel(() => core.buttonSize(), [core]) ?? 'standard';
  // the label of the Event a tap just recorded, shown for 3 seconds
  const [toast, setToast] = useState<string>();
  const [ending, setEnding] = useState(false);
  // bumped on each Sub, so the strip restarts its pulse
  const [pulse, setPulse] = useState(0);
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
        <SaveGame core={core} />
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
  const tapFreeThrow = async (made: boolean) => {
    await core.recordFreeThrow(gameId, made);
    setToast(freeThrowLabel(made));
  };
  const adjust = (side: 'team' | 'opponent', delta: 1 | -1) => {
    setToast(EVENT_LABELS.score);
    void core.adjustScore(gameId, side, delta);
  };
  const undo = () => {
    setToast(undefined);
    void core.undo(gameId);
  };
  const sub = () => {
    setToast(game.onCourt ? EVENT_LABELS.sub_out : EVENT_LABELS.sub_in);
    setPulse((n) => n + 1);
    void core.toggleSub(gameId);
  };
  // the Shift on court, if any: its timer and Plus/Minus so far
  const current = game.onCourt ? game.shifts.at(-1) : undefined;
  const shots = (
    <>
      <ShotEntry
        core={core}
        gameId={gameId}
        shots={game.shots}
        points={game.points}
        onRecorded={(label) => setToast(label)}
      />
      <div className="free-throws" role="group" aria-label="Free Throw">
        <button className="make" onClick={() => void tapFreeThrow(true)}>
          MAKE
        </button>
        <span className="count">
          {game.freeThrows.made}/{game.freeThrows.attempted}
        </span>
        <button className="miss" onClick={() => void tapFreeThrow(false)}>
          MISS
        </button>
      </div>
    </>
  );
  const otherStats = (
    <div className="tiles">
      {(Object.keys(TILE_LABELS) as TileEventType[]).map((type) => (
        <button key={type} className="tile" onClick={() => void tap(type)}>
          {TILE_LABELS[type]} <span className="count">{game.tiles[type]}</span>
        </button>
      ))}
    </div>
  );
  return (
    <main className={`live ${size}`}>
      {game.sport === 'basketball' && (
        <section className="shift" aria-label="Shift">
          <button className={game.onCourt ? 'primary' : undefined} onClick={sub}>
            {game.onCourt ? 'Sub Out' : 'Sub In'}
          </button>
          <div>
            <p className="timer">
              {current ? `On court ${clockOf(current.ms)} · ${signed(current.plusMinus)}` : 'On bench'}
            </p>
            <p className="game">
              {Math.round(game.playingShare * 100)}% · {game.shifts.length}{' '}
              {game.shifts.length === 1 ? 'Shift' : 'Shifts'} · Plus/Minus {signed(game.plusMinus)}
            </p>
          </div>
        </section>
      )}
      <section key={pulse} className={pulse ? 'strip pulse' : 'strip'} aria-label="Score">
        <ScoreSide label="Team" value={game.score.team} onAdjust={(delta) => adjust('team', delta)} />
        <ScoreSide label="Opponent" value={game.score.opponent} onAdjust={(delta) => adjust('opponent', delta)} />
      </section>
      {size === 'bleacher' ? (
        <div className="pages">
          <section className="page" aria-label="Shots">
            {shots}
          </section>
          <section className="page" aria-label="Other stats">
            {otherStats}
          </section>
        </div>
      ) : (
        <>
          {shots}
          {otherStats}
        </>
      )}
      <button className="undo" disabled={!game.undoable} onClick={undo}>
        {game.undoable ? `Undo (last Event): ${undoLabel(game.undoable)}` : 'Undo (last Event)'}
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
