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

## Buffalo supplied Cocos game and MMK wallet replacement

- [x] Replace the approximate React slot presentation with the complete supplied Cocos HTML and its bundled original visuals/animations.
- [x] Remove the Cocos/provider's second Login screen on the first and subsequent entries. Use only the authenticated Xsite/Shsush parent session; do not call provider Guest registration, write provider `userData`, inject provider credentials, a fake player identity (the Cocos compatibility ID remains anonymous `0`), demo credit, or mock outcomes.
- [x] Remove the embedded Youmegame.com splash/progress cover and keep the Cocos canvas visible while initialization continues; treat a provider `LobbyMain`/Login screen as incomplete startup rather than a successfully opened Buffalo game.
- [x] Implement authenticated server settlement for paid/free spins with legal stake validation, saved free spins, idempotent retries using the same request ID, and server-generated outcomes; persist the pending request before calling the API, reconcile ambiguous responses before another debit, and refuse spins if recovery storage is unavailable.
- [x] Keep `LoginGame` as a wallet-gated, anonymous Cocos readiness handshake only; source `LoginfreeCount` from the authenticated parent wallet state, and route `lottery` requests/results exclusively through the authenticated MMK server bridge. The game must render server-returned spin outcomes and must not fall back to demo balance/results.
- [x] Validate the Cocos-to-host bridge and packaged source, run lint/production build, and push the completed fix to GitHub without touching a live account balance.

## Buffalo scatter and admin RTP control

- [x] A spin (paid or Free Spin) with at least 3 Scatters awards exactly 3 Free Spins; Free Spin retriggers inherit the original paid feature's RTP snapshot.
- [x] Add a server-validated, admin-only Buffalo RTP setting: default 80%, integer 50–95%, stored in `settings` and editable beside Sakura RTP.
- [x] Define RTP as all paid/free payouts divided by paid MMK stake; calibrate every legal stake so the setting changes actual server payouts, not only a displayed percentage.
- [x] Snapshot the RTP target for a paid round and its Free Spins; record applied RTP/math version per spin; remove loss-streak-dependent odds.

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

## Admin daily deposit bonus

- [x] In the dedicated admin dashboard, let authenticated admins set a whole-number daily deposit bonus percentage from 0% to 100%, defaulting to 0%; when approving deposits, apply the configured percentage to at most the first approved deposit per user per Myanmar calendar day, using the deposit request's date.
- [x] Credit the deposit and its bonus together in one idempotent database transaction, record the applied rate/amount/day in an audit ledger, and show the bonus amount in the admin approval result. Do not change existing deposit amounts or award a second bonus that day.

## Admin dashboard pages and navigation

- [x] Split the dedicated admin dashboard into actual overview, users, deposits, withdrawals, and settings/promotions routes; make navigation buttons prominent and show the current section.
- [x] Provide a visible back-to-overview button on every subpage that works after direct URL access as well as normal navigation, while preserving the existing admin login/session checks.
- [x] Register all added admin page routes in the route manifest; preserve existing queue, user search, account detail, approval and rejection actions.

## Sakura suspenseful reel animation

- [x] Start the reel animation immediately and make symbols land faster with shorter stagger between columns and rows. Keep optional TURBO mode; do not change game outcomes or wallet settlement.

## Sakura spin response speed

- [x] Reduce repeated database connection and schema/migration work on spin requests while keeping authenticated identity, atomic wallet settlement, idempotent replay protection, and server-side outcomes unchanged.

## Sakura player-facing copy and admin RTP controls

- [x] Remove all RTP labels/percentages and any player-facing text that says a spin is being checked or confirmed by the server. Start the reel animation immediately on tap; keep the final outcome, payout, and wallet changes server-authoritative.
- [x] Let authenticated admins change Sakura Fortune RTP only from the admin dashboard. Accept whole-number percentages from 50 through 95, default to 80%, persist the setting, and apply it in server payout calculations without returning it in player-facing API responses.
- [x] Ensure the standalone production output includes the public game HTML and artwork; verify the deployed-style server returns the game page and image assets successfully.


## Premium light casino UI redesign

- [x] Apply a consistent premium light theme across the existing player experience: soft pearl-white and cool-gray surfaces, charcoal text, restrained champagne-gold accents, refined borders/shadows, rounded cards, professional typography, and consistent Lucide line icons; do not use emoji as interface icons or invent unsupported application pages.
- [x] Add a responsive casino navigation and lightweight header with working search, notification state, profile/avatar and actual signed-in status, wallet balance from existing account data, and deposit action. Desktop sidebar is collapsible; smaller screens use a polished mobile navigation with usable touch targets and no horizontal overflow. Keep navigation limited to existing application functionality.
- [x] Improve the dashboard and lobby with accurate account data only; include applicable balance, successful deposit totals, approved-withdrawal count, latest real deposit/withdrawal records, session-scoped recently played games, existing promotional/game artwork, category filtering, search, favorites, recent synchronized round history, and clear empty states. Do not invent balances, transactions, winners, or promotion amounts.
- [x] Upgrade the presentation of the existing Buffalo, Live Dice, Deep Sea Catch and Sakura Fortune cards using the project's real artwork, consistent proportions, refined hover/focus states, and keyboard-accessible actions. Preserve each game's actual mechanics, odds, RTP, betting/wallet calculations, APIs, authentication, and integrations.
- [x] Preserve all existing routes, working authentication, wallet/deposit/withdrawal/transaction history, rewards/referral, profile and admin flows. Use responsive layouts and restrained transitions; do not interfere with gameplay.
- [x] Run the existing lint and production-build commands; fix regressions attributable to this redesign and report any pre-existing check failures separately.


## Pearl glass UI/UX across non-game pages

- [x] Use the supplied dashboard image only as a light-color/material reference (pearl white, cool light gray, subtle glass, fine borders, soft shadow, restrained champagne-gold accent); do not copy its dashboard layout, add a large dashboard, charts, metric panels, or new pages.
- [x] Apply one responsive visual language to all existing non-game player views: lobby, wallet deposit/withdrawal/referral transfer, transaction history, profile/bet history, referral/rewards, notifications, navigation, forms, empty states, and dialogs; preserve each view's current information architecture and working behavior.
- [x] Carry the light visual treatment through the existing admin login, overview, users, deposits, withdrawals, and settings pages without adding admin widgets or changing authorization, route, review, account-adjustment, or setting-save behavior.
- [x] Leave the live dice, Buffalo, fishing, and Sakura Fortune game screens/embeds, game art, odds, RTP, settlement, wallet calculations, and gameplay behavior unchanged.
- [x] Keep text/control contrast, keyboard focus, accessible targets, mobile spacing, and horizontal overflow in check across non-game views; keep all existing routes and data sourced from the existing application.
- [x] Run existing lint and production build, review the rendered non-game screens, then commit/push only the intended UI changes to `origin/main`.


### QA evidence for Pearl-glass UI pass

- Browser-checked the lobby, wallet, referral/rewards, guest profile, sign-in modal, admin login, and referral QR dialog; the QR dialog stays centered and spans the viewport.
- A temporary 390px mobile viewport reported no horizontal overflow in the lobby, wallet, referral, or profile views; the QR dialog bounds remained inside the viewport.
- `npm run lint` completed with 0 errors (18 warnings) and `npm run build` completed successfully; existing routes/game assets were preserved.


## Strict iOS Gray-Light glass pass

- [x] Restyle every existing non-game player view, administrator route, and 404 fallback using the reference only as a material/color cue; do not add a new dashboard, widgets, metrics, charts, or routes.
- [x] Use only white, black, and neutral grays for UI surfaces, text, borders, actions, selected states, and statuses; keep a restrained iOS-style translucent glass treatment with soft shadows and thin borders.
- [x] Remove gold/saturated color accents, decorative radial gradients, glowing dots, bulbs/orbs, and lighting decorations from non-game UI.
- [x] Use PNG assets where existing assets fit and monochrome line-action icons for icon controls; remove emoji, colorful glyphs, and filled pictograms from icon buttons while keeping labels and actions clear.
- [x] Preserve every existing non-game route, layout structure, data source, form, payment/admin/referral behavior and responsive navigation; do not change game pages, embeds, game artwork, odds, RTP, settlement, wallet calculations, or gameplay behavior.
- [x] Validate the production build, lint, desktop rendering, 390px horizontal overflow, and confirm the changed-file list contains no game implementation files.


### Final iOS Gray-Light QA evidence

- The final production preview was checked on the lobby, compact wallet-information banner, wallet, referral and QR dialog, guest profile/sign-in, administrator login, and 404 fallback.
- The 390px test frame showed no horizontal overflow on lobby, wallet, referral, or profile; the referral QR dialog stayed inside the viewport.
- `npm run lint` completed with 0 errors and 18 warnings; the final `npm run build` completed successfully.
- The working diff contains no game implementation paths; gameplay toast markup, game posters, and game behavior remain unchanged.


## Profile page and Customer Service refinement

- [x] Improve the existing guest and signed-in profile layouts with clearer identity, action, VIP-progress, linked-account, and bet-history hierarchy; keep the current data, actions, and mobile behavior, and do not add dashboard widgets or invented metrics.
- [x] Restyle all visible CS/Customer Service buttons and profile links as restrained translucent white/gray glass with monochrome line icons; remove disliked accent colors while preserving the existing Telegram destinations, labels, and click behavior.
- [x] Keep every game page and game-only UI untouched; validate the profile at desktop and 390px mobile width, then push only the focused UI changes to `origin/main`.


### Profile/CS QA

- The refreshed guest profile was visually reviewed; the CS Bot header and floating controls both compute to translucent white with neutral charcoal text/borders.
- A 390px mobile preview reported no horizontal overflow; the profile card and sign-in CTA stayed within the viewport.
- `npm run lint` completed with 0 errors (17 warnings), and `npm run build` completed successfully.


## iOS Liquid Glass hierarchy and text containment

- [x] Make the existing casino UI feel closer to current iOS Liquid Glass: create a distinct floating frosted layer for sidebars, top/search/navigation bars, icon controls, popovers, and transient actions; keep forms, wallet balances, bet records, headings, and other reading content on clearer neutral standard-material surfaces. Use glass selectively, not as a blur on every card, and do not add an iOS-style dashboard or new routes.
- [x] Keep the established white/black/neutral-gray palette and the existing non-game functionality; use adaptive blur, thin inner-edge highlights, refined continuous rounded corners, careful spacing, and restrained interaction feedback without introducing color accents, glowing dots/orbs, or game-page changes.
- [x] Keep every visible string within its own card, input, button, dialog, and viewport, including long Burmese copy, usernames, email/UID, referral links, transaction details, and action labels. Allow long text to wrap, shrink flex/grid children safely, preserve readable line-height and padding, avoid clipped text and accidental horizontal overflow, and reflow at 390px mobile width.
- [x] Validate the player views and existing admin/404 surfaces at desktop and 390px widths; keep gameplay pages untouched and push the focused UI changes to `origin/main` (confirmed at commit `f1c6466`).


### Final iOS Liquid Glass QA evidence

- At a 390px test-frame width, the lobby, Wallet, Referral, guest Profile, Auth modal, admin login and 404 page reported no document horizontal overflow. Visible text/control bounds remained inside their surfaces.
- The 72-character referral URL stayed within its read-only input and Copy action; no text-range overflow was measured inside the Referral view. The QR dialog measured 343×441px at x=16..359 and y=230..670, fully inside the mobile viewport. The Auth modal measured 366px wide at x=12..378 and stayed centered within the viewport.
- Desktop views were reviewed for the lobby, Referral and administrator login. Existing Apple Materials and Liquid Glass source links remain documented in `plan.md`.
- Replaced the remaining Referral transfer hourglass glyph with a monochrome Lucide `RefreshCw` line icon; a pictograph scan of non-game components returned no matches.
- `npm run lint` completed with 0 errors (17 warnings); `npm run build` completed successfully. The route manifest parsed and contained 7 routes; `git diff --check` passed.
- The only changed code paths are `app/globals.css` and `components/views/ReferralView.tsx`; no game implementation files or gameplay logic changed.
