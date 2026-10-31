import { liveQuery } from 'dexie';
import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import {
  BUTTON_SIZES,
  HALF_COURT,
  arcPreset,
  battingText,
  gameLineText,
  lineText,
  movesFrom,
  signed,
  type AppCore,
  type Base,
  type ButtonSize,
  type GameFormat,
  type GameSetup,
  type FeedGame,
  type Home,
  type LiveGame,
  type Member,
  type Scores,
  type Season,
  type StrikeKind,
  type TileEventType,
  type UndoableType,
} from './core/appCore';
import { InviteRefused } from './core/server';
import { renderShareCard } from './core/shareCard';
import { OUTCOMES, PITCHES, type BaseMove, type Outcome, type Pitch } from './core/store';
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (athlete) void core.editAthlete({ id: athlete.id, name: name.trim(), jerseyNumber: number, photo });
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
        <label>
          Photo (optional)
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0])} />
        </label>
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
  const [tab, setTab] = useState<Tab>('home');
  // the finished Game whose summary is open, from either tab
  const [summary, setSummary] = useState<string>();
  // a Member records Games on the Athlete too; Edit stays the Owner's
  const owner = useReadModel(() => core.isOwner(athlete.id), [core, athlete.id]);
  if (form === 'setup') {
    return <GameSetupForm core={core} athleteId={athlete.id} onCancel={() => setForm(undefined)} />;
  }
  if (form === 'settings') return <SettingsScreen core={core} onDone={() => setForm(undefined)} />;
  if (form) {
    return <AthleteForm core={core} athlete={form === 'edit' ? athlete : undefined} onDone={() => setForm(undefined)} />;
  }
  if (summary) return <GameSummary core={core} gameId={summary} onBack={() => setSummary(undefined)} />;
  if (tab === 'games') {
    return (
      <>
        <GamesTab core={core} athleteId={athlete.id} onOpen={setSummary} />
        <TabBar tab={tab} onTab={setTab} />
      </>
    );
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
              {initials(athlete.name)}
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
        <Members core={core} athleteId={athlete.id} />
        <SeasonAndRecent core={core} athleteId={athlete.id} onOpen={setSummary} />
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

type Tab = 'home' | 'games';

/** The bottom tabs: Home and Games (plan: navigation). */
function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <nav className="tabs" aria-label="Tabs">
      <button aria-pressed={tab === 'home'} onClick={() => onTab('home')}>
        Home
      </button>
      <button aria-pressed={tab === 'games'} onClick={() => onTab('games')}>
        Games
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
              <button key={game.id} className="feed-row" onClick={() => onOpen(game.id)}>
                <span className="opponent">{game.opponent}</span>
                <span>
                  {game.final.team}–{game.final.opponent}
                </span>
                <span className="line">{gameLineText(game)}</span>
                {game.sport === 'basketball' && <span>{signed(game.line.plusMinus)}</span>}
              </button>
            ))}
          </section>
        );
      })}
    </>
  );
}

/** One sport's season line: the basketball totals with Plus/Minus, or the batting line with its rates. */
function SeasonLine({ season }: { season: Season }) {
  const text =
    season.sport === 'basketball'
      ? `${lineText(season.line)} · Plus/Minus ${signed(season.line.plusMinus)}`
      : `${battingText(season.batting)} · AVG ${rateText(season.batting.avg)} · OBP ${rateText(season.batting.obp)} · SLG ${rateText(season.batting.slg)}`;
  return (
    <p className="season">
      Season ({season.sport}): {text}
    </p>
  );
}

/** Home's season lines, one per sport played, and the Athlete's three most recent finished Games. */
function SeasonAndRecent({ core, athleteId, onOpen }: { core: AppCore; athleteId: string; onOpen: (gameId: string) => void }) {
  const feed = useReadModel(() => core.gameFeed(athleteId), [core, athleteId]);
  if (!feed) return null;
  return (
    <section aria-label="Season">
      {feed.seasons.map((season) => (
        <SeasonLine key={season.sport} season={season} />
      ))}
      <FeedRows games={feed.games.slice(0, 3)} onOpen={onOpen} />
    </section>
  );
}

/** The Games tab: every finished Game of the Athlete, grouped by date. */
function GamesTab({ core, athleteId, onOpen }: { core: AppCore; athleteId: string; onOpen: (gameId: string) => void }) {
  const feed = useReadModel(() => core.gameFeed(athleteId), [core, athleteId]);
  if (!feed) return null;
  return (
    <main>
      <h1>Games</h1>
      <FeedRows games={feed.games} onOpen={onOpen} />
    </main>
  );
}

/** A finished Game's summary: its Final Score and the Athlete's line; basketball adds Plus/Minus, Playing Share and the tiles. */
function GameSummary({ core, gameId, onBack }: { core: AppCore; gameId: string; onBack: () => void }) {
  const game = useReadModel(() => core.gameSummary(gameId), [core, gameId]);
  if (!game) return null;
  return (
    <main>
      <button onClick={onBack}>Back</button>
      <h1>{game.opponent}</h1>
      <p>{game.gameDate}</p>
      <p className="final">
        Team {game.final.team} – Opponent {game.final.opponent}
      </p>
      <p>{gameLineText(game)}</p>
      {game.sport === 'basketball' && (
        <>
          <p>
            Plus/Minus {signed(game.line.plusMinus)} · Playing Share {Math.round(game.playingShare * 100)}%
          </p>
          <p>{(['steal', 'block', 'turnover', 'foul'] as const).map((type) => `${TILE_LABELS[type]} ${game.tiles[type]}`).join(' · ')}</p>
        </>
      )}
    </main>
  );
}

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

/** Game Complete, shown once End Game closes the Game: the Final Score, the Athlete's line and Plus/Minus, and Copy text. */
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
  return (
    <section aria-label="Game Complete">
      <h1>Final</h1>
      <p className="final">
        Team {game.final.team} – Opponent {game.final.opponent}
      </p>
      <p>{gameLineText(game)}</p>
      {game.sport === 'basketball' && <p>Plus/Minus {signed(game.line.plusMinus)}</p>}
      <button disabled={image === undefined} onClick={shareCard}>
        Share card
      </button>
      {drawFailed && <p role="status">Share card could not be drawn</p>}
      <button disabled={text === undefined} onClick={copy}>
        Copy text
      </button>
      <p role="status">{copied?.label}</p>
    </section>
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
  // the toast for the last tap, shown 3 seconds; each call sets a new object, so a repeated label still restarts the timer
  const [toast, setToast] = useState<{ label: string }>();
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
  if (!game) return null;
  if (game.final) {
    return (
      <main>
        <GameComplete core={core} gameId={gameId} />
        <SaveGame core={core} />
        <button className="primary" onClick={onDone}>
          Done
        </button>
      </main>
    );
  }
  const tap = async (type: TileEventType) => {
    await core.recordTile(gameId, type);
    setToast({ label: TILE_LABELS[type] });
  };
  const tapFreeThrow = async (made: boolean) => {
    await core.recordFreeThrow(gameId, made);
    setToast({ label: freeThrowLabel(made) });
  };
  const tapPitch = async (pitch: Pitch) => {
    await core.recordPitch(gameId, pitch);
    setToast({ label: PITCH_LABELS[pitch] });
  };
  const pick = async (rbi: number) => {
    if (!pending) return;
    setPending(undefined);
    await core.recordPlateAppearance(gameId, { outcome: pending, rbi });
    setToast({ label: outcomeLabel(pending, game.count?.strikeout) });
  };
  const tapBase = async (base: BaseMove) => {
    const stolen = stealing;
    setStealing(false);
    await core.recordBaserunning(gameId, { base, stolen });
    setToast({ label: baseLabel(base, stolen) });
  };
  const adjust = (side: 'team' | 'opponent', delta: 1 | -1) => {
    setToast({ label: EVENT_LABELS.score });
    void core.adjustScore(gameId, side, delta);
  };
  const undo = () => {
    setToast(undefined);
    setPending(undefined);
    void core.undo(gameId);
  };
  const sub = () => {
    setToast({ label: game.onCourt ? EVENT_LABELS.sub_out : EVENT_LABELS.sub_in });
    setPulse((n) => n + 1);
    void core.toggleSub(gameId);
  };
  const nextPeriod = () => {
    setToast({ label: EVENT_LABELS.period_start });
    setPending(undefined);
    void core.nextPeriod(gameId);
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
      <p className="batting">
        AVG {rateText(game.batting.avg)} · OBP {rateText(game.batting.obp)} · SLG {rateText(game.batting.slg)}
      </p>
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
            <p className="timer">
              {current ? `On court ${clockOf(current.ms)} · ${signed(current.plusMinus)}` : 'On bench'}
            </p>
            <div className="game-line">
              <button
                className="game"
                aria-expanded={shiftsOpen}
                aria-controls={shiftsOpen ? 'shift-list' : undefined}
                onClick={() => setShiftsOpen(!shiftsOpen)}
              >
                {shiftsOpen
                  ? 'Shifts'
                  : `${Math.round(game.playingShare * 100)}% · ${game.shifts.length} ${game.shifts.length === 1 ? 'Shift' : 'Shifts'} · Plus/Minus ${signed(game.plusMinus)}`}
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
        <ScoreSide label="Team" value={game.score.team} onAdjust={(delta) => adjust('team', delta)} />
        <ScoreSide label="Opponent" value={game.score.opponent} onAdjust={(delta) => adjust('opponent', delta)} />
      </section>
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
      </div>
      {ending && (
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
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.label}</span>
          <button onClick={undo}>Undo</button>
        </div>
      )}
    </main>
  );
}
