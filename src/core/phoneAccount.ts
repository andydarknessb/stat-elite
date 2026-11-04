import type { Server } from './server';
import type { Store } from './store';

/** Whether this phone is signed in, as one read (ADR 0007): signed out, the first download still due, signed in, or the server ended the session. */
export type PhoneAccount =
  | { state: 'signed-out' }
  | { state: 'first-download'; id: string; email?: string }
  | { state: 'signed-in'; id: string; email?: string }
  | { state: 'session-ended'; id: string; email?: string; firstDownload: boolean };

/** The Account this phone last saw signed in, as JSON: kept so the phone still knows it when the session cannot be read (ADR 0004). */
const ACCOUNT = 'account';
/** Set when the server ended this phone's session: the phone keeps recording and asks for the remembered address's code. A verified code clears it (ADR 0007). */
const SESSION_ENDED = 'sessionEnded';
/** The account whose rows this phone last downloaded: a sign-in clears it, so the next one downloads again. */
const DOWNLOADED_FOR = 'downloadedFor';
/** The account whose rows this phone has downloaded at least once: nothing clears it between launches, unlike DOWNLOADED_FOR (ADR 0007). */
const DOWNLOADED_ONCE = 'downloadedOnce';
const SAME_ADDRESS = 'This phone signs in again only with the address it was signed in with';
const SIGN_IN_AGAIN = 'The account cannot be reached: sign in again to delete it';

/** The phone's sign-in, held in its store: the Remembered Account, the ended-Session flag and the two download markers (#172). */
export function createPhoneAccount(store: Store, server: Server) {
  /** The Account this phone signed in with, or undefined when it never has. It holds while the session cannot be read. */
  async function account(): Promise<{ id: string; email?: string } | undefined> {
    const value = (await store.settings.get(ACCOUNT))?.value;
    return value === undefined ? undefined : JSON.parse(value);
  }

  /** Where the phone stands, read from what it holds, so it reads the same offline. */
  async function phoneAccount(): Promise<PhoneAccount> {
    const held = await account();
    if (held === undefined) return { state: 'signed-out' };
    // "Athletes not confirmed": no Athlete on the phone, and no confirmed download for this Account
    const firstDownload = (await store.athletes.count()) === 0 && (await store.settings.get(DOWNLOADED_ONCE))?.value !== held.id;
    if ((await store.settings.get(SESSION_ENDED))?.value === 'on') return { state: 'session-ended', ...held, firstDownload };
    return firstDownload ? { state: 'first-download', ...held } : { state: 'signed-in', ...held };
  }

  /** Remembers a live session's Account, written only when it changes, so a flush that finds it held writes nothing. */
  async function remember(id: string) {
    const email = await server.email();
    const held = await account();
    if (held?.id !== id || held.email !== email) await store.settings.put({ key: ACCOUNT, value: JSON.stringify({ id, email }) });
  }

  /** Sends the sign-in code. While an Account is remembered, only its own address may sign in again (ADR 0007). */
  async function signIn(email: string): Promise<void> {
    const held = await account();
    if (held && held.email !== email) throw new Error(SAME_ADDRESS);
    return server.signIn(email);
  }

  /** A verified code clears the download marker and the ended-Session flag (ADR 0007). */
  async function verifyCode(email: string, code: string): Promise<void> {
    await server.verifyCode(email, code);
    // the account is signing in here, so it downloads again even if this phone has downloaded it before; the code ends a session the server ended
    await store.settings.bulkDelete([DOWNLOADED_FOR, SESSION_ENDED]);
  }

  /** A remembered Account whose session cannot be read may still exist on the server, unless the server ended the session: then it has no Account here. */
  async function refuseIfUnreachable(session: string | undefined): Promise<void> {
    if (session === undefined && (await account()) && !(await server.sessionEnded())) throw new Error(SIGN_IN_AGAIN);
  }

  /** A remembered Account whose session the server ended: Home asks for its code (ADR 0007). */
  async function noteEndedSession(): Promise<void> {
    if ((await account()) && (await server.sessionEnded())) await store.settings.put({ key: SESSION_ENDED, value: 'on' });
  }

  /** Whether this phone still owes the owner's rows a download since its last sign-in. */
  async function needsDownload(owner: string): Promise<boolean> {
    return (await store.settings.get(DOWNLOADED_FOR))?.value !== owner;
  }

  async function markDownloaded(owner: string): Promise<void> {
    await store.settings.put({ key: DOWNLOADED_FOR, value: owner });
  }

  /** A sign-in or a launch downloads the account's rows again. */
  async function forgetDownload(): Promise<void> {
    await store.settings.delete(DOWNLOADED_FOR);
  }

  /** A download that confirmed the session counts for the account (ADR 0007). Called inside the download's transaction. */
  async function confirmDownload(owner: string): Promise<void> {
    await store.settings.put({ key: DOWNLOADED_ONCE, value: owner });
  }

  /** Whether a download has confirmed the remembered Account on this phone. */
  async function downloadConfirmed(): Promise<boolean> {
    const me = await account();
    return me !== undefined && (await store.settings.get(DOWNLOADED_ONCE))?.value === me.id;
  }

  return {
    account,
    phoneAccount,
    remember,
    signIn,
    verifyCode,
    refuseIfUnreachable,
    noteEndedSession,
    needsDownload,
    markDownloaded,
    forgetDownload,
    confirmDownload,
    downloadConfirmed,
  };
}
