# Everyone signs in with an emailed code, once per phone

A person signs in before they can add an Athlete, with a 6-digit code emailed to their address. One screen serves new and returning people, and typing the code is the only verification: there are no passwords and no link in the email. This replaces "no account until the first Game ends". Games no longer live only on a phone that can be lost, and a returning parent gets their Athletes back straight away. The price is that a phone's first launch needs signal.

## Considered Options

- **Optional sign-in, saving the first Game afterwards** (the original plan): nothing stands between opening the app and recording, but a lost phone takes its unsaved Games with it, and a new phone cannot sign in until it has an Athlete and a Game.
- **Password plus a verification email**: a familiar shape, but it adds separate sign-up and login forms, a forgotten-password flow, and a second proof of the same inbox.
- **Emailed link as well as the code**: on iPhone the home-screen app and Safari do not share storage, so the link signs in Safari and leaves the installed app signed out.

## Consequences

- After sign-in the app works offline. The phone remembers its Account locally, so an expired or unreachable session never stops a Recorder recording.
- A phone stays signed in until Sign out or until the server ends its session. When the server ends it, the phone keeps recording and accepts only the same email, because rows stamped with one Account cannot upload as another.
- Sign out needs signal and nothing waiting to upload. It clears the phone, including photos, which exist nowhere else.
- A phone already holding rows with no Account gets the sign-in screen at its next launch, unless a Game is live, and uploads them after sign-in.
- Automated checks of the deployed site stop at the sign-in screen, since they have no inbox. Offline recording is tested on localhost only.
- Sign-in depends on email reaching families, so a real sign-in from a new address outside the Supabase team has to pass before release.
