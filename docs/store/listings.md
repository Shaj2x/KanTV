> **DRAFT.** Store text for the KanTV phone app (Google Play, App Store) and the KanTV TV home screen (Google
> Play for Android TV). Character limits are noted; prices and links in brackets. The privacy answers must match
> `docs/legal/privacy-policy.md` and what the shipped build actually does.

# Phone app: KanTV

## Google Play

**Title** (30): `KanTV: Clean & Redesign My TV`

**Short description** (80): `Remove TV ads and junk, get a clean home screen, design it with AI. Free undo.`

**Full description** (4000):

> Your Android TV or Google TV, without the ads.
>
> KanTV walks you through cleaning up your TV from your phone. No computer and no cables, just your phone, your
> TV remote and about ten minutes.
>
> CLEAN UP YOUR TV
> • Turns off sponsored rows, ad services, data collection and preinstalled apps you never asked for
> • Uses lists tested on real TVs: more than 380 models from over 100 brands
> • Asks before touching anything you might use, like casting or your streaming apps
> • Safety checks keep everything your TV needs: HDMI inputs, Settings, Wi-Fi, the home screen
> • Nothing is uninstalled. One tap puts everything back, free, forever
>
> A HOME SCREEN THAT'S YOURS
> • Replace the cluttered home screen with KanTV's clean one
> • Describe the look you want, like "dark and minimal, big clock, Netflix and YouTube up front, warm colours",
>   and KanTV's AI designer builds it
> • See it on a TV-shaped preview before it goes on your TV
> • Try another take any time; your designs are saved
>
> YOUR PHONE IS THE REMOTE
> • D-pad, OK, back, home, volume and typing, so you never type a password with the arrows again
>
> SAFE BY DESIGN
> • Setup switches the TV's debugging off again when it's done, and checks that it really is off
> • Your TV's serial number never leaves your phone
>
> Free for 7 days with everything included. Then [price]/month or [price]/year for the AI designer and your
> custom look. Restore is always free.
>
> Works with Android TV and Google TV (Sony, TCL, Hisense, Xiaomi, Philips, Chromecast with Google TV, Google TV
> Streamer and many more). Fire TV: cleanup only. Not for Samsung, LG or Roku TVs.
>
> KanTV builds on the open-source cleanyourtv project and is not affiliated with any TV maker.

**Category:** Tools (or Video Players & Editors) · **Content rating:** Everyone · **Contains ads:** No ·
**In-app purchases:** Yes

### Data safety form

| Question | Answer |
|---|---|
| Collects or shares data | Collects; does not share for advertising. Service providers are not "sharing" under Play's definition |
| Encrypted in transit | Yes (HTTPS) |
| Users can request deletion | Yes, in the app and at [link] |
| Personal info → Email address | Collected (through the sign-in provider), required, purpose: Account management |
| Personal info → User IDs | Collected, required, purposes: Account management, Fraud prevention (one free trial per TV) |
| Device or other IDs | Collected as one-way keyed hashes of the TV's serial and Android ID, required, purpose: Fraud prevention |
| App activity → Other user-generated content | Design requests: collected, optional, purpose: App functionality |
| App info and performance → Diagnostics | Server logs: collected, purpose: Analytics/Security [match the final logging setup] |
| Financial info → Purchase history | Subscription status via RevenueCat: collected, purpose: App functionality |
| Location, contacts, photos, messages, audio | Not collected |

### Permissions to explain in the listing / review

- **Local network access:** to find and control your TV on your Wi-Fi.
- **Android debugging (ADB) and Wireless debugging pairing:** the TV's own developer feature, which the user
  switches on and allows, used to turn off apps, install the home screen and undo it all; switched off again at
  the end of setup.

## App Store

**Name** (30): `KanTV: TV Cleanup & Designer` · **Subtitle** (30): `Ad-free, AI-designed Google TV`

**Promotional text** (170): `Turn off the ads on your Android TV or Google TV, give it a clean home screen, and design the look with AI, all from your iPhone. One tap undoes everything.`

**Keywords** (100): `android tv,google tv,remote,ads,debloat,home screen,launcher,chromecast,clean,theme,ai design`

**Description:** as the Play full description, with "iPhone" for "phone".

### App Privacy ("nutrition label")

| Data type | Linked to user | Used for tracking | Purpose |
|---|---|---|---|
| Contact info: Email address | Yes | No | App functionality (account) |
| Identifiers: User ID | Yes | No | App functionality |
| Identifiers: Device ID (hashed TV identifiers) | Yes | No | App functionality (one free trial per TV) |
| User content: Other (design requests) | Yes | No | App functionality |
| Purchases: Purchase history | Yes | No | App functionality |
| Diagnostics | No | No | App functionality [match the final logging setup] |

### Notes for App Review

> KanTV controls the user's own Android TV / Google TV on their home Wi-Fi. The user switches on the TV's
> built-in developer option ("USB/Wireless debugging"), and the TV asks them to allow this iPhone. KanTV then
> uses that channel (the standard Android Debug Bridge protocol) to turn off preinstalled apps and to install
> and set the KanTV home screen; it switches debugging off again when setup ends. The remote uses Google's
> Android TV Remote protocol, paired with a code shown on the TV. No code is downloaded or executed on the
> iPhone. Local network access is requested only to reach the TV. A demo video of the full flow on a real TV is
> at [link]. Test account: [email / password]. Subscriptions are sold through In-App Purchase.

# TV app: KanTV Home (Google Play for Android TV)

**Title** (30): `KanTV Home` · **Short description** (80): `A clean, fast home screen for Android TV. Set up and styled from the KanTV app.`

**Full description:**

> KanTV Home is a clean, fast home screen for Android TV and Google TV: your apps in a dock and a grid, a big
> clock, your HDMI inputs one press away, and no sponsored rows.
>
> Set it up and style it from the KanTV app on your phone: describe the look you want and KanTV's AI designer
> builds it. Works on TVs with as little as 1 GB of memory.
>
> Built on the open-source cleanyourtv launcher.

**Requirements:** Android TV 8.0 (API 26) or later; leanback (TV) only. **Category:** Tools.
**Data safety:** as the phone app, minus email; the home screen itself talks only to the phone (local network)
and to the KanTV backend to check the subscription pass.
