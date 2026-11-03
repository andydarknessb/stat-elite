import { liveQuery } from 'dexie';
import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  BUTTON_SIZES,
  HALF_COURT,
  arcPreset,
  backlogProblem,
  gameLineText,
  movesFrom,
  signed,
  type AppCore,
  type BacklogEntry,
  type Base,
  type ButtonSize,
  type GameFormat,
  type GameSetup,
  type FeedGame,
  type GameFeed,
  type Home,
  type LiveGame,
  type AthleteFate,
  type DeletionSummary,
  type Member,
  type Scores,
  type Season,
  type StrikeKind,
  type TileEventType,
  type UndoableType,
} from './core/appCore';
import { InviteRefused } from './core/server';
import { renderShareCard } from './core/shareCard';
import { OUTCOMES, PITCHES, type BaseMove, type GameTotals, type Outcome, type Pitch } from './core/store';
import { InstallPrompt } from './InstallPrompt';

/** What the Recorder sees when the phone's store refuses a write; the screen keeps what it had (#42). */
const NOT_SAVED = 'Not saved. Try again.';

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
  // Field mode marks the root, and theme.css gives it the light tokens over the dark default
  const fieldMode = useReadModel(() => core.fieldMode(), [core]);
  useEffect(() => {
    // before the first read, index.html has already marked the root from the copy below: leave it alone
    if (fieldMode === undefined) return;
    if (fieldMode) document.documentElement.dataset.field = '';
    else delete document.documentElement.dataset.field;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', fieldMode ? '#FFFFFF' : '#0B1020');
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', fieldMode ? 'light' : 'dark');
    // the copy index.html reads on the next cold load; a refused localStorage leaves the Dexie read to decide
    try {
      localStorage.setItem('field-mode', fieldMode ? 'on' : 'off');
    } catch {
      // the settings table still decides
    }
  }, [fieldMode]);
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

/** An Invite link. Signed out, the invitee signs in with the same form as Save this game, the Invite's token riding on the link; signed in, accepting it makes them a Member. */
function InviteScreen({ core, token, onDone }: { core: AppCore; token: string; onDone: () => void }) {
  const sync = useReadModel(() => core.sync(), [core]);
  // the code signs the invitee in here; sync does not re-read on a phone with nothing queued, so it may never say so
  const [verified, setVerified] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string>();
  const signedIn = verified || sync?.signedIn === true;
  useEffect(() => {
    if (!signedIn) return;
    core.acceptInvite(token).then(
      () => setJoined(true),
      (refused: unknown) => setError(refusalMessage(refused)),
    );
  }, [core, token, signedIn]);
  if (!sync) return null;
  if (!signedIn) {
    return (
      <main>
        <h1>Join an Athlete</h1>
        <p>Sign in with your email to become a Member.</p>
        <SignInForm core={core} invite={token} onSignedIn={() => setVerified(true)} />
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

/** The Members of a shared Athlete: the Owner sees them and removes one; a Member leaves (ADR 0004). */
function Members({ core, athleteId }: { core: AppCore; athleteId: string }) {
  const canInvite = useReadModel(() => core.canInvite(athleteId), [core, athleteId]);
  const owner = useReadModel(() => core.isOwner(athleteId), [core, athleteId]);
  const [members, setMembers] = useState<Member[]>();
  const [error, setError] = useState<string>();
  const load = () =>
    core.members(athleteId).then(setMembers, () => setError('Could not load the Members. Check the connection and try again.'));
  useEffect(() => {
    if (canInvite) void load();
  }, [core, athleteId, canInvite]);
  if (owner === undefined) return null;
  if (!owner) {
    return (
      <>
        <button onClick={() => void core.leave(athleteId).catch(() => setError('Could not leave. Wait for everything to sync, then try again.'))}>
          Leave
        </button>
        {error && <p role="alert">{error}</p>}
      </>
    );
  }
  if (!canInvite) return null;
  const remove = async (memberId: string) => {
    try {
      await core.removeMember(athleteId, memberId);
      await load();
    } catch {
      setError('Could not remove. Check the connection and try again.');
    }
  };
  return (
    <section>
      <h2>Members</h2>
      {members?.length === 0 && <p>No Members yet.</p>}
      <ul>
        {members?.map((member) => (
          <li key={member.member_id}>
            {member.label}{' '}
            <button onClick={() => void remove(member.member_id)}>Remove</button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

/** The "N not synced" badge: the rows that still live only on the phone. */
function NotSynced({ core }: { core: AppCore }) {
  const sync = useReadModel(() => core.sync(), [core]);
  if (!sync) return null;
  return <p className="sync">{sync.notSynced} not synced</p>;
}

/** Save this game: a signed-out Recorder gets an email with a link and a code, and the rows upload once the account is signed in. */
function SaveGame({ core }: { core: AppCore }) {
  const sync = useReadModel(() => core.sync(), [core]);
  const [open, setOpen] = useState(false);
  if (!sync || sync.signedIn) return null;
  if (!open) return <button onClick={() => setOpen(true)}>Save this game</button>;
  return <SignInForm core={core} />;
}

/** Save this game on Home once a Game has finished: Game Complete is gone after Done, so this is the only sign-in control (#138). */
function SaveFromHome({ core, athleteId }: { core: AppCore; athleteId: string }) {
  const feed = useReadModel(() => core.gameFeed(athleteId), [core, athleteId]);
  if (!feed || feed.games.length === 0) return null;
  return <SaveGame core={core} />;
}

/** The sign-in step of Save this game and the Invite screen: the email gets a link and a code, and typing the code signs the Recorder in here (the link does it in the browser that opens it). */
function SignInForm({ core, invite, onSignedIn }: { core: AppCore; invite?: string; onSignedIn?: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await core.signIn(email.trim(), invite);
      setSent(true);
    } catch {
      setError('Could not send the link. Check the connection and try again.');
    }
  };
  // a Recorder in the installed app cannot open the link there, so the code signs in instead
  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await core.verifyCode(email.trim(), code.trim());
    } catch {
      setError('That code did not work. Check it and try again, or send a new link.');
      return;
    }
    onSignedIn?.();
  };
  if (sent) {
    return (
      <form onSubmit={submitCode}>
        <p>Check your email. Open the link on this phone, or type the 6-digit code here.</p>
        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required autoComplete="one-time-code" />
        </label>
        <button className="primary">Sign in</button>
        <button type="button" onClick={() => { setSent(false); setCode(''); setError(undefined); }}>Send a new link</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }
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

/** Add Athlete (first run, or from Home) or, when given an Athlete, Edit Athlete. A photo picked in either sets this phone's photo; none picked keeps it. */
function AthleteForm({ core, athlete, onDone }: { core: AppCore; athlete?: AthleteFields; onDone?: () => void }) {
  const [name, setName] = useState(athlete?.name ?? '');
  const [number, setNumber] = useState(athlete?.jerseyNumber ?? '');
  const [photo, setPhoto] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // a second tap while the save is in flight would add a second Athlete
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (athlete) await core.editAthlete({ id: athlete.id, name: name.trim(), jerseyNumber: number, photo });
      else await core.addAthlete({ name: name.trim(), jerseyNumber: number, photo });
      onDone?.();
    } catch {
      setFailed(true);
      setSaving(false);
    }
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
        <label>
          Photo (optional)
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0])} />
        </label>
        {/* above the buttons: a tap on the button scrolls it into view, and an alert below it can land off the bottom edge */}
        {failed && <p role="alert">{NOT_SAVED}</p>}
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

/** The first letter of each of the first two names, upper-cased: "Casey Jones" is CJ. */
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');

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
  const [failed, setFailed] = useState(false);
  const valid = opponent.trim() !== '' && gameDate !== '';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || starting) return;
    setStarting(true);
    const format: GameFormat =
      sport === 'basketball' ? { sport, periodFormat: periods } : { sport, periodFormat: 'innings' };
    try {
      await core.startGame({ athleteId, opponentName: opponent, gameDate, ...format });
    } catch {
      setFailed(true);
      setStarting(false);
    }
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
            <select value={periods} onChange={(e) => setPeriods(e.target.value as GameSetup['basketballPeriods'])}>
              <option value="quarters">Quarters</option>
              <option value="halves">Halves</option>
              <option value="eighths">8 Periods</option>
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
        {failed && <p role="alert">{NOT_SAVED}</p>}
      </form>
    </main>
  );
}

/** The photo: tapping it switches to the next Athlete. A switch the store refuses says so and keeps the Athlete on screen (#42). */
function SwitchPhoto({ core, athlete, next }: { core: AppCore; athlete: AthleteFields; next: Home['next'] }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        className="photo"
        disabled={!next}
        aria-label={next ? `Switch to ${next.name}` : athlete.name}
        onClick={() => {
          if (next) void core.switchAthlete(next.id).then(() => setFailed(false), () => setFailed(true));
        }}
      >
        {athlete.photo ? (
          <AthletePhoto key={athlete.id} photo={athlete.photo} />
        ) : (
          // a downloaded Athlete has no photo here: photos stay on the phone that picked them
          <span className="photo-placeholder" aria-hidden="true">
            {initials(athlete.name)}
          </span>
        )}
      </button>
      {failed && <p role="alert">{NOT_SAVED}</p>}
    </>
  );
}

function HomeScreen({ core, athlete, next }: { core: AppCore; athlete: AthleteFields; next: Home['next'] }) {
  const [form, setForm] = useState<'add' | 'edit' | 'setup' | 'settings' | 'backlog'>();
  const [tab, setTab] = useState<Tab>('home');
  // the finished Game whose summary is open, from either tab
  const [summary, setSummary] = useState<string>();
  if (form === 'setup') {
    return <GameSetupForm core={core} athleteId={athlete.id} onCancel={() => setForm(undefined)} />;
  }
  if (form === 'settings') return <SettingsScreen core={core} onDone={() => setForm(undefined)} />;
  // ahead of the summary below: an Edit opens this form over the summary it came from, and Save or Cancel returns to that summary
  if (form === 'backlog') {
    return (
      <BacklogForm
        core={core}
        athleteId={athlete.id}
        // a summary only opens from the selected Athlete's Games, so an Edit's Game is this Athlete's too
        athleteName={athlete.name}
        gameId={summary}
        onDone={(savedGameId) => {
          setForm(undefined);
          if (savedGameId) setSummary(savedGameId);
        }}
      />
    );
  }
  if (form) {
    return <AthleteForm core={core} athlete={form === 'edit' ? athlete : undefined} onDone={() => setForm(undefined)} />;
  }
  if (summary) {
    return (
      <GameSummary
        core={core}
        gameId={summary}
        onBack={() => setSummary(undefined)}
        onEdit={() => setForm('backlog')}
        onRemoved={() => {
          setSummary(undefined);
          setTab('home');
        }}
      />
    );
  }
  if (tab === 'games' || tab === 'insights') {
    return (
      <>
        {tab === 'games' ? <GamesTab key={athlete.id} core={core} athleteId={athlete.id} onOpen={setSummary} /> : <InsightsTab core={core} athleteId={athlete.id} />}
        <TabBar tab={tab} onTab={setTab} />
      </>
    );
  }
  return (
    <>
      <main>
        <header className="home-head">
          <div className="wordmark" role="img" aria-label="StatElite">
            <span>STAT</span>
            <span>ELITE</span>
          </div>
          <button className="icon-button" aria-label="Settings" onClick={() => setForm('settings')}>
            <Icon name="settings" />
          </button>
        </header>
        <div className="athlete">
          <SwitchPhoto core={core} athlete={athlete} next={next} />
          <h1>{athlete.name}</h1>
          {athlete.jerseyNumber && <p className="number">#{athlete.jerseyNumber}</p>}
          <div className="athlete-actions">
            <button className="icon-button" aria-label="Edit" onClick={() => setForm('edit')}>
              <Icon name="edit" />
            </button>
            <button className="icon-button" aria-label="Add Athlete" onClick={() => setForm('add')}>
              <Icon name="addAthlete" />
            </button>
          </div>
        </div>
        <button className="primary" onClick={() => setForm('setup')}>
          Start Game
        </button>
        <SaveFromHome core={core} athleteId={athlete.id} />
        <button onClick={() => setForm('backlog')}>Add past Game</button>
        <SeasonAndRecent core={core} athleteId={athlete.id} onOpen={setSummary} />
        <section className="card sharing" aria-label="Sharing">
          <InviteCoParent core={core} athleteId={athlete.id} />
          <Members core={core} athleteId={athlete.id} />
        </section>
      </main>
      <TabBar tab={tab} onTab={setTab} />
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
  period_start: 'Next period',
  plate_appearance: 'Plate Appearance',
  pitch: 'Pitch',
  baserunning: 'Base',
};

/** Pitch button labels, in the order the plan lists them (plan: optional Pitches). */
const PITCH_LABELS: Record<Pitch, string> = {
  ball: 'Ball',
  called_strike: 'Called strike',
  swinging_strike: 'Swinging strike',
  foul: 'Foul',
};

/** Outcome button labels, as the plan's Outcome grid names them (plan: softball/baseball Outcomes). */
const OUTCOME_LABELS: Record<Outcome, string> = {
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
const rateText = (rate?: number) => (rate === undefined ? '—' : rate.toFixed(3).replace(/^0/, ''));

/** An Outcome's label; a strikeout names how it was marked (GLOSSARY: Strikeout looking, Strikeout swinging). */
const outcomeLabel = (outcome: Outcome, strikeout?: StrikeKind) =>
  outcome === 'strikeout' && strikeout ? `Strikeout ${strikeout}` : OUTCOME_LABELS[outcome];

/** Where the Athlete on base goes, as the diamond names it; a steal says so (GLOSSARY: Baserunning). */
const BASE_LABELS: Record<BaseMove, string> = { second: '2nd', third: '3rd', home: 'Scored', out: 'Out' };
const baseLabel = (base: BaseMove, stolen?: boolean) => `${BASE_LABELS[base]}${stolen ? ' (Stole)' : ''}`;

const freeThrowLabel = (made?: boolean) => (made ? 'Free Throw made' : 'Free Throw missed');
const shotLabel = (value: 2 | 3 | undefined, made?: boolean) => `${made ? 'Made' : 'Missed'} ${value}PT`;
/** A Shift's time as m:ss. */
const clockOf = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const undoLabel = (undoable: NonNullable<LiveGame['undoable']>) =>
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

const SIZE_LABELS: Record<ButtonSize, string> = { compact: 'Compact', standard: 'Standard', bleacher: 'Bleacher' };

type Tab = 'home' | 'games' | 'insights';

/** Stroke icons, drawn in the text's color; the paths are feather-style, MIT. */
const ICONS = {
  home: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  games: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  insights: <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />,
  edit: <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  addAthlete: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

/** The bottom tabs: Home, Games and Insights, each an icon over its label (plan: navigation). */
function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <nav className="tabs" aria-label="Tabs">
      <button aria-pressed={tab === 'home'} onClick={() => onTab('home')}>
        <span className="tab-icon">
          <Icon name="home" />
        </span>
        Home
      </button>
      <button aria-pressed={tab === 'games'} onClick={() => onTab('games')}>
        <span className="tab-icon">
          <Icon name="games" />
        </span>
        Games
      </button>
      <button aria-pressed={tab === 'insights'} onClick={() => onTab('insights')}>
        <span className="tab-icon">
          <Icon name="insights" />
        </span>
        Insights
      </button>
    </nav>
  );
}

const GROUP_LABELS: Record<FeedGame['group'], string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This Week',
  earlier: 'Earlier',
};

/** Finished Games grouped Today, Yesterday, This Week, Earlier; each row opens that Game's summary. */
function FeedRows({ games, onOpen }: { games: FeedGame[]; onOpen: (gameId: string) => void }) {
  if (games.length === 0) return <p>No finished Games yet.</p>;
  return (
    <>
      {(Object.keys(GROUP_LABELS) as FeedGame['group'][]).map((group) => {
        const rows = games.filter((game) => game.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} aria-label={GROUP_LABELS[group]}>
            <h2>{GROUP_LABELS[group]}</h2>
            {rows.map((game) => (
              <ResultRow key={game.id} game={game} onOpen={onOpen} />
            ))}
          </section>
        );
      })}
    </>
  );
}

const SPORT_ORDER: Season['sport'][] = ['basketball', 'softball', 'baseball'];
const SPORT_LABELS: Record<Season['sport'], string> = { basketball: 'Basketball', softball: 'Softball', baseball: 'Baseball' };

/** Home's season card: a chip for each sport with finished Games, its headline numbers and its Games count. The chip choice is screen state. */
function SeasonCard({ feed }: { feed: GameFeed }) {
  const [chosen, setChosen] = useState<Season['sport']>();
  const seasons = SPORT_ORDER.flatMap((sport) => feed.seasons.filter((season) => season.sport === sport));
  const season = seasons.find((s) => s.sport === chosen) ?? seasons[0];
  if (!season) return null;
  const games = feed.games.filter((game) => game.sport === season.sport).length;
  const stats: [string, string][] =
    season.sport === 'basketball'
      ? [
          ['Points', String(season.line.points)],
          ['Rebounds', String(season.line.rebounds)],
          ['Plus/Minus', signed(season.line.plusMinus)],
        ]
      : [
          ['AVG', rateText(season.batting.avg)],
          ['OBP', rateText(season.batting.obp)],
          ['SLG', rateText(season.batting.slg)],
        ];
  return (
    <section className="card" aria-label="Season">
      <div className="chips">
        {seasons.map((s) => (
          <button key={s.sport} className="chip" aria-pressed={s.sport === season.sport} onClick={() => setChosen(s.sport)}>
            {SPORT_LABELS[s.sport]}
          </button>
        ))}
      </div>
      <p className="games">
        {games} {games === 1 ? 'Game' : 'Games'}
      </p>
      <dl className="stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A Game's result: the letter its badge shows and the word it reads (W Won, L Lost, T Tied). */
const resultOf = ({ team, opponent }: { team: number; opponent: number }) =>
  team > opponent ? { letter: 'W', name: 'Won' } : team < opponent ? { letter: 'L', name: 'Lost' } : { letter: 'T', name: 'Tied' };

/** A finished Game as a result row: its W, L or T, Opponent, date and line, Plus/Minus on basketball, and the Final Score. Opens the Game's summary (plan: Result rows). */
function ResultRow({ game, onOpen }: { game: FeedGame; onOpen: (gameId: string) => void }) {
  const { team, opponent } = game.final;
  const { letter, name } = resultOf(game.final);
  return (
    <button className="result-row" onClick={() => onOpen(game.id)}>
      <span className="badge" role="img" aria-label={name}>
        {letter}
      </span>
      <span className="result-text">
        <span className="opponent">{game.opponent}</span>
        <span className="line">
          {game.gameDate} · {gameLineText(game)}
        </span>
        {game.sport === 'basketball' && <span className="line">Plus/Minus {game.backlogged ? '—' : signed(game.line.plusMinus)}</span>}
      </span>
      <span className="final">
        {team}–{opponent}
      </span>
    </button>
  );
}

/** Home's season card, then the Athlete's three most recent finished Games as result rows. */
function SeasonAndRecent({ core, athleteId, onOpen }: { core: AppCore; athleteId: string; onOpen: (gameId: string) => void }) {
  const feed = useReadModel(() => core.gameFeed(athleteId), [core, athleteId]);
  if (!feed) return null;
  return (
    <>
      {/* keyed by Athlete: a switch opens its own season on its first sport, not the one chosen for the last */}
      <SeasonCard key={athleteId} feed={feed} />
      <section className="card" aria-label="Recent Games">
        <h2>Recent Games</h2>
        {feed.games.length === 0 && <p>No finished Games yet.</p>}
        {feed.games.slice(0, 3).map((game) => (
          <ResultRow key={game.id} game={game} onOpen={onOpen} />
        ))}
      </section>
    </>
  );
}

/** A sport's season tiles on the Games tab: basketball's six totals, or softball and baseball's six batting numbers and Games count. */
function SeasonTiles({ season, games }: { season: Season; games: number }) {
  const stats: [string, string][] =
    season.sport === 'basketball'
      ? [
          ['Points', String(season.line.points)],
          ['FG', `${season.line.fg.made}/${season.line.fg.attempted}`],
          ['FT', `${season.line.ft.made}/${season.line.ft.attempted}`],
          ['Rebounds', String(season.line.rebounds)],
          ['Assists', String(season.line.assists)],
          ['Plus/Minus', signed(season.line.plusMinus)],
        ]
      : [
          ['AVG', rateText(season.batting.avg)],
          ['OBP', rateText(season.batting.obp)],
          ['SLG', rateText(season.batting.slg)],
          ['H/AB', `${season.batting.hits}/${season.batting.atBats}`],
          ['RBI', String(season.batting.rbi)],
          ['Games', String(games)],
        ];
  return (
    <section className="card" aria-label="Season">
      <dl className="stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The Games tab: All, then a chip for each sport with finished Games. A sport's chip shows its season tiles above its Games and filters the feed to it. */
function GamesTab({ core, athleteId, onOpen }: { core: AppCore; athleteId: string; onOpen: (gameId: string) => void }) {
  const feed = useReadModel(() => core.gameFeed(athleteId), [core, athleteId]);
  const [chosen, setChosen] = useState<Season['sport']>();
  if (!feed) return null;
  const seasons = SPORT_ORDER.flatMap((sport) => feed.seasons.filter((season) => season.sport === sport));
  const season = seasons.find((s) => s.sport === chosen);
  const games = season ? feed.games.filter((game) => game.sport === season.sport) : feed.games;
  return (
    <main>
      <h1>Games</h1>
      <div className="chips">
        <button className="chip" aria-pressed={!season} onClick={() => setChosen(undefined)}>
          All
        </button>
        {seasons.map((s) => (
          <button key={s.sport} className="chip" aria-pressed={s.sport === season?.sport} onClick={() => setChosen(s.sport)}>
            {SPORT_LABELS[s.sport]}
          </button>
        ))}
      </div>
      {season && <SeasonTiles season={season} games={games.length} />}
      <FeedRows games={games} onOpen={onOpen} />
    </main>
  );
}

/** The Insights tab: Practice Focus cards from the Athlete's last 5 Games, each with its drill (GLOSSARY: Practice Focus). */
function InsightsTab({ core, athleteId }: { core: AppCore; athleteId: string }) {
  const cards = useReadModel(() => core.practiceFocus(athleteId), [core, athleteId]);
  if (!cards) return null;
  return (
    <main>
      <h1>Insights</h1>
      {cards.length === 0 && <p>Nothing stands out in the last 5 Games.</p>}
      {cards.map((card) => (
        <section className="card" key={card.drill}>
          <h2>{card.title}</h2>
          <p>{card.drill}</p>
        </section>
      ))}
    </main>
  );
}

/** The Team's label: the Athlete's name, cut with "…" if it does not fit, then the text after it, which is never cut. */
function ScoreLabel({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="score-label">
      <span className="score-name">{name}</span> <span>{children}</span>
    </span>
  );
}

/** A finished Game's summary, a result card: its badge and Final Score, the Opponent, date and the Athlete's line; basketball adds Plus/Minus, Playing Share and the tiles. */
function GameSummary({ core, gameId, onBack, onEdit, onRemoved }: { core: AppCore; gameId: string; onBack: () => void; onEdit: () => void; onRemoved: () => void }) {
  const game = useReadModel(() => core.gameSummary(gameId), [core, gameId]);
  // only a Backlogged Game its Recorder entered has an entry to edit, or to remove (ADR 0005, ADR 0006)
  const backlog = useReadModel(() => core.backlogEntry(gameId), [core, gameId]);
  // Remove asks first, and the confirm step says only what leaves the app: the Game is hidden, not erased (ADR 0006)
  const [confirming, setConfirming] = useState(false);
  if (!game) return null;
  const { letter, name } = resultOf(game.final);
  return (
    <main>
      <button onClick={onBack}>Back</button>
      <section className="card">
        <div className="result-head">
          <span className="badge" role="img" aria-label={name}>
            {letter}
          </span>
          <p className="final">
            <ScoreLabel name={game.athleteName}>
              {game.final.team} – Opponent {game.final.opponent}
            </ScoreLabel>
          </p>
        </div>
        <h1>{game.opponent}</h1>
        <p>{game.gameDate}</p>
        <p>{gameLineText(game)}</p>
        {game.sport === 'basketball' && (
          <>
            <p>
              Plus/Minus {game.backlogged ? '—' : signed(game.line.plusMinus)} · Playing Share{' '}
              {game.backlogged ? '—' : `${Math.round(game.playingShare * 100)}%`}
            </p>
            <p>{(['steal', 'block', 'turnover', 'foul'] as const).map((type) => `${TILE_LABELS[type]} ${game.tiles[type]}`).join(' · ')}</p>
          </>
        )}
      </section>
      {backlog && <button onClick={onEdit}>Edit</button>}
      {backlog && !confirming && <button onClick={() => setConfirming(true)}>Remove</button>}
      {backlog && confirming && (
        <section className="card">
          <p>Remove this Game? It leaves the Games feed and the season line.</p>
          <button
            onClick={async () => {
              await core.removeBacklog(gameId);
              onRemoved();
            }}
          >
            Yes, remove
          </button>
          <button onClick={() => setConfirming(false)}>Cancel</button>
        </section>
      )}
    </main>
  );
}

/** A count field's key in the form's text and its visible label. The scores come first in every form. */
type CountField = [key: string, label: string];
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

/** Every Game count as the form's text, a 0 included, so an Edit prefills and saves the same numbers. */
function textOf(totals: GameTotals): Record<string, string> {
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

/** The Totals the form's text holds. Blank is 0 (Number('') is 0); only digits reach here, see BacklogFields. */
function totalsOf(sport: BacklogEntry['sport'], text: Record<string, string>): GameTotals {
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

/** Add past Game (no gameId) or Edit past Game: a Backlogged Game, entered from its Totals (ADR 0005). Loads its prefill before the fields, as GameSetupForm does. */
function BacklogForm({
  core,
  athleteId,
  athleteName,
  gameId,
  onDone,
}: {
  core: AppCore;
  athleteId: string;
  athleteName: string;
  gameId?: string;
  onDone: (savedGameId?: string) => void;
}) {
  const setup = useReadModel(() => core.gameSetup(athleteId), [core, athleteId]);
  const entry = useReadModel(() => (gameId ? core.backlogEntry(gameId) : Promise.resolve(undefined)), [core, gameId]);
  if (!setup || (gameId && !entry)) return null;
  return <BacklogFields core={core} athleteId={athleteId} athleteName={athleteName} gameId={gameId} setup={setup} entry={entry} onDone={onDone} />;
}

/** The fields hold what the Recorder types from the first render on; the prefill only seeds them. */
function BacklogFields({
  core,
  athleteId,
  athleteName,
  gameId,
  setup,
  entry,
  onDone,
}: {
  core: AppCore;
  athleteId: string;
  athleteName: string;
  gameId?: string;
  setup: GameSetup;
  entry?: BacklogEntry;
  onDone: (savedGameId?: string) => void;
}) {
  const [sport, setSport] = useState<GameFormat['sport']>(entry?.sport ?? setup.sport);
  const [opponent, setOpponent] = useState(entry?.opponentName ?? '');
  const [gameDate, setGameDate] = useState(entry?.gameDate ?? '');
  // by key, so a sport's typed counts stay put when the sport changes: the keys do not overlap
  const [text, setText] = useState<Record<string, string>>(() => (entry ? textOf(entry.totals) : {}));
  // a second tap before the save lands would write a second Game
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const typed = (key: string) => text[key] ?? '';
  const fields: CountField[] = [
    ['teamScore', `${athleteName} score`],
    ['opponentScore', 'Opponent score'],
    ...(sport === 'basketball' ? BASKETBALL_FIELDS : BATTING_FIELDS),
  ];
  // a count is a whole number or the form says which one is not: no coercion, no rounding
  const notWhole = fields.find(([key]) => !/^\s*\d*\s*$/.test(typed(key)));
  const ready = opponent.trim() !== '' && gameDate !== '' && typed('teamScore').trim() !== '' && typed('opponentScore').trim() !== '';
  const draft = ready && !notWhole ? { sport, opponentName: opponent.trim(), gameDate, totals: totalsOf(sport, text) } : undefined;
  const problem = notWhole ? `${notWhole[1]} must be a whole number.` : draft && backlogProblem(draft, setup.gameDate);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || problem || saving) return;
    setSaving(true);
    try {
      if (gameId) {
        await core.editBacklog(gameId, draft);
        onDone();
      } else {
        onDone(await core.backlogGame({ athleteId, ...draft }));
      }
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };
  return (
    <main>
      <h1>{gameId ? 'Edit past Game' : 'Add past Game'}</h1>
      <form onSubmit={submit}>
        <label>
          Sport
          <select value={sport} disabled={gameId !== undefined} onChange={(e) => setSport(e.target.value as GameFormat['sport'])}>
            <option value="basketball">Basketball</option>
            <option value="softball">Softball</option>
            <option value="baseball">Baseball</option>
          </select>
        </label>
        <label>
          Opponent
          <input value={opponent} onChange={(e) => setOpponent(e.target.value)} required autoComplete="off" />
        </label>
        <label>
          Date
          <input type="date" value={gameDate} max={setup.gameDate} onChange={(e) => setGameDate(e.target.value)} required />
        </label>
        <div className="counts">
          {fields.map(([key, label]) => (
            <label key={key}>
              {key === 'teamScore' ? <ScoreLabel name={athleteName}>score</ScoreLabel> : label}
              <input
                value={typed(key)}
                onChange={(e) => setText((current) => ({ ...current, [key]: e.target.value }))}
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
          ))}
        </div>
        {/* above the buttons, as AthleteForm places it: the alert sits directly above Save, where a Recorder reaching Save reads it */}
        {problem && <p role="alert">{problem}</p>}
        {failed && <p role="alert">{NOT_SAVED}</p>}
        <button className="primary" disabled={!draft || problem !== undefined || saving}>
          Save
        </button>
        <button type="button" onClick={() => onDone()}>
          Cancel
        </button>
      </form>
    </main>
  );
}

/** Settings: Button Size, the phone setting the live screen reads (GLOSSARY: Button Size). */
function SettingsScreen({ core, onDone }: { core: AppCore; onDone: () => void }) {
  const size = useReadModel(() => core.buttonSize(), [core]);
  const [deleting, setDeleting] = useState(false);
  const field = useReadModel(() => core.fieldMode(), [core]);
  // a setting the store refused: the alert shows until a setting lands
  const [failed, setFailed] = useState(false);
  if (deleting) return <DeleteAccount core={core} onCancel={() => setDeleting(false)} />;
  if (!size || field === undefined) return null;
  return (
    <main>
      <section className="card">
        <h1>Settings</h1>
        <div className="sizes" role="group" aria-label="Button Size">
          {BUTTON_SIZES.map((option) => (
            <button
              key={option}
              aria-pressed={option === size}
              className={option === size ? 'primary' : undefined}
              onClick={() => void core.setButtonSize(option).then(() => setFailed(false), () => setFailed(true))}
            >
              {SIZE_LABELS[option]}
            </button>
          ))}
        </div>
        <button
          aria-pressed={field}
          className={field ? 'primary' : undefined}
          onClick={() => void core.setFieldMode(!field).then(() => setFailed(false), () => setFailed(true))}
        >
          Field mode
        </button>
        {failed && <p role="alert">{NOT_SAVED}</p>}
      </section>
      <button onClick={() => setDeleting(true)}>Delete my account and all data</button>
      <button className="primary" onClick={onDone}>
        Done
      </button>
    </main>
  );
}

/** What deleting does to one Athlete, in the words the Recorder reads before it confirms (ADR 0004). */
function fateLine(athlete: AthleteFate): string {
  if (athlete.fate === 'passes') return `${athlete.name}: passes to ${athlete.to}, with its Games and Events.`;
  if (athlete.fate === 'deleted') {
    return `${athlete.name}: deleted with ${athlete.games} ${athlete.games === 1 ? 'Game' : 'Games'} and their Events.`;
  }
  return `${athlete.name}: you leave it; the Games you recorded stay with it.`;
}

/** Names what happens to each Athlete, then deletes: the account on the server, and everything on this phone. */
function DeleteAccount({ core, onCancel }: { core: AppCore; onCancel: () => void }) {
  const [summary, setSummary] = useState<DeletionSummary>();
  const [unreadable, setUnreadable] = useState(false);
  const sync = useReadModel(() => core.sync(), [core]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  // a passing Athlete's Member comes from the server, so the list waits for it and says so when it cannot load
  useEffect(() => {
    core.deletionSummary().then(setSummary, () => setUnreadable(true));
  }, [core]);
  if (unreadable) {
    return (
      <main>
        <h1>Delete my account and all data</h1>
        <p role="alert">Could not load what deleting removes. Check the connection and try again.</p>
        <button onClick={onCancel}>Cancel</button>
      </main>
    );
  }
  if (!summary || !sync) return null;
  const remove = async () => {
    setDeleting(true);
    setError(undefined);
    try {
      // on success the phone has no Athlete, so App shows first run and this screen goes
      await core.deleteAccount();
    } catch {
      setError('Could not delete. Check the connection and try again.');
      setDeleting(false);
    }
  };
  return (
    <main>
      <section className="card">
        <h1>Delete my account and all data</h1>
        <p>
          {sync.signedIn ? 'This deletes your account from the server and clears this phone.' : 'This clears this phone.'} It cannot be
          undone.
        </p>
        <ul>
          {summary.athletes.length === 0 && <li>Athletes: none</li>}
          {summary.athletes.map((athlete, i) => (
            <li key={i}>{fateLine(athlete)}</li>
          ))}
          <li>Photos on this phone: {summary.photos}</li>
          <li>Not yet synced: {summary.unsynced}</li>
        </ul>
      </section>
      <button className="primary" disabled={deleting} onClick={() => void remove()}>
        Delete everything
      </button>
      <button disabled={deleting} onClick={onCancel}>
        Cancel
      </button>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

/** One side of the Team–Opponent strip: its label, a − count + row. */
function ScoreSide({ label, value, onAdjust }: { label: string; value: number; onAdjust: (delta: 1 | -1) => void }) {
  return (
    <div className="side" role="group" aria-label={label}>
      <span className="score-name">{label}</span>
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
  athleteName,
  score,
  onEnded,
  onCancel,
  onFailed,
}: {
  core: AppCore;
  gameId: string;
  athleteName: string;
  score: Scores;
  onEnded: () => void;
  onCancel: () => void;
  onFailed: () => void;
}) {
  const [team, setTeam] = useState(String(score.team));
  const [opponent, setOpponent] = useState(String(score.opponent));
  const valid = /^\d+$/.test(team) && /^\d+$/.test(opponent);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    // leaves the Game on screen before the store closes it, so Home does not flash in between
    onEnded();
    // a refused End Game leaves the Game live, and the live screen says so
    void core.endGame(gameId, { teamScore: Number(team), opponentScore: Number(opponent) }).catch(onFailed);
  };
  return (
    <form onSubmit={submit}>
      <h2>Finish game?</h2>
      <label>
        <ScoreLabel name={athleteName}>final</ScoreLabel>
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
        Keep playing
      </button>
    </form>
  );
}

/** Game Complete, shown once End Game closes the Game: a result card (trophy, Final, the W/L/T badge and Final Score, the Athlete's line, Plus/Minus), then Share card and Copy text below it. */
function GameComplete({ core, gameId }: { core: AppCore; gameId: string }) {
  const game = useReadModel(() => core.gameSummary(gameId), [core, gameId]);
  // the text is read before the tap, so the click reaches the clipboard with no await in between (iOS drops the gesture across one)
  const text = useReadModel(() => core.gameCopyText(gameId), [core, gameId]);
  // the outcome shows for 2 seconds in place, no modal; a new object per tap restarts the timer
  const [copied, setCopied] = useState<{ label: string }>();
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(undefined), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  // the card is drawn as the sheet opens, so a tap on Share card reaches the share sheet with no await in between (iOS drops the gesture across one)
  const card = useReadModel(() => core.gameCard(gameId), [core, gameId]);
  const [image, setImage] = useState<File>();
  const [drawFailed, setDrawFailed] = useState(false);
  useEffect(() => {
    if (!card) return;
    // a card that re-emits aborts the render it supersedes; that abort is not a failure
    const controller = new AbortController();
    setImage(undefined);
    setDrawFailed(false);
    renderShareCard(card, controller.signal).then(
      (png) => setImage(new File([png], 'statelite-final.png', { type: 'image/png' })),
      (error: Error) => {
        if (error.name === 'AbortError') return;
        console.error(error);
        setDrawFailed(true);
      },
    );
    return () => controller.abort();
  }, [card]);
  if (!game) return null;
  // the phone cannot share files: the image downloads instead
  const download = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const shareCard = () => {
    if (!image) return;
    if (navigator.canShare?.({ files: [image] })) {
      // a cancelled share is not an error; any other refusal downloads the image
      void navigator.share({ files: [image] }).catch((error: Error) => {
        if (error.name !== 'AbortError') download(image);
      });
      return;
    }
    download(image);
  };
  const copy = () => {
    if (text === undefined) return;
    // a missing clipboard API lands on the same Copy failed label as a refused write
    const written = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'));
    written.then(
      () => setCopied({ label: 'Copied' }),
      () => setCopied({ label: 'Copy failed' }),
    );
  };
  const { letter, name } = resultOf(game.final);
  return (
    <>
      <section className="card" aria-label="Game Complete">
        <div className="result-head">
          <svg
            className="trophy"
            viewBox="0 0 24 24"
            width="28"
            height="28"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
          </svg>
          <h1>Final</h1>
        </div>
        <div className="result-head">
          <span className="badge result-badge" role="img" aria-label={name}>
            {letter}
          </span>
          <p className="final">
            <ScoreLabel name={game.athleteName}>
              {game.final.team} – Opponent {game.final.opponent}
            </ScoreLabel>
          </p>
        </div>
        <p>{gameLineText(game)}</p>
        {game.sport === 'basketball' && <p>Plus/Minus {signed(game.line.plusMinus)}</p>}
      </section>
      <button className="primary" disabled={image === undefined} onClick={shareCard}>
        Share card
      </button>
      {drawFailed && <p role="status">Share card could not be drawn</p>}
      <button disabled={text === undefined} onClick={copy}>
        Copy text
      </button>
      <p role="status">{copied?.label}</p>
    </>
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
  attempt,
}: {
  core: AppCore;
  gameId: string;
  shots: LiveGame['shots'];
  points: number;
  onRecorded: (label: string) => void;
  attempt: (write: Promise<unknown>, onSaved: () => void, onRefused?: () => void) => void;
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
  // the spot clears at the tap and comes back if the store refuses the Shot, so a retry records the same spot
  const record = (made: boolean) => {
    if (!pending) return;
    const spot = pending;
    setPending(undefined);
    attempt(
      core.recordShot(gameId, { x: spot.x, y: spot.y, value: spot.value, made }),
      () => onRecorded(shotLabel(spot.value, made)),
      () => setPending((current) => current ?? spot),
    );
  };
  return (
    <div className="shot-entry">
      <svg
        className="court"
        viewBox={`0 0 ${widthFt} ${lengthFt}`}
        style={{ aspectRatio: `${widthFt} / ${lengthFt}` }}
        role="img"
        aria-label="Half court"
        onClick={place}
      >
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

/** The Athlete-only diamond: a dot on the base they hold (plan: softball and baseball live screen). */
function Diamond({ onBase }: { onBase: Base }) {
  const dot: Record<Base, [number, number]> = { first: [70, 40], second: [40, 10], third: [10, 40] };
  return (
    <svg className="diamond" viewBox="0 0 80 80" width="88" height="88" role="img" aria-label={`On ${onBase}`}>
      <polygon points="40,70 70,40 40,10 10,40" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx={dot[onBase][0]} cy={dot[onBase][1]} r="7" fill="currentColor" />
    </svg>
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
  const field = useReadModel(() => core.fieldMode(), [core]) ?? false;
  // the toast for the last tap, shown 3 seconds; each call sets a new object, so a repeated label still restarts the timer
  const [toast, setToast] = useState<{ label: string }>();
  // a write the store refused: the alert shows until the next write lands
  const [notSaved, setNotSaved] = useState(false);
  const [ending, setEnding] = useState(false);
  // the Outcome picked on softball or baseball, waiting for its RBI chip
  const [pending, setPending] = useState<Outcome>();
  // the Stole option: on while the next base move is a steal
  const [stealing, setStealing] = useState(false);
  // bumped on each Sub, so the strip restarts its pulse
  const [pulse, setPulse] = useState(0);
  // the Game line opens into the closed Shifts list; closed by default
  const [shiftsOpen, setShiftsOpen] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  // the tile tapped last, flashed for 700 ms; each tap sets a new object, so a repeated tap restarts the flash
  const [flash, setFlash] = useState<{ type: TileEventType }>();
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(undefined), 700);
    return () => clearTimeout(timer);
  }, [flash]);
  if (!game) return null;
  if (game.final) {
    return (
      <main>
        <GameComplete core={core} gameId={gameId} />
        <SaveGame core={core} />
        <button onClick={onDone}>
          Done
        </button>
      </main>
    );
  }
  // a write that lands clears the alert and runs onSaved; one the store refuses shows the alert, runs onRefused to put back what the tap cleared, and leaves the screen as it was
  const attempt = (write: Promise<unknown>, onSaved: () => void, onRefused?: () => void) =>
    write.then(() => {
      setNotSaved(false);
      onSaved();
    }, () => {
      setNotSaved(true);
      onRefused?.();
    });
  const tap = (type: TileEventType) =>
    attempt(core.recordTile(gameId, type), () => {
      setToast({ label: TILE_LABELS[type] });
      setFlash({ type });
    });
  const tapFreeThrow = (made: boolean) => attempt(core.recordFreeThrow(gameId, made), () => setToast({ label: freeThrowLabel(made) }));
  const tapPitch = (pitch: Pitch) => attempt(core.recordPitch(gameId, pitch), () => setToast({ label: PITCH_LABELS[pitch] }));
  // the armed Outcome clears at the tap and comes back if the store refuses it
  const pick = (rbi: number) => {
    if (!pending) return;
    const outcome = pending;
    setPending(undefined);
    void attempt(
      core.recordPlateAppearance(gameId, { outcome, rbi }),
      () => setToast({ label: outcomeLabel(outcome, game.count?.strikeout) }),
      () => setPending((current) => current ?? outcome),
    );
  };
  // Stole clears at the tap and comes back if the store refuses the move
  const tapBase = (base: BaseMove) => {
    const stolen = stealing;
    setStealing(false);
    void attempt(
      core.recordBaserunning(gameId, { base, stolen }),
      () => setToast({ label: baseLabel(base, stolen) }),
      () => setStealing(stolen),
    );
  };
  const adjust = (side: 'team' | 'opponent', delta: 1 | -1) => {
    void attempt(core.adjustScore(gameId, side, delta), () => setToast({ label: EVENT_LABELS.score }));
  };
  const undo = () => {
    void attempt(core.undo(gameId), () => {
      setToast(undefined);
      setPending(undefined);
    });
  };
  // the toast and the pulse wait for the write, so a refused Sub shows neither
  const sub = () => {
    const label = game.onCourt ? EVENT_LABELS.sub_out : EVENT_LABELS.sub_in;
    void attempt(core.toggleSub(gameId), () => {
      setToast({ label });
      setPulse((n) => n + 1);
    });
  };
  const nextPeriod = () => {
    void attempt(core.nextPeriod(gameId), () => {
      setToast({ label: EVENT_LABELS.period_start });
      setPending(undefined);
    });
  };
  // the Shift on court, if any: its timer and Plus/Minus so far
  const current = game.onCourt ? game.shifts.at(-1) : undefined;
  // the closed Shifts, for the Game line's list; the Shift on court is on the timer line
  const closed = game.onCourt ? game.shifts.slice(0, -1) : game.shifts;
  const shots = (
    <>
      <ShotEntry
        core={core}
        gameId={gameId}
        shots={game.shots}
        points={game.points}
        onRecorded={(label) => setToast({ label })}
        attempt={attempt}
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
        <button key={type} className={flash?.type === type ? 'tile flash' : 'tile'} onClick={() => void tap(type)}>
          {TILE_LABELS[type]} <span className="count">{game.tiles[type]}</span>
        </button>
      ))}
    </div>
  );
  // softball and baseball: one tap on an Outcome, then its RBI chip records the Plate Appearance
  const plateAppearance = (
    <section className="plate-appearance" aria-label="Plate Appearance">
      {/* optional: the count shows only once a Pitch is logged in this Plate Appearance */}
      <div className="pitches" role="group" aria-label="Pitch">
        {PITCHES.map((pitch) => (
          <button key={pitch} onClick={() => void tapPitch(pitch)}>
            {PITCH_LABELS[pitch]}
          </button>
        ))}
      </div>
      {game.count && (
        <p className="pitch-count">
          Count {game.count.balls}-{game.count.strikes}
        </p>
      )}
      <div className="outcomes" role="group" aria-label="Outcome">
        {OUTCOMES.map((outcome) => (
          <button
            key={outcome}
            aria-pressed={pending === outcome}
            className={pending === outcome ? 'primary' : undefined}
            onClick={() => setPending(outcome)}
          >
            {OUTCOME_LABELS[outcome]}
          </button>
        ))}
      </div>
      {pending && (
        <div className="rbi" role="group" aria-label="RBI">
          {[0, 1, 2, 3, 4].map((rbi) => (
            <button key={rbi} onClick={() => void pick(rbi)}>
              {rbi} RBI
            </button>
          ))}
          <button onClick={() => setPending(undefined)}>Cancel</button>
        </div>
      )}
      {game.onBase && (
        <div className="base-moves" role="group" aria-label="Base">
          <Diamond onBase={game.onBase} />
          <button className={stealing ? 'primary' : undefined} aria-pressed={stealing} onClick={() => setStealing(!stealing)}>
            Stole
          </button>
          {movesFrom(game.onBase).map((base) => (
            <button key={base} onClick={() => void tapBase(base)}>
              {BASE_LABELS[base]}
            </button>
          ))}
        </div>
      )}
      <dl className="batting">
        {[
          ['AVG', rateText(game.batting.avg)],
          ['OBP', rateText(game.batting.obp)],
          ['SLG', rateText(game.batting.slg)],
        ].map(([stat, value]) => (
          <div key={stat} className="batting-card" role="group" aria-label={stat}>
            <dt>{stat}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  return (
    <main className={`live ${size}`}>
      {game.sport === 'basketball' && (
        <section className="shift" aria-label="Shift">
          <button className={game.onCourt ? 'primary' : undefined} onClick={sub}>
            {game.onCourt ? 'Sub Out' : 'Sub In'}
          </button>
          <div>
            <div className="game-line">
              <button
                className="game"
                aria-expanded={shiftsOpen}
                aria-controls={shiftsOpen ? 'shift-list' : undefined}
                onClick={() => setShiftsOpen(!shiftsOpen)}
              >
                <span className="timer">{current ? `On court ${clockOf(current.ms)} · ${signed(current.plusMinus)}` : 'On bench'}</span>
                <span>
                  {shiftsOpen
                    ? 'Shifts'
                    : `${Math.round(game.playingShare * 100)}% · ${game.shifts.length} ${game.shifts.length === 1 ? 'Shift' : 'Shifts'} · Plus/Minus ${signed(game.plusMinus)}`}
                </span>
              </button>
              {shiftsOpen && (
                <ol id="shift-list" aria-label="Shifts" className="shift-list">
                  {closed.map((shift, i) => (
                    <li key={i}>{`Shift ${i + 1} · ${clockOf(shift.ms)} · ${signed(shift.plusMinus)}`}</li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
      )}
      <section key={pulse} className={pulse ? 'strip pulse' : 'strip'} aria-label="Score">
        <ScoreSide label={game.athleteName} value={game.score.team} onAdjust={(delta) => adjust('team', delta)} />
        <ScoreSide label="Opponent" value={game.score.opponent} onAdjust={(delta) => adjust('opponent', delta)} />
      </section>
      {/* on screen right under the score, not below the Period row the Recorder may not see */}
      {notSaved && <p role="alert">{NOT_SAVED}</p>}
      {game.sport !== 'basketball' ? (
        plateAppearance
      ) : size === 'bleacher' ? (
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
      {/* the Period sits on the End Game row, so the live screen keeps its height at every Button Size */}
      <div className="period-row">
        {game.periodLabel && (
          <>
            <span className="period">{game.periodLabel}</span>
            <button onClick={nextPeriod}>Next period</button>
          </>
        )}
        {!ending && <button onClick={() => setEnding(true)}>End Game</button>}
        <button
          aria-label="Field mode"
          aria-pressed={field}
          className={field ? 'primary sun' : 'sun'}
          onClick={() => void attempt(core.setFieldMode(!field), () => undefined)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
      </div>
      {ending && (
        <EndGameForm
          core={core}
          gameId={gameId}
          athleteName={game.athleteName}
          score={game.score}
          onCancel={() => setEnding(false)}
          onEnded={() => {
            setEnding(false);
            onEnded(gameId);
          }}
          onFailed={() => setNotSaved(true)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <span aria-hidden="true">✓</span> {toast.label}
          </span>
          <button onClick={undo}>Undo</button>
        </div>
      )}
    </main>
  );
}
