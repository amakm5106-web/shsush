# TODO

## Shared transaction contract and audit metadata

- [x] Add a canonical transaction lifecycle type and shared status-label helper so pending means စောင့်ဆိုင်းဆဲ, approved/completed means အောင်မြင်, declined/failed means ကျရှုံး, and refunded is explicit.
- [x] Extend deposit and withdrawal records with review time, reviewer, review note, completion time, external reference, and balance mutation metadata while preserving compatibility with existing Firestore documents.
- [x] Normalize bet history timestamps to `createdAt` everywhere the admin dashboard reads them.

## Complete admin account detail

- [x] When an admin opens a user account, show the account’s full profile/contact/bank/risk information, current balances, cumulative deposit/withdrawal/bet totals, and account timestamps.
- [x] Show the full available deposit, withdrawal, and betting history for that user rather than only the latest five rows, with IDs, amounts, method, timestamps, review metadata, and status.
- [x] Keep approval and rejection actions idempotent and visible with clear success/failure feedback.

## User-facing transaction history and visual system

- [x] Apply the same status vocabulary to wallet deposit and withdrawal history, including declined withdrawal reasons and completion/review timestamps.
- [x] Refine the admin console and shared surfaces for a clean, legible responsive UI with compact line icons, accessible action titles, restrained motion, and clear status chips.

## Dice Game bet confirmation

- [x] When a player selects any quick, color, or exact-number bet option, show a responsive premium confirmation dialog with the selected bet type and choice, round, stake, current balance, balance after the stake, multiplier, and estimated payout/profit using the existing settlement formula; provide clear Confirm and Cancel actions.
- [x] Confirm calls the existing `onPlaceBet` handler exactly once with the captured bet values; Cancel closes the dialog without calling placement or changing balance, bet records, or settlement logic. Keep the existing minimum-bet, insufficient-balance, authentication, anti-bot, anti-hedging, and round validation in the existing handler.

## Verification

- [x] Run lint and production build; resolve actionable errors.
- [x] Confirm the route manifest exists and matches the application routes.
- [x] Commit and push the completed implementation to `origin/main`.
