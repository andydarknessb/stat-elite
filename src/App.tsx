import { liveQuery } from 'dexie';
import { useEffect, useState, type FormEvent } from 'react';
import type { AppCore } from './core/appCore';

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
  if (!home) return null;
  if (!home.athlete) return <AddAthlete core={core} />;
  if (!home.liveGameId) return <StartGame core={core} athlete={home.athlete} />;
  return <LiveGame core={core} gameId={home.liveGameId} />;
}

function AddAthlete({ core }: { core: AppCore }) {
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) void core.addAthlete({ name: name.trim() });
  };
  return (
    <main>
      <h1>Add Athlete</h1>
      <form onSubmit={submit}>
        <label>
          Athlete name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        </label>
        <button className="primary">Add Athlete</button>
      </form>
    </main>
  );
}

function StartGame({ core, athlete }: { core: AppCore; athlete: { id: string; name: string } }) {
  return (
    <main>
      <h1>{athlete.name}</h1>
      {/* shortcut: always basketball in quarters, until Game setup exists (#14) */}
      <button
        className="primary"
        onClick={() => void core.startGame({ athleteId: athlete.id, sport: 'basketball', periodFormat: 'quarters' })}
      >
        Start Game
      </button>
    </main>
  );
}

function LiveGame({ core, gameId }: { core: AppCore; gameId: string }) {
  const game = useReadModel(() => core.liveGame(gameId), [core, gameId]);
  if (!game) return null;
  return (
    <main>
      {/* shortcut: only the STL tile, until the full basketball live screen (#15) */}
      <button className="tile" onClick={() => void core.recordTile(gameId, 'steal')}>
        STL <span className="count">{game.tiles.steal}</span>
      </button>
    </main>
  );
}
