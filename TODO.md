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

## Buffalo Game UI/UX and result effects

- [x] Keep the existing spin outcomes, odds, bet options, wager deductions, payout/balance calculations, authentication, API/Firestore behavior, and result persistence unchanged; make only UI, interaction, and visual-effect improvements.
- [x] When the player enters Buffalo, request fullscreen and landscape orientation automatically from the entry tap; if the browser/device rejects orientation lock, rotate the game into landscape with CSS while keeping reels and controls usable. When the player exits Buffalo, unlock orientation and leave fullscreen so the app returns to its normal view.
- [x] Make current balance, stake and SPIN action state clear; explain insufficient balance and login requirements; remove duplicate status/bonus controls where appropriate; show Auto Spin count and Buy Bonus cost beside available/remaining balance without changing their existing terms; during Free Spins state that the spin costs Ks 0 and the displayed bet is only the payout basis.
- [x] Add result/drop/landing animation and integrate generated transparent Buffalo VFX assets beneath resolved results; clearly distinguish win, no-win, free-spin, and payout-credit feedback while respecting reduced-motion preferences.
- [x] Make Buffalo dialogs and icon-only actions accessible by keyboard and assistive technology, and clarify loading and Big Win dismissal/credit messaging.

## Verification

- [x] Run lint and production build; resolve actionable errors.
- [x] Confirm the route manifest exists and matches the application routes.
- [x] Commit and push the completed implementation to `origin/main`.

## Sakura Fortune Deluxe demo integration

- [x] Add the supplied Sakura Fortune HTML game to the project as a dedicated `/sakura-fortune` game page, with a lobby return action.
- [x] Add a Sakura Fortune game card to the existing game lobby so players can open the new page.
- [x] Include the supplied game's required images as static assets with responsive scaling, and keep the demo-credit game separate from the real casino wallet.
- [ ] Add the new game page to `public/manus-routes.json`; run affected checks and commit/push the implementation to `origin/main`.
