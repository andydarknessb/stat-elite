-- ADR 0006: a Recorder removes its Backlogged Game. Every phone hides it, and its row stays on the server. A live Game can never be removed.
alter table games add column removed boolean not null default false
  check (not removed or totals is not null);
