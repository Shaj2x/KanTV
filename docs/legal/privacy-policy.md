> **DRAFT for legal review.** Written from what the KanTV code actually does (November 2026). Fill in the
> bracketed parts, have a lawyer check it for each country you sell in (GDPR/UK GDPR, CCPA/CPRA and others),
> and update it whenever what the app collects changes. Items marked *[when built]* describe features that
> are planned but not in the app yet: remove them, or ship the feature, before publishing.

# KanTV Privacy Policy

*Last updated: [date]*

KanTV ("we") is provided by [Company legal name], [address]. Contact: [privacy contact email].

KanTV helps you clean up your Android TV or Google TV, replace its home screen, design that home screen with
AI, and control the TV from your phone. This policy explains what we collect, why, and the choices you have.

## The short version

- What we do to your TV happens between your phone and your TV, on your home network.
- We never receive your TV's serial number or Android ID. Your phone turns them into one-way codes first.
- What you type into the AI designer is sent to our AI provider to make your design.
- We don't sell your data and we don't show ads.

## What we collect and why

| What | Why | Where it's kept |
|---|---|---|
| **Account ID** from the sign-in service you use (and the email address it holds) | To sign you in and keep your designs and subscription with you | Our sign-in provider; our database stores only the ID |
| **One-way codes made from your TV's serial number and Android ID.** Your phone computes a SHA-256 hash, and we store a keyed hash (HMAC) of that | So each TV gets one free trial, and the trial isn't restarted by new accounts or a factory reset | Our database |
| **Your TV's make and model** (for example "Google Chromecast") | To show your TVs in the app and pick the right cleanup list | Our database |
| **What you ask the AI designer**, the design it returns, and the names of the streaming apps on your TV that could go in the dock (for example Netflix, YouTube) | To make your design and keep a history of your designs | Our database; sent to our AI provider to make each design |
| **Subscription status** (store, plan, renewal date) | To unlock paid features | RevenueCat and our database |
| **Technical logs** (IP address, time, request) | Security and fixing problems | Our hosting provider, kept [30] days |

### What stays on your phone or your TV

- The connection to your TV (Android debugging and the TV remote) runs on your home network, directly between
  your phone and your TV.
- The full list of apps on your TV, and the record of what KanTV turned off (your "restore point"), stay on
  your phone. *[when built: a copy of your restore point is kept with your account, so a new phone can restore
  your TV.]*
- The security key your phone uses to talk to your TV stays in your phone's secure key storage.

## AI processing

When you design a home screen, your request, the design history we use to avoid repeating designs, and the
names of the streaming apps on your TV are sent to **Anthropic** (the maker of Claude), which generates the
design. Anthropic processes this under its commercial terms for API customers. [Confirm current terms before
publishing: data retention period and whether API inputs are used for model training.] Please don't put
personal information in design requests.

## Who we share data with

Only service providers who run parts of KanTV for us, under contract:

| Provider | What for |
|---|---|
| [Hosting provider], [database provider] | Running our servers and database |
| [Sign-in provider] | Accounts and sign-in |
| RevenueCat; Apple, Google and Stripe | Subscriptions and payments (we never see your card details) |
| Anthropic | Making AI designs |

We share data with authorities only when the law requires it. If KanTV is sold or merged, this policy goes with
it and we'll tell you.

## How long we keep it

- Account, designs and TV list: until you delete your account.
- **One-way TV codes and the date a TV's free trial started:** kept after you delete your account, no longer
  linked to it, so a free trial can't be restarted by deleting and signing up again. They can't be turned back
  into your serial number or Android ID.
- Logs: [30] days.

## Your choices and rights

- **Download your data:** in the app, [Settings → Download my data].
- **Delete your account:** in the app, [Settings → Delete account]. This removes your account, your designs and
  your TV list.
- **Restore your TV:** the app can always undo its changes to your TV, free, with or without an account.
- Depending on where you live you may have the right to access, correct, delete or move your data, and to object
  to or restrict processing. Contact [privacy contact email]. You can also complain to your data protection
  authority.

Our legal bases (EU/UK): performing our contract with you (account, designs, subscriptions), legitimate
interests (one free trial per TV, security), and consent where we ask for it.

## Children

KanTV isn't directed at children under 13 [16 in some countries], and we don't knowingly collect their data.

## International transfers

Our providers may process data outside your country, including in the United States, under safeguards such as
the EU Standard Contractual Clauses.

## Changes

We'll update this page and, for important changes, tell you in the app.
