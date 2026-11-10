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

## Sakura Fortune Deluxe game integration

- [x] Add the supplied Sakura Fortune HTML game to the project as a dedicated `/sakura-fortune` game page, with a lobby return action.
- [x] Add a Sakura Fortune game card to the existing game lobby so players can open the new page.
- [x] Include the supplied game's required images as static assets with responsive scaling.
- [x] Add the new game page to `public/manus-routes.json`; run affected checks and commit/push the implementation to `origin/main`.

## Sakura Fortune MMK wallet and RTP

- [x] Derive the player only from the signed server session; charge the selected whole-MMK stake and credit server-calculated winnings atomically, using server-side randomness/paytable and a per-account idempotency key so retries cannot double-debit or double-credit.
- [x] Persist and consume free-spin entitlement server-side; award at most five free spins from a paid spin, do not retrigger from free spins, preserve the originating stake for free spins, and never make reset alter wallet funds.
- [x] Keep the internal long-run RTP model at 80%, including cascade × multipliers, paid-spin cascades, free-spin winnings, whole-MMK rounding, and payout caps; treat it as an aggregate model target, not an individual-spin promise.
- [x] Remove client-authoritative balance/outcome and local demo reset; display MMK and server-returned balance/result. The compiled API was tested against temporary local SQLite data for settlement, retries, free spins, cross-origin rejection, and insufficient funds; no production wallet was accessed.

## Sakura free-spin collection, bet levels, and lobby art

- [x] Accumulate free-spin winnings without adding them to the wallet after each free spin. After all free spins finish, show one BIG WIN or MEGA WIN summary, then credit the accumulated winnings once with a visible balance/coin animation. Persist the pending amount and make collection retry-safe so closing or refreshing cannot lose or duplicate the award.
- [x] Offer only these whole-MMK bet steps, starting at 20 MMK: 20, 50, 100, 300, 500, 1,000, 3,000, 5,000. Each + or − press changes one step; the selected free-spin stake remains the stake from its triggering paid spin.
- [x] Generate a new Sakura Fortune portrait lobby image matching the game art and use it in the main game-selection lobby instead of the generic wide header image.
- [x] Keep server/session implementation details out of all player-facing text; verify the new collection flow and all eight stake steps against an isolated local wallet and confirm the generated image is served from the production-style output.

## Sakura suspenseful reel animation

- [x] Make the reels spin at a more deliberate pace, decelerate in stages, and stop one column at a time with a longer final-reel pause to build anticipation. Keep the visuals starting immediately and do not change or delay the game outcome or wallet settlement.

## Sakura spin response speed

- [x] Reduce repeated database connection and schema/migration work on spin requests while keeping authenticated identity, atomic wallet settlement, idempotent replay protection, and server-side outcomes unchanged.

## Sakura player-facing copy and admin RTP controls

- [x] Remove all RTP labels/percentages and any player-facing text that says a spin is being checked or confirmed by the server. Start the reel animation immediately on tap; keep the final outcome, payout, and wallet changes server-authoritative.
- [x] Let authenticated admins change Sakura Fortune RTP only from the admin dashboard. Accept whole-number percentages from 50 through 95, default to 80%, persist the setting, and apply it in server payout calculations without returning it in player-facing API responses.
- [x] Ensure the standalone production output includes the public game HTML and artwork; verify the deployed-style server returns the game page and image assets successfully.
