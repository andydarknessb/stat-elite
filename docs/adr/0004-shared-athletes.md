# Athletes are shared through Owner and Members

Two parents often follow the same child, so an Athlete has one Owner and any number of Members. A Member joins through a single-use Invite link that expires after 7 days. Members see every Game of that Athlete and can record new ones; only the Owner removes Members or deletes the Athlete, and a Member can leave. Row access changes from "the row's owner is me" (no joins) to "I am the Owner or a Member of this row's Athlete", which costs one lookup per query but keeps both parents on the same record.

## Considered Options

- **No sharing; share cards only**: cheapest, but the second parent can never record or browse Games.
- **One shared login**: both parents sign in with the same email. Magic links go to one inbox, and one parent can't be removed later.

## Consequences

- Every Game and Event row carries its Athlete's Owner, whoever recorded it, so the same-owner keys from ADR 0003 stay. Games also record which account recorded them (the Recorder's), and only that account adds Events to the Game, so ADR 0001's one Recorder per Game holds on the server too.
- Members' Games reach other phones by download on launch and reconnect, not live. One Recorder per Game means downloads never conflict with local Events.
- When an Owner deletes their account, each shared Athlete passes to the Member who joined first. Moving ownership is the one change only the server makes: a single step re-owns the Athlete, its Games and its Events together. Event contents never change, and users still can't update Events. Only Athletes with no Members are deleted.
- When a Member deletes their account, the Games they recorded stay with the Athlete; only their "recorded by" link is cleared.
