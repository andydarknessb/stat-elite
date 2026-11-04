import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createStandInServer, createSupabaseServer, type Server } from './server';
import { schemaDatabase, supabaseDouble } from './supabaseDouble';

// One server per test: a new phone on it, and the one clock-dependent state each backend keeps differently.
type Backend = { phone(): Server; expireInvite(token: string): Promise<void>; close(): Promise<void> };

async function standInBackend(): Promise<Backend> {
  const root = createStandInServer(() => true);
  return {
    phone: () => root.phone(),
    // the stand-in reads Date.now(), so an Invite is expired by putting its expiry in the past
    async expireInvite(token) {
      root.invites.get(token)!.expires = 0;
    },
    async close() {},
  };
}

async function supabaseBackend(): Promise<Backend> {
  const db = await schemaDatabase();
  return {
    phone: () => createSupabaseServer(supabaseDouble(db)),
    async expireInvite(token) {
      await db.query("update invites set expires_at = now() - interval '1 day' where token = $1", [token]);
    },
    close: () => db.close(),
  };
}

const CODE = '123456';
const ATHLETE = '10000000-0000-0000-0000-00000000000a';
const GAME = '20000000-0000-0000-0000-00000000000a';
const EVENT = '30000000-0000-0000-0000-00000000000a';
const NEW_ATHLETE = '10000000-0000-0000-0000-00000000000b';
const NO_SUCH_INVITE = '00000000-0000-0000-0000-00000000dead';
const NO_ACCOUNT = '00000000-0000-0000-0000-0000000000cc';

async function signedIn(backend: Backend, email: string): Promise<Server> {
  const phone = backend.phone();
  await phone.signIn(email);
  await phone.verifyCode(email, CODE);
  return phone;
}

// joined_at orders the Members, so a later join is stamped later than an earlier one
const later = () => new Promise((resolve) => setTimeout(resolve, 5));

const athlete = (owner: string, name = 'Casey', updated_at = '2026-10-30T18:00:00.000Z') => ({
  id: ATHLETE,
  owner_id: owner,
  name,
  jersey_number: null,
  updated_at,
});
const game = (owner: string, recorder: string, opponent_name = 'Hawks', updated_at = '2026-10-30T18:00:00.000Z') => ({
  id: GAME,
  owner_id: owner,
  athlete_id: ATHLETE,
  sport: 'basketball',
  period_format: 'quarters',
  opponent_name,
  game_date: '2026-10-30',
  recorded_by: recorder,
  updated_at,
});
const event = (owner: string, patch: Record<string, unknown> = {}) => ({
  id: EVENT,
  owner_id: owner,
  game_id: GAME,
  seq: 1,
  client_ts: '2026-10-30T18:01:00.000Z',
  period: 1,
  type: 'steal',
  ...patch,
});

const contract: [string, () => Promise<Backend>][] = [
  ['createStandInServer', standInBackend],
  ['the Supabase adapter over the double', supabaseBackend],
];

for (const [adapter, makeBackend] of contract) {
  describe(adapter, () => {
    let backend: Backend;
    beforeEach(async () => {
      backend = await makeBackend();
    }, 60_000);
    afterEach(async () => {
      await backend.close();
    });

    test('an Owner uploads an Athlete, a Game and an Event, and downloads them back', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      await owner.upload('games', game(me, me));
      await owner.upload('events', event(me));

      expect(await owner.download('athletes')).toMatchObject([{ id: ATHLETE, owner_id: me, name: 'Casey' }]);
      expect(await owner.download('games')).toMatchObject([{ id: GAME, athlete_id: ATHLETE, recorded_by: me }]);
      expect(await owner.download('events')).toMatchObject([{ id: EVENT, game_id: GAME, type: 'steal', seq: 1 }]);
    });

    test('the latest edit of an Athlete or Game wins, whichever arrives first', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me, 'Casey', '2026-10-30T18:00:00.000Z'));
      await owner.upload('athletes', athlete(me, 'Casey Jones', '2026-10-30T19:00:00.000Z'));
      await owner.upload('athletes', athlete(me, 'Casey', '2026-10-30T18:00:00.000Z'));
      await owner.upload('games', game(me, me, 'Hawks', '2026-10-30T18:00:00.000Z'));
      await owner.upload('games', game(me, me, 'Rams', '2026-10-30T19:00:00.000Z'));
      await owner.upload('games', game(me, me, 'Hawks', '2026-10-30T18:00:00.000Z'));

      expect(await owner.download('athletes')).toMatchObject([{ name: 'Casey Jones' }]);
      expect(await owner.download('games')).toMatchObject([{ opponent_name: 'Rams' }]);
    });

    test('a repeated Event is ignored: the first copy stays', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      await owner.upload('games', game(me, me));
      await owner.upload('events', event(me, { period: 1 }));
      await owner.upload('events', event(me, { period: 2 }));

      expect(await owner.download('events')).toMatchObject([{ id: EVENT, period: 1 }]);
    });

    test('an Owner sees its rows; a Member sees the Athlete it joined, with its Games and Events; a stranger sees none', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      await owner.upload('games', game(me, me));
      await owner.upload('events', event(me));
      const member = await signedIn(backend, 'sam@example.com');
      await member.acceptInvite(await owner.createInvite(ATHLETE));
      const stranger = await signedIn(backend, 'rob@example.com');

      expect(await owner.download('athletes')).toMatchObject([{ id: ATHLETE }]);
      expect(await member.download('athletes')).toMatchObject([{ id: ATHLETE }]);
      expect(await member.download('games')).toMatchObject([{ id: GAME }]);
      expect(await member.download('events')).toMatchObject([{ id: EVENT }]);
      expect(await stranger.download('athletes')).toEqual([]);
      expect(await stranger.download('games')).toEqual([]);
      expect(await stranger.download('events')).toEqual([]);
    });

    test('an Invite is refused as unknown, as the Owner’s own, as used by another account, or as expired', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      const token = await owner.createInvite(ATHLETE);

      await expect(owner.acceptInvite(token)).rejects.toMatchObject({ reason: 'own' });
      await expect(owner.acceptInvite(NO_SUCH_INVITE)).rejects.toMatchObject({ reason: 'unknown' });
      const first = await signedIn(backend, 'sam@example.com');
      await first.acceptInvite(token);
      // the account that accepted it may accept again, as a retry after a failed download
      await expect(first.acceptInvite(token)).resolves.toBeUndefined();
      const second = await signedIn(backend, 'rob@example.com');
      await expect(second.acceptInvite(token)).rejects.toMatchObject({ reason: 'used' });
      const late = await owner.createInvite(ATHLETE);
      await backend.expireInvite(late);
      const third = await signedIn(backend, 'lee@example.com');
      await expect(third.acceptInvite(late)).rejects.toMatchObject({ reason: 'expired' });
    });

    test('an Owner sees every Member of its Athlete with the email each accepted with; a Member sees only itself', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      const sam = await signedIn(backend, 'sam@example.com');
      await sam.acceptInvite(await owner.createInvite(ATHLETE));
      await later();
      const rob = await signedIn(backend, 'rob@example.com');
      await rob.acceptInvite(await owner.createInvite(ATHLETE));
      const samId = (await sam.session())!;
      const robId = (await rob.session())!;

      const seen = (await owner.members(ATHLETE)).map(({ member_id, email }) => ({ member_id, email }));
      expect(seen).toHaveLength(2);
      expect(seen).toEqual(
        expect.arrayContaining([
          { member_id: samId, email: 'sam@example.com' },
          { member_id: robId, email: 'rob@example.com' },
        ]),
      );
      expect(await sam.members(ATHLETE)).toEqual([expect.objectContaining({ member_id: samId })]);
      const stranger = await signedIn(backend, 'lee@example.com');
      expect(await stranger.members(ATHLETE)).toEqual([]);
    });

    test('an Owner removes a Member, which then sees no Athlete; a Member cannot remove another', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      const sam = await signedIn(backend, 'sam@example.com');
      await sam.acceptInvite(await owner.createInvite(ATHLETE));
      const rob = await signedIn(backend, 'rob@example.com');
      await rob.acceptInvite(await owner.createInvite(ATHLETE));
      const samId = (await sam.session())!;
      const robId = (await rob.session())!;

      await owner.removeMember(ATHLETE, samId);

      expect(await sam.download('athletes')).toEqual([]);
      expect((await owner.members(ATHLETE)).map(({ member_id }) => member_id)).toEqual([robId]);
      await expect(rob.removeMember(ATHLETE, samId)).rejects.toThrow();
    });

    test('a Member leaves its Athlete and sees it no longer', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      const sam = await signedIn(backend, 'sam@example.com');
      await sam.acceptInvite(await owner.createInvite(ATHLETE));

      await sam.leave(ATHLETE);

      expect(await sam.download('athletes')).toEqual([]);
      expect(await owner.members(ATHLETE)).toEqual([]);
    });

    test('deleting an Owner’s account passes each shared Athlete, with its Games and Events, to the Member who joined first', async () => {
      const owner = await signedIn(backend, 'casey@example.com');
      const me = (await owner.session())!;
      await owner.upload('athletes', athlete(me));
      await owner.upload('games', game(me, me));
      await owner.upload('events', event(me));
      const first = await signedIn(backend, 'sam@example.com');
      await first.acceptInvite(await owner.createInvite(ATHLETE));
      await later();
      const second = await signedIn(backend, 'rob@example.com');
      await second.acceptInvite(await owner.createInvite(ATHLETE));
      const firstId = (await first.session())!;
      const secondId = (await second.session())!;

      await owner.deleteAccount();

      expect(await first.download('athletes')).toMatchObject([{ id: ATHLETE, owner_id: firstId }]);
      expect(await first.download('games')).toMatchObject([{ id: GAME, owner_id: firstId }]);
      expect(await first.download('events')).toMatchObject([{ id: EVENT, owner_id: firstId }]);
      expect((await first.members(ATHLETE)).map(({ member_id }) => member_id)).toEqual([secondId]);
    });
  });
}

describe('the Supabase adapter over the double refuses the rows the real schema refuses', () => {
  let backend: Backend;
  beforeEach(async () => {
    backend = await supabaseBackend();
  }, 60_000);
  afterEach(async () => {
    await backend.close();
  });

  test("a stranger's upload of an Athlete it does not own is refused", async () => {
    const owner = await signedIn(backend, 'casey@example.com');
    const me = (await owner.session())!;
    await owner.upload('athletes', athlete(me));
    const stranger = await signedIn(backend, 'rob@example.com');

    await expect(stranger.upload('athletes', { ...athlete(me), id: NEW_ATHLETE })).rejects.toThrow('row-level security');
  });

  test('a Member inserting an Athlete is refused', async () => {
    const owner = await signedIn(backend, 'casey@example.com');
    const me = (await owner.session())!;
    await owner.upload('athletes', athlete(me));
    const sam = await signedIn(backend, 'sam@example.com');
    await sam.acceptInvite(await owner.createInvite(ATHLETE));

    await expect(sam.upload('athletes', { ...athlete(me), id: NEW_ATHLETE })).rejects.toThrow('row-level security');
  });

  test('an Event the per-type CHECK refuses is refused', async () => {
    const owner = await signedIn(backend, 'casey@example.com');
    const me = (await owner.session())!;
    await owner.upload('athletes', athlete(me));
    await owner.upload('games', game(me, me));

    await expect(owner.upload('events', event(me, { type: 'shot' }))).rejects.toThrow('check constraint');
  });

  test('a Game naming another Recorder is refused', async () => {
    const owner = await signedIn(backend, 'casey@example.com');
    const me = (await owner.session())!;
    await owner.upload('athletes', athlete(me));

    await expect(owner.upload('games', game(me, NO_ACCOUNT))).rejects.toThrow('row-level security');
  });

  test("a removed Member's edit of a Game leaves the server's row unchanged", async () => {
    const owner = await signedIn(backend, 'casey@example.com');
    const me = (await owner.session())!;
    await owner.upload('athletes', athlete(me));
    const sam = await signedIn(backend, 'sam@example.com');
    await sam.acceptInvite(await owner.createInvite(ATHLETE));
    const samId = (await sam.session())!;
    await sam.upload('games', game(me, samId, 'Hawks', '2026-10-30T18:00:00.000Z'));
    await owner.removeMember(ATHLETE, samId);

    // the server may refuse this edit or take it as a no-op; either way the row it holds must not change
    await sam.upload('games', game(me, samId, 'Rams', '2026-10-30T19:00:00.000Z')).catch(() => undefined);

    expect(await owner.download('games')).toMatchObject([{ opponent_name: 'Hawks' }]);
  });
});
