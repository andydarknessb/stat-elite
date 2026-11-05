import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  BUTTON_SIZES,
  HALF_COURT,
  arcPreset,
  movesFrom,
  SCORE_MAX,
  SIGN_OUT_REFUSED,
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
  type DeletionSummary,
  type Member,
  type Scores,
  type Season,
  type TileEventType,
} from './core/appCore';
import { backlogProblem, countFields, notWhole, textOf, totalsOf, type CountField } from './core/totals';
import {
  BASE_LABELS,
  baseLabel,
  clockOf,
  EVENT_LABELS,
  fateLine,
  freeThrowLabel,
  gameLineText,
  initials,
  OUTCOME_LABELS,
  outcomeLabel,
  PITCH_LABELS,
  rateText,
  resultOf,
  shotLabel,
  signed,
  TILE_LABELS,
  undoLabel,
} from './core/words';
import { CodeTooSoon, InviteRefused } from './core/server';
import { renderShareCard } from './core/shareCard';
import { OUTCOMES, PITCHES, type BaseMove, type Outcome, type Pitch } from './core/store';
import { InstallPrompt } from './InstallPrompt';
import { SeamProvider, useCommand, useLive, type Run } from './screenSeam';

export function App({ core }: { core: AppCore }) {
  return (
    <SeamProvider core={core}>
      <Screens />
    </SeamProvider>
  );
}

function Screens() {
  const home = useLive((live) => live.home(), []);
  // where the Recorder starts: signed out, the first download, signed in, or the session ended (ADR 0007)
  const phone = useLive((live) => live.phoneAccount(), []);
  // the Game the Recorder just ended stays on screen, showing its Final Score, until Done
  const [ended, setEnded] = useState<string>();
  // an Invite link opens its own screen until the invitee is done with it
  const [invite, setInvite] = useState(() => new URLSearchParams(location.search).get('invite') ?? undefined);
  // Field mode marks the root, and theme.css gives it the light tokens over the dark default
  const fieldMode = useLive((live) => live.fieldMode(), [], { optional: true });
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
    return <InviteScreen token={invite} onDone={done} />;
  }
  if (!home || !phone) return null;
  const gameId = home.liveGameId ?? ended;
  // a Game on screen, Game Complete included, holds the sign-in screen off until Done
  if (!gameId && phone.state === 'signed-out') return <SignInScreen />;
  if (!gameId && (phone.state === 'first-download' || (phone.state === 'session-ended' && phone.firstDownload))) return <FirstDownload />;
  return (
    <>
      <RemovedAthletes />
      <NotSynced />
      {!home.athlete ? (
        <FirstRun />
      ) : !gameId ? (
        <HomeScreen athlete={home.athlete} next={home.next} />
      ) : (
        <LiveGame gameId={gameId} onEnded={setEnded} onDone={() => setEnded(undefined)} />
      )}
    </>
  );
}

/** An Invite link. Signed out, the invitee signs in with the same form as the first screen, the Invite's token held here while the code is typed; signed in, accepting it makes them a Member. */
function InviteScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const phone = useLive((live) => live.phoneAccount(), []);
  const { run } = useCommand();
  const [athleteName, setAthleteName] = useState<string>();
  const [error, setError] = useState<unknown>();
  // bumped by Retry, so the accept runs again with the link kept
  const [attempt, setAttempt] = useState(0);
  // a phone whose session ended is not signed in until its remembered address signs in again (ADR 0007)
  const signedIn = phone?.state === 'signed-in' || phone?.state === 'first-download';
  useEffect(() => {
    if (!signedIn) return;
    run((core) => core.acceptInvite(token), {
      onDone: setAthleteName,
      onRefused: (refused) => setError(refused),
    });
  }, [token, signedIn, attempt]);
  if (!phone) return null;
  if (!signedIn) {
    return (
      <main>
        <h1>Join an Athlete</h1>
        <p>Sign in with your email to become a Member.</p>
        <SignInForm remembered={phone.state === 'signed-out' ? undefined : phone.email} />
      </main>
    );
  }
  if (athleteName) {
    return (
      <main>
        <h1>You&apos;re a Member of {athleteName}</h1>
        <p>The Athlete and its Games are on this phone.</p>
        <button className="primary" onClick={onDone}>Continue</button>
      </main>
    );
  }
  if (error) {
    // a failure that is not a refusal keeps the link: Retry tries again, and Continue drops it beside it
    const refused = error instanceof InviteRefused;
    return (
      <main>
        <p role="alert">{refusalMessage(error)}</p>
        {!refused && (
          <button className="primary" onClick={() => { setError(undefined); setAttempt((n) => n + 1); }}>Retry</button>
        )}
        <button className={refused ? 'primary' : undefined} onClick={onDone}>Continue</button>
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

/** Home's notice when the server ended this phone's session: recording still works, and the remembered address's code syncs it again (ADR 0007). */
function SignInAgain() {
  const phone = useLive((live) => live.phoneAccount(), [], { optional: true });
  if (phone?.state !== 'session-ended') return null;
  return (
    <section className="card" aria-label="Sign in again">
      <h2>Sign in again to sync</h2>
      <p>Recording still works on this phone.</p>
      <SignInForm remembered={phone.email} />
    </section>
  );
}

/** Home's notice while the server refuses a row: the row stays on this phone, and the next upload that lands clears it (#208). */
function RefusedRow() {
  const sync = useLive((live) => live.sync(), [], { optional: true });
  if (!sync?.refused) return null;
  return (
    <section className="card">
      <p>Some Games can&apos;t upload right now. They&apos;re safe on this phone.</p>
    </section>
  );
}

/** Invite co-parent, for the Owner of a signed-in Athlete: makes an Invite, then offers its link to the share sheet (ADR 0004). */
function InviteCoParent({ athleteId, name }: { athleteId: string; name: string }) {
  const canInvite = useLive((live) => live.canInvite(athleteId), [athleteId], { optional: true });
  const [link, setLink] = useState<string>();
  const { run, alert } = useCommand();
  if (!canInvite) return null;
  const makeInvite = () =>
    run((core) => core.createInvite(athleteId), {
      onDone: (token) => setLink(`${location.origin}/?invite=${token}`),
      message: 'Could not make an invite. Check the connection and try again.',
    });
  if (!link) {
    return (
      <>
        <button onClick={makeInvite}>Invite co-parent</button>
        {alert && <p role="alert">{alert}</p>}
      </>
    );
  }
  return (
    <>
      <p>Invite for {name}</p>
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

/** The Members of a shared Athlete: the Owner sees them and removes one; a Member leaves (ADR 0004). Leave and Remove ask first, on the confirm card the Game summary's Remove uses. */
function Members({ athleteId, name }: { athleteId: string; name: string }) {
  const canInvite = useLive((live) => live.canInvite(athleteId), [athleteId], { optional: true });
  const owner = useLive((live) => live.isOwner(athleteId), [athleteId], { optional: true });
  const [members, setMembers] = useState<Member[]>();
  // nothing leaves or is removed until the confirm card's button is tapped (#205)
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<Member>();
  const { run, alert, clear } = useCommand();
  const load = () =>
    run((core) => core.members(athleteId), {
      onDone: setMembers,
      message: 'Could not load the Members. Check the connection and try again.',
    });
  useEffect(() => {
    if (canInvite) load();
  }, [athleteId, canInvite]);
  if (owner === undefined) return null;
  if (!owner) {
    return (
      <>
        {!leaving && <button onClick={() => setLeaving(true)}>Leave</button>}
        {leaving && (
          <section className="card">
            <p>{`Leave ${name}? ${name}, its Games and this phone's photo leave this phone, and coming back takes a new Invite.`}</p>
            <button
              onClick={() => run((core) => core.leave(athleteId), { message: 'Could not leave. Wait for everything to sync, then try again.' })}
            >
              Yes, leave
            </button>
            <button onClick={() => { clear(); setLeaving(false); }}>Cancel</button>
          </section>
        )}
        {alert && <p role="alert">{alert}</p>}
      </>
    );
  }
  if (!canInvite) return null;
  const remove = (memberId: string) =>
    run((core) => core.removeMember(athleteId, memberId), {
      onDone: () => {
        setRemoving(undefined);
        load();
      },
      message: 'Could not remove. Check the connection and try again.',
    });
  return (
    <section>
      <h2>Members</h2>
      {members?.length === 0 && <p>No Members yet.</p>}
      <ul>
        {members?.map((member) => (
          <li key={member.member_id}>
            {member.label}{' '}
            <button onClick={() => { clear(); setRemoving(member); }}>Remove</button>
          </li>
        ))}
      </ul>
      {removing && (
        <section className="card">
          <p>{`Remove ${removing.label}? They lose ${name} at their next sync, and anything they haven't synced is lost.`}</p>
          <button onClick={() => void remove(removing.member_id)}>Yes, remove</button>
          <button onClick={() => { clear(); setRemoving(undefined); }}>Cancel</button>
        </section>
      )}
      {alert && <p role="alert">{alert}</p>}
    </section>
  );
}

/** A line per Athlete an Owner removed this account from, until its OK clears it: the root, so Home and first run both show it (ADR 0004). */
function RemovedAthletes() {
  const removed = useLive((live) => live.removedAthletes(), []);
  const { run, alert } = useCommand();
  if (!removed?.length) return null;
  return (
    <>
      {removed.map(({ id, name }) => (
        <section key={id}>
          <p role="alert">You&apos;re no longer a Member of {name}. Anything not synced is gone.</p>
          <button className="primary" onClick={() => run((core) => core.clearRemovedAthlete(id))}>
            OK
          </button>
        </section>
      ))}
      {alert && <p role="alert">{alert}</p>}
    </>
  );
}

/** The "N not synced" badge: the rows that still live only on the phone. */
function NotSynced() {
  const sync = useLive((live) => live.sync(), [], { optional: true });
  if (!sync) return null;
  return <p className="sync">{sync.notSynced} not synced</p>;
}

/** The first screen on a phone with no Account and no live Game (ADR 0007): what the app is, the install card, then the sign-in form. */
function SignInScreen() {
  return (
    <main>
      <h1>StatElite</h1>
      <p>Record your Athlete&apos;s Games from the sideline, even with no signal.</p>
      <InstallPrompt />
      <SignInForm />
    </main>
  );
}

/** The first download of a sign-in: the Account's Athletes come down before the app opens, and Retry follows a failed one (ADR 0007). */
function FirstDownload() {
  const phone = useLive((live) => live.phoneAccount(), []);
  const { run, alert, clear } = useCommand();
  // the failure goes first, so Retry gives way to the progress text while the attempt runs (#184)
  const download = () => {
    clear();
    run((core) => core.firstDownload(), { block: true, message: 'Could not get your Athletes. Check the connection and try again.' });
  };
  useEffect(() => download(), []);
  // retrying cannot work once the server ended the session, so the sign-in form replaces Retry
  if (phone?.state === 'session-ended') {
    return (
      <main>
        <h1>Sign in again to sync</h1>
        <SignInForm remembered={phone.email} />
      </main>
    );
  }
  if (alert) {
    return (
      <main>
        <p role="alert">{alert}</p>
        <button className="primary" onClick={download}>Retry</button>
      </main>
    );
  }
  return <main><p>Getting your Athletes…</p></main>;
}

/** Whether the phone has a connection: the browser reports it, and the message clears when signal returns. */
function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** The sign-in step of the first screen, the Invite screen and Sign in again: the email gets a 6-digit code, and typing it signs the Recorder in here. A phone whose session ended signs in with its remembered address only (ADR 0007). */
function SignInForm({ remembered }: { remembered?: string }) {
  const [typed, setTyped] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const { run } = useCommand();
  const online = useOnline();
  const address = (remembered ?? typed).trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    run((core) => core.signIn(address), {
      onDone: () => setSent(true),
      onRefused: (refusal) =>
        setError(
          refusal instanceof CodeTooSoon
            ? 'Wait a minute before asking for another code.'
            : 'Could not send the code. Check the connection and try again.',
        ),
    });
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    run((core) => core.verifyCode(address, code.trim()), {
      onRefused: () => setError('That code did not work. Check it and try again, or send a new code.'),
    });
  };
  if (sent) {
    return (
      <form key="code" onSubmit={submitCode}>
        <p>Check your email and type the 6-digit code.</p>
        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required autoComplete="one-time-code" />
        </label>
        <button className="primary">Sign in</button>
        <button type="button" onClick={() => { setSent(false); setCode(''); setError(undefined); }}>Send a new code</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }
  return (
    <form key="email" onSubmit={submit}>
      <label>
        Email
        <input
          type="email"
          value={remembered ?? typed}
          onChange={(e) => setTyped(e.target.value)}
          readOnly={remembered !== undefined}
          required
          autoComplete="email"
        />
      </label>
      <p>We only use your email to sign you in. If you join someone&apos;s Athlete, they&apos;ll see it.</p>
      {!online && <p>You need a connection to sign in.</p>}
      <button className="primary">Send code</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/** No Athlete yet: Add Athlete, with the signed-in address and Sign out (ADR 0007), then the install card. */
function FirstRun() {
  const phone = useLive((live) => live.phoneAccount(), [], { optional: true });
  const [signingOut, setSigningOut] = useState(false);
  if (signingOut) return <SignOut onCancel={() => setSigningOut(false)} />;
  return (
    <>
      <AthleteForm />
      {phone && phone.state !== 'signed-out' && (
        <>
          <p>Signed in as {phone.email}</p>
          <button onClick={() => setSigningOut(true)}>Sign out</button>
        </>
      )}
      <InstallPrompt />
    </>
  );
}

type AthleteFields = NonNullable<Home['athlete']>;

/** Add Athlete (first run, or from Home) or, when given an Athlete, Edit Athlete. A photo picked in either sets this phone's photo; none picked keeps it. */
function AthleteForm({ athlete, onDone }: { athlete?: AthleteFields; onDone?: () => void }) {
  const [name, setName] = useState(athlete?.name ?? '');
  const [number, setNumber] = useState(athlete?.jerseyNumber ?? '');
  const [photo, setPhoto] = useState<File>();
  const { run, alert } = useCommand();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // a second tap while the save is in flight would add a second Athlete: run's block refuses it
    if (!name.trim()) return;
    const fields = { name: name.trim(), jerseyNumber: number, photo };
    run<unknown>((core) => (athlete ? core.editAthlete({ id: athlete.id, ...fields }) : core.addAthlete(fields)), {
      block: true,
      onDone: () => onDone?.(),
    });
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
        {alert && <p role="alert">{alert}</p>}
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
function GameSetupForm({ athleteId, onCancel }: { athleteId: string; onCancel: () => void }) {
  const setup = useLive((live) => live.gameSetup(athleteId), [athleteId]);
  if (!setup) return null;
  return <SetupFields athleteId={athleteId} setup={setup} onCancel={onCancel} />;
}

/** The fields hold what the user types from the first render on; the prefill only seeds them. */
function SetupFields({ athleteId, setup, onCancel }: { athleteId: string; setup: GameSetup; onCancel: () => void }) {
  const [sport, setSport] = useState(setup.sport);
  const [periods, setPeriods] = useState(setup.basketballPeriods);
  const [opponent, setOpponent] = useState(setup.opponentName);
  const [gameDate, setGameDate] = useState(setup.gameDate);
  // a second tap before the Game shows on screen would start a second Game: run's block refuses it
  const { run, alert, busy } = useCommand();
  const valid = opponent.trim() !== '' && gameDate !== '';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const format: GameFormat =
      sport === 'basketball' ? { sport, periodFormat: periods } : { sport, periodFormat: 'innings' };
    run((core) => core.startGame({ athleteId, opponentName: opponent, gameDate, ...format }), { block: true });
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
        <button className="primary" disabled={!valid || busy}>
          Start
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {alert && <p role="alert">{alert}</p>}
      </form>
    </main>
  );
}

/** The photo: tapping it switches to the next Athlete. A switch the store refuses says so and keeps the Athlete on screen (#42). */
function SwitchPhoto({ athlete, next }: { athlete: AthleteFields; next: Home['next'] }) {
  const { run, alert } = useCommand();
  return (
    <>
      <button
        className="photo"
        disabled={!next}
        aria-label={next ? `Switch to ${next.name}` : athlete.name}
        onClick={() => {
          if (next) run((core) => core.switchAthlete(next.id));
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
      {alert && <p role="alert">{alert}</p>}
    </>
  );
}

function HomeScreen({ athlete, next }: { athlete: AthleteFields; next: Home['next'] }) {
  const [form, setForm] = useState<'add' | 'edit' | 'setup' | 'settings' | 'backlog'>();
  const [tab, setTab] = useState<Tab>('home');
  // the finished Game whose summary is open, from either tab
  const [summary, setSummary] = useState<string>();
  if (form === 'setup') {
    return <GameSetupForm athleteId={athlete.id} onCancel={() => setForm(undefined)} />;
  }
  if (form === 'settings') return <SettingsScreen onDone={() => setForm(undefined)} />;
  // ahead of the summary below: an Edit opens this form over the summary it came from, and Save or Cancel returns to that summary
  if (form === 'backlog') {
    return (
      <BacklogForm
        athleteId={athlete.id}
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
    return <AthleteForm athlete={form === 'edit' ? athlete : undefined} onDone={() => setForm(undefined)} />;
  }
  if (summary) {
    return (
      <GameSummary
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
        {tab === 'games' ? <GamesTab key={athlete.id} athleteId={athlete.id} onOpen={setSummary} /> : <InsightsTab athleteId={athlete.id} />}
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
        <SignInAgain />
        <RefusedRow />
        <div className="athlete">
          <SwitchPhoto athlete={athlete} next={next} />
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
        <button onClick={() => setForm('backlog')}>Add past Game</button>
        <SeasonAndRecent athleteId={athlete.id} onOpen={setSummary} />
        {/* keyed by Athlete: a switch remounts the link and the Members, so neither keeps the last Athlete's */}
        <section key={athlete.id} className="card sharing" aria-label="Sharing">
          <InviteCoParent athleteId={athlete.id} name={athlete.name} />
          <Members athleteId={athlete.id} name={athlete.name} />
        </section>
      </main>
      <TabBar tab={tab} onTab={setTab} />
      <InstallPrompt />
    </>
  );
}

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

const SPORT_LABELS: Record<Season['sport'], string> = { basketball: 'Basketball', softball: 'Softball', baseball: 'Baseball' };

/** Home's season card: a chip for each sport with finished Games, its headline numbers and its Games count. The chip choice is screen state. */
function SeasonCard({ feed }: { feed: GameFeed }) {
  const [chosen, setChosen] = useState<Season['sport']>();
  const seasons = feed.seasons;
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
function SeasonAndRecent({ athleteId, onOpen }: { athleteId: string; onOpen: (gameId: string) => void }) {
  const feed = useLive((live) => live.gameFeed(athleteId), [athleteId]);
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

/** A sport's season tiles on the Games tab: basketball's six totals, or softball and baseball's batting, runs, stolen bases and Games count. */
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
          ['Runs', String(season.baserunning.runs)],
          ['Stolen bases', String(season.baserunning.stolenBases)],
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
function GamesTab({ athleteId, onOpen }: { athleteId: string; onOpen: (gameId: string) => void }) {
  const feed = useLive((live) => live.gameFeed(athleteId), [athleteId]);
  const [chosen, setChosen] = useState<Season['sport']>();
  if (!feed) return null;
  const seasons = feed.seasons;
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
function InsightsTab({ athleteId }: { athleteId: string }) {
  const cards = useLive((live) => live.practiceFocus(athleteId), [athleteId]);
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
function GameSummary({ gameId, onBack, onEdit, onRemoved }: { gameId: string; onBack: () => void; onEdit: () => void; onRemoved: () => void }) {
  const game = useLive((live) => live.gameSummary(gameId), [gameId]);
  // only a Backlogged Game its Recorder entered has an entry to edit (ADR 0005); its Recorder can remove any finished Game (ADR 0008)
  const backlog = useLive((live) => live.backlogEntry(gameId), [gameId], { optional: true });
  const removable = useLive((live) => live.canRemoveGame(gameId), [gameId], { optional: true });
  // Remove asks first, and the confirm step says only what leaves the app: the Game is hidden, not erased (ADR 0006)
  const [confirming, setConfirming] = useState(false);
  const { run, alert, clear } = useCommand();
  // the Game was removed on another phone or tab, so there is nothing to show: the summary leaves (#164)
  useEffect(() => {
    if (game === null) onBack();
  }, [game]);
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
      {removable && !confirming && <button onClick={() => setConfirming(true)}>Remove</button>}
      {removable && confirming && (
        <section className="card">
          <p>Remove this Game? It leaves the Games feed and the season line on every phone, and the app can't bring it back.</p>
          {alert && <p role="alert">{alert}</p>}
          <button onClick={() => run((core) => core.removeGame(gameId), { onDone: onRemoved })}>Yes, remove</button>
          <button onClick={() => { clear(); setConfirming(false); }}>Cancel</button>
        </section>
      )}
    </main>
  );
}

/** Add past Game (no gameId) or Edit past Game: a Backlogged Game, entered from its Totals (ADR 0005). Loads its prefill before the fields, as GameSetupForm does. */
function BacklogForm({
  athleteId,
  athleteName,
  gameId,
  onDone,
}: {
  athleteId: string;
  athleteName: string;
  gameId?: string;
  onDone: (savedGameId?: string) => void;
}) {
  const setup = useLive((live) => live.gameSetup(athleteId), [athleteId]);
  const entry = useLive((live) => (gameId ? live.backlogEntry(gameId) : Promise.resolve(undefined)), [gameId]);
  // an Edit labels the Game's own Athlete: another tab can change the selected one while this form is open
  const summary = useLive((live) => (gameId ? live.gameSummary(gameId) : Promise.resolve(undefined)), [gameId]);
  // the Game left this phone with its Athlete: the form returns, and its summary leaves too. A removal keeps the entry, so the form stays until Cancel or Save (#164)
  useEffect(() => {
    if (gameId && entry === null) onDone();
  }, [entry]);
  if (!setup || (gameId && !entry)) return null;
  return (
    <BacklogFields
      athleteId={athleteId}
      athleteName={summary?.athleteName ?? athleteName}
      gameId={gameId}
      setup={setup}
      entry={entry ?? undefined}
      onDone={onDone}
    />
  );
}

/** The fields hold what the Recorder types from the first render on; the prefill only seeds them. */
function BacklogFields({
  athleteId,
  athleteName,
  gameId,
  setup,
  entry,
  onDone,
}: {
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
  // a second tap before the save lands would write a second Game: run's block refuses it
  const { run, alert, busy } = useCommand();
  const typed = (key: string) => text[key] ?? '';
  const fields: CountField[] = [
    ['teamScore', `${athleteName} score`],
    ['opponentScore', 'Opponent score'],
    ...countFields(sport),
  ];
  // a count is a whole number or the form says which one is not: no coercion, no rounding
  const notWholeField = notWhole(fields, text);
  const ready = opponent.trim() !== '' && gameDate !== '' && typed('teamScore').trim() !== '' && typed('opponentScore').trim() !== '';
  const draft = ready && !notWholeField ? { sport, opponentName: opponent.trim(), gameDate, totals: totalsOf(sport, text) } : undefined;
  const problem = notWholeField ? `${notWholeField[1]} must be a whole number.` : draft && backlogProblem(draft, setup.gameDate);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft || problem) return;
    if (gameId) run((core) => core.editBacklog(gameId, draft), { block: true, onDone: () => onDone() });
    else run((core) => core.backlogGame({ athleteId, ...draft }), { block: true, onDone });
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
        {alert && <p role="alert">{alert}</p>}
        <button className="primary" disabled={!draft || problem !== undefined || busy}>
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
function SettingsScreen({ onDone }: { onDone: () => void }) {
  const size = useLive((live) => live.buttonSize(), []);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const phone = useLive((live) => live.phoneAccount(), [], { optional: true });
  const field = useLive((live) => live.fieldMode(), []);
  // a setting the store refused: the alert shows until a setting lands
  const { run, alert } = useCommand();
  if (deleting) return <DeleteAccount onCancel={() => setDeleting(false)} />;
  if (signingOut) return <SignOut onCancel={() => setSigningOut(false)} />;
  if (!size || field == null) return null;
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
              onClick={() => run((core) => core.setButtonSize(option))}
            >
              {SIZE_LABELS[option]}
            </button>
          ))}
        </div>
        <button
          aria-pressed={field}
          className={field ? 'primary' : undefined}
          onClick={() => run((core) => core.setFieldMode(!field))}
        >
          Field mode
        </button>
        {alert && <p role="alert">{alert}</p>}
      </section>
      {phone && phone.state !== 'signed-out' && (
        <>
          <p>Signed in as {phone.email}</p>
          <button onClick={() => setSigningOut(true)}>Sign out</button>
        </>
      )}
      <button onClick={() => setDeleting(true)}>Delete my account and all data</button>
      <button className="primary" onClick={onDone}>
        Done
      </button>
    </main>
  );
}

/** Names what happens to each Athlete, then deletes: the account on the server, and everything on this phone. */
function DeleteAccount({ onCancel }: { onCancel: () => void }) {
  const [summary, setSummary] = useState<DeletionSummary>();
  const [unreadable, setUnreadable] = useState(false);
  const phone = useLive((live) => live.phoneAccount(), []);
  const { run, alert, busy } = useCommand();
  // a passing Athlete's Member comes from the server, so the list waits for it and says so when it cannot load
  useEffect(() => {
    run((core) => core.deletionSummary(), {
      onDone: setSummary,
      onRefused: () => setUnreadable(true),
      message: 'Could not load what deleting removes. Check the connection and try again.',
    });
  }, []);
  if (unreadable) {
    return (
      <main>
        <h1>Delete my account and all data</h1>
        <p role="alert">{alert}</p>
        <button onClick={onCancel}>Cancel</button>
      </main>
    );
  }
  if (!summary || !phone) return null;
  // on success the phone has no Athlete, so App shows first run and this screen goes
  const remove = () => run((core) => core.deleteAccount(), { block: true, message: 'Could not delete. Check the connection and try again.' });
  // a session the server ended clears only this phone: the Account stays on the server until its address signs in again
  const ended = phone.state === 'session-ended';
  return (
    <main>
      <section className="card">
        <h1>{ended ? 'Clear this phone' : 'Delete my account and all data'}</h1>
        <p>
          {ended ? (
            'This only clears this phone. Your Account and its data stay on the server. Sign in again first to delete them.'
          ) : (
            <>
              {phone.state !== 'signed-out' ? 'This deletes your account from the server and clears this phone.' : 'This clears this phone.'} It cannot be
              undone.
            </>
          )}
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
      <button className="primary" disabled={busy} onClick={remove}>
        {ended ? 'Clear this phone' : 'Delete everything'}
      </button>
      <button disabled={busy} onClick={onCancel}>
        Cancel
      </button>
      {alert && <p role="alert">{alert}</p>}
    </main>
  );
}

/** Sign out: says what the phone loses and keeps, then clears this phone; the Account and its rows stay on the server. */
function SignOut({ onCancel }: { onCancel: () => void }) {
  const photos = useLive((live) => live.photoCount(), []);
  const { run, alert, busy } = useCommand();
  if (photos === undefined) return null;
  // on success the phone has no Athlete, so App shows first run and this screen goes
  const signOut = () => run((core) => core.signOut(), { block: true, message: SIGN_OUT_REFUSED });
  return (
    <main>
      <section className="card">
        <h1>Sign out</h1>
        <p>
          This clears this phone. Your Athletes and Games stay on your Account. Photos are only on this phone and can&apos;t be brought
          back.
        </p>
        <ul>
          <li>Photos on this phone: {photos}</li>
        </ul>
      </section>
      <button className="primary" disabled={busy} onClick={signOut}>
        Sign out
      </button>
      <button disabled={busy} onClick={onCancel}>
        Cancel
      </button>
      {alert && <p role="alert">{alert}</p>}
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
        <button aria-label={`${label} +1`} disabled={value >= SCORE_MAX} onClick={() => onAdjust(1)}>
          +
        </button>
      </div>
    </div>
  );
}

/** End Game: the Final Score, prefilled from the strip. Submit stays disabled until both sides have a whole number. */
function EndGameForm({
  run,
  gameId,
  athleteName,
  score,
  onEnded,
  onCancel,
}: {
  run: Run;
  gameId: string;
  athleteName: string;
  score: Scores;
  onEnded: () => void;
  onCancel: () => void;
}) {
  const [team, setTeam] = useState(String(score.team));
  const [opponent, setOpponent] = useState(String(score.opponent));
  const whole = (text: string) => /^\d+$/.test(text) && Number(text) <= SCORE_MAX;
  const valid = whole(team) && whole(opponent);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    // leaves the Game on screen before the store closes it, so Home does not flash in between
    onEnded();
    // a refused End Game leaves the Game live, and the live screen says so
    run((core) => core.endGame(gameId, { teamScore: Number(team), opponentScore: Number(opponent) }));
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
      {!valid && <p role="alert">Scores are whole numbers from 0 to {SCORE_MAX}.</p>}
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
function GameComplete({ gameId, onDone }: { gameId: string; onDone: () => void }) {
  const game = useLive((live) => live.gameSummary(gameId), [gameId]);
  // the text is read before the tap, so the click reaches the clipboard with no await in between (iOS drops the gesture across one)
  const text = useLive((live) => live.gameCopyText(gameId), [gameId], { optional: true });
  // the outcome shows for 2 seconds in place, no modal; a new object per tap restarts the timer
  const [copied, setCopied] = useState<{ label: string }>();
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(undefined), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  // the card is drawn as the sheet opens, so a tap on Share card reaches the share sheet with no await in between (iOS drops the gesture across one)
  const card = useLive((live) => live.gameCard(gameId), [gameId], { optional: true });
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
  // the Game was removed on another phone or tab: Game Complete goes Home (#164). liveGame does not read removed, so the summary's null is the signal
  useEffect(() => {
    if (game === null) onDone();
  }, [game]);
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
    if (!text) return;
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
      <button disabled={!text} onClick={copy}>
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
  run,
  gameId,
  shots,
  points,
  onRecorded,
}: {
  run: Run;
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
  // the spot clears at the tap and comes back if the store refuses the Shot, so a retry records the same spot
  const record = (made: boolean) => {
    if (!pending) return;
    const spot = pending;
    setPending(undefined);
    run((core) => core.recordShot(gameId, { x: spot.x, y: spot.y, value: spot.value, made }), {
      onDone: () => onRecorded(shotLabel(spot.value, made)),
      onRefused: () => setPending((current) => current ?? spot),
    });
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

function LiveGame({ gameId, onEnded, onDone }: { gameId: string; onEnded: (gameId: string) => void; onDone: () => void }) {
  // the live Game re-reads each second, so the Shift timer and Playing Share keep running
  // shortcut: re-reads every Event of the Game each second, fine for one Game; upgrade to a UI-side clock if a Game's read gets slow
  const [second, setSecond] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSecond((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const game = useLive((live) => live.liveGame(gameId), [gameId, second]);
  const size = useLive((live) => live.buttonSize(), [], { optional: true }) ?? 'standard';
  const field = useLive((live) => live.fieldMode(), [], { optional: true }) ?? false;
  // the toast for the last tap, shown 3 seconds; each call sets a new object, so a repeated label still restarts the timer
  const [toast, setToast] = useState<{ label: string }>();
  // a write the store refused: the alert shows until the next write lands
  const { run, alert } = useCommand();
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
  // the Game was removed on another phone or tab, so the live screen goes Home (#164)
  useEffect(() => {
    if (game === null) onDone();
  }, [game]);
  if (!game) return null;
  if (game.final) {
    // Undo End Game until Done: it retracts the End Game, and the Game returns to the live screen (ADR 0001)
    return (
      <main>
        <GameComplete gameId={gameId} onDone={onDone} />
        {alert && <p role="alert">{alert}</p>}
        <button onClick={() => run((core) => core.undo(gameId))}>Undo End Game</button>
        <button onClick={onDone}>
          Done
        </button>
      </main>
    );
  }
  // a write that lands clears the alert and runs onDone; one the store refuses shows the alert, runs onRefused to put back what the tap cleared, and leaves the screen as it was. Live taps never block.
  const tap = (type: TileEventType) =>
    run((core) => core.recordTile(gameId, type), {
      onDone: () => {
        setToast({ label: TILE_LABELS[type] });
        setFlash({ type });
      },
    });
  const tapFreeThrow = (made: boolean) => run((core) => core.recordFreeThrow(gameId, made), { onDone: () => setToast({ label: freeThrowLabel(made) }) });
  const tapPitch = (pitch: Pitch) => run((core) => core.recordPitch(gameId, pitch), { onDone: () => setToast({ label: PITCH_LABELS[pitch] }) });
  // the armed Outcome clears at the tap and comes back if the store refuses it
  const pick = (rbi: number) => {
    if (!pending) return;
    const outcome = pending;
    setPending(undefined);
    run((core) => core.recordPlateAppearance(gameId, { outcome, rbi }), {
      onDone: () => setToast({ label: outcomeLabel(outcome, game.count?.strikeout) }),
      onRefused: () => setPending((current) => current ?? outcome),
    });
  };
  // Stole clears at the tap and comes back if the store refuses the move
  const tapBase = (base: BaseMove) => {
    const stolen = stealing;
    setStealing(false);
    run((core) => core.recordBaserunning(gameId, { base, stolen }), {
      onDone: () => setToast({ label: baseLabel(base, stolen) }),
      onRefused: () => setStealing(stolen),
    });
  };
  const adjust = (side: 'team' | 'opponent', delta: 1 | -1) => {
    run((core) => core.adjustScore(gameId, side, delta), { onDone: () => setToast({ label: EVENT_LABELS.score }) });
  };
  const undo = () => {
    run((core) => core.undo(gameId), {
      onDone: () => {
        setToast(undefined);
        setPending(undefined);
      },
    });
  };
  // the toast and the pulse wait for the write, so a refused Sub shows neither
  const sub = () => {
    const label = game.onCourt ? EVENT_LABELS.sub_out : EVENT_LABELS.sub_in;
    run((core) => core.toggleSub(gameId), {
      onDone: () => {
        setToast({ label });
        setPulse((n) => n + 1);
      },
    });
  };
  const nextPeriod = () => {
    run((core) => core.nextPeriod(gameId), {
      onDone: () => {
        setToast({ label: EVENT_LABELS.period_start });
        setPending(undefined);
      },
    });
  };
  // the Shift on court, if any: its timer and Plus/Minus so far
  const current = game.onCourt ? game.shifts.at(-1) : undefined;
  // the closed Shifts, for the Game line's list; the Shift on court is on the timer line
  const closed = game.onCourt ? game.shifts.slice(0, -1) : game.shifts;
  const shots = (
    <>
      <ShotEntry run={run} gameId={gameId} shots={game.shots} points={game.points} onRecorded={(label) => setToast({ label })} />
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
      {alert && <p role="alert">{alert}</p>}
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
        <span className="period">{game.periodLabel}</span>
        <button onClick={nextPeriod}>Next period</button>
        {!ending && <button onClick={() => setEnding(true)}>End Game</button>}
        <button
          aria-label="Field mode"
          aria-pressed={field}
          className={field ? 'primary sun' : 'sun'}
          onClick={() => run((core) => core.setFieldMode(!field))}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
      </div>
      {ending && (
        <EndGameForm
          run={run}
          gameId={gameId}
          athleteName={game.athleteName}
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
          <span>
            <span aria-hidden="true">✓</span> {toast.label}
          </span>
          <button onClick={undo}>Undo</button>
        </div>
      )}
    </main>
  );
}
