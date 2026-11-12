# shsush Admin & UI/UX Overhaul

## Implementation approach

Improve the existing Firestore-backed application without introducing a second live source of truth. Add a canonical transaction status model and audit fields, preserve the existing atomic Firestore review handlers, and make every admin and user history view render the same lifecycle labels: pending, approved, completed, declined, and refunded. Expand the admin user explorer into a detailed account view with full deposit, withdrawal, and betting activity, balances, account metadata, risk flags, and review details. Refresh the admin shell and shared visual language with a clean dark finance-console treatment, compact line icons, stronger spacing, and readable status chips.

## Project structure

- `lib/types.ts`: shared transaction lifecycle, audit, and activity types.
- `app/page.tsx`: Firestore listeners, atomic review handlers, user activity loading, and transaction audit metadata.
- `components/AdminModal.tsx`: admin console navigation, queue cards, user account detail, full activity tables, and review status presentation.
- `components/views/WalletView.tsx`: user-facing deposit/withdrawal history status details.
- `app/globals.css`: admin console surface, status, table, and responsive utility styles.
- `public/manus-routes.json`: route manifest for `/`, `/phyophyolover`, and `/sakura-fortune`.

## Design

Candidate styles: editorial finance console (0.07), obsidian operations desk (0.06), quiet premium ledger (0.08). Chosen: **quiet premium ledger**.

- **Design movement:** restrained financial operations UI with dark graphite surfaces, one warm amber accent, and quiet emerald/red state colors.
- **Core principles:** data density without clutter; every action has a clear icon and tooltip; statuses are explicit; account context stays visible while reviewing records.
- **Color philosophy:** graphite and slate recede behind the data; amber marks attention and primary action; emerald means successful/completed; red means declined/failed/refunded; cyan is reserved for account detail and audit context.
- **Layout paradigm:** a fixed console shell with a slim navigation rail/header and stacked information panels; detail tables replace oversized decorative cards.
- **Signature elements:** compact line-icon action controls, status chips with icon + Burmese label, and monospaced IDs/amounts.
- **Interaction philosophy:** progressive disclosure—queue first, full account detail on demand, complete record history visible in a scrollable table rather than truncated previews.
- **Animation:** short 160–220ms transitions only for tab changes, review loading, and toast feedback; no decorative looping motion in data tables.
- **Typography:** system sans with Burmese fallback; tabular monospace for money, IDs, and timestamps.
- **Brand essence:** a clear, accountable gaming finance console for operators who need to act quickly and reconcile every kyat; precise, calm, dependable.
- **Brand voice:** concise operational Burmese such as “စောင့်ဆိုင်းဆဲ” and “မှတ်တမ်းအပြည့်အစုံ” rather than vague AI-style copy.

## Required outcomes

1. Admin can open a user account and see complete deposit, withdrawal, and betting records, totals, current balance, profile/contact/bound bank data, risk flags, and account timestamps.
2. Deposit and withdrawal records consistently show pending, approved/completed, declined/failed, and refunded semantics with visible review time and reason where available.
3. Review handlers retain atomic/idempotent behavior and record reviewer metadata where the active admin identity is available.
4. User-facing wallet history uses the same status vocabulary and shows rejection reasons for declined withdrawals.
5. Admin dashboard visual hierarchy is clearer, responsive on mobile, and uses line-action icons with accessible titles.
6. Existing lint and production build continue to pass.



## Buffalo Game UI/UX and MMK wallet integration

### Implementation approach

- Replace the former React-built slot with the complete supplied single-file Cocos Buffalo game, keeping its original scene, controls, symbols, motion, and visual assets intact.
- Host the game in an isolated iframe. Bridge only spin requests, result payloads, wallet state, and exit/navigation messages to the Shsush page; remove the standalone demo balance and fake result path.
- Settle MMK wagers and wins only through authenticated server routes and the Turso transaction ledger. The client never supplies a payout or outcome; the request is bound to the initiating user and uses a UUID idempotency key.
- Persist unresolved request IDs in shared browser storage, serialize same-account spins across tabs with the Web Locks API, retry only with the same ID, and block new debits whenever an earlier request or recovery record is uncertain. If storage or locking is unavailable, do not submit a wager.
- Keep the existing lobby entry/exit and wallet navigation. Do not update a cached profile balance until the server confirms settlement; do not apply a late result to a different signed-in account.

### Design

- **Design movement:** preserve the supplied Buffalo Cocos cabinet and full-screen game composition rather than approximating it with a React re-skin.
- **Core principles:** original 5×4 reels, scene art, CREDIT/BET/WIN meters, controls, and animations remain those of the attached game; Shsush supplies the authenticated MMK wallet and settlement boundary.
- **Color and layout:** retain the reference's western Buffalo scene, gold-framed reel cabinet, dark/red credit meters, and source control dock at its native 16:9 composition.
- **Interaction:** spins require an authenticated MMK account and valid server-approved stake. A recovered old spin is never misrepresented as a new request; a new tap does not create another debit while an earlier request is unresolved.
- **Failure behavior:** wallet state stays server-authoritative; insufficient funds opens the existing wallet view; network uncertainty, account changes, unreadable storage, or unavailable cross-tab locking fail closed.
- **Brand voice:** use concise Burmese status messages that explain when a spin is blocked, recovered, or requires the player to check the wallet.

### Buffalo project structure

- `public/games/buffalo/index.html`: the supplied self-contained Cocos Buffalo game and its original visuals/animations; replace its offline balance/result shim with the parent-wallet bridge.
- `components/BuffaloSlotGame.tsx`: isolated full-viewport host for the original game; accept only validated child spin requests and send server results back through `postMessage`.
- `app/api/buffalo/state/route.ts` and `app/api/buffalo/spin/route.ts`: authenticated, no-store MMK state and spin settlement endpoints with same-origin validation and idempotent requests.
- `lib/buffaloSlotServer.ts`: server-only random outcomes, the current Shsush Buffalo payout rules, legal stake validation, and lazy Buffalo ledger/state schema.
- `app/page.tsx`: mount the Cocos host and update the local profile cache only after the server confirms its transaction.
- The Cocos canvas owns the Buffalo visuals; remove the former React reel, custom Cocos-style CSS, and extracted duplicate sprites.

## Daily deposit bonus and dedicated admin dashboard

- Add a whole-number daily deposit bonus percentage setting from 0–100%, default 0%. Apply it only when an admin approves the first deposit for a given user and Myanmar calendar day; use the deposit request's `createdAt` date. Calculate the bonus as `floor(depositAmount × percent / 100)`.
- Record one unique `(userId, Myanmar dayKey)` claim with the applied percentage and bonus amount. In one database write transaction, claim the day, credit the deposit plus any bonus, update the deposit status, and write the audit record. Increment `totalSuccessfulDeposit` by the deposit amount alone. A zero setting adds no funds; later deposits that day receive no second daily bonus.
- Persist the rate in `settings` and expose it only through a `requireAdmin` API. Update deposit approval to use the configured rate and return the applied bonus amount to the admin UI. Preserve the existing signed admin session and ordinary deposit review flow.
- Keep `/phyophyolover` as the overview/login entry, and split users, deposits, withdrawals, and settings/promotions into actual routes sharing one authenticated dashboard shell. Use prominent active-state navigation links, add a reliable Back-to-overview link to every subpage, and register the routes in `public/manus-routes.json`.
- Keep the existing graphite/amber visual language; prioritize legible section buttons, clear action states, and useful spacing over decorative assets.
- `app/phyophyolover/_components/AdminDashboard.tsx`: shared authenticated shell, overview, section navigation, forms, and existing queue/account-detail behavior.
- `app/phyophyolover/{users,deposits,withdrawals,settings}/page.tsx`: route-specific dashboard pages.
- `app/api/admin/daily-deposit-bonus/route.ts`: authenticated rate read/write API; `app/api/admin/review/route.ts`: atomic daily claim and deposit-plus-bonus settlement.
- `lib/turso.ts`: daily bonus claim ledger schema; `public/manus-routes.json`: all dedicated admin route entries.
- Verification: production build passed; lint returned 0 errors and 19 existing warnings. Isolated SQLite tests verified a 0% default, rejected an out-of-range rate, saved 100% and 50%, credited 10,000 MMK on a 10,000-MMK first deposit and no second same-day bonus, then 2,500 MMK on a 5,000-MMK next-day deposit. Concurrent same-day approvals created one bonus claim only; cross-origin approval was rejected; all five dashboard routes returned HTTP 200. Tests used only temporary SQLite data and did not access production wallets.

## Sakura Fortune Deluxe game integration

- Preserve the supplied HTML design and embedded WebP artwork in `public/games/sakura-fortune/index.html`, while replacing its browser-owned demo balance, outcome, and reset logic with the authenticated server API. Keep the assets as separate static files under `public/games/sakura-fortune/assets/`.
- Add `/sakura-fortune` as a mobile-responsive full-screen page hosting the game UI in an iframe, with a visible return-to-lobby action. Add a Sakura Fortune poster card to the existing lobby and register the new route in `public/manus-routes.json`.
- Replace the demo-credit-only behavior with authenticated MMK wallet wagers, but never trust browser-provided balance, outcome, or payout. Use the signed Turso account session and server-side CSPRNG/paytable; settle debit, payout, round record, and persistent free-spin entitlement in one write transaction with a per-user idempotency key.
- Reuse the environment-configured Turso client in a warm server process and memoize Sakura schema/migration readiness per client, so later spins do not repeat connection creation, DDL batches, or migration checks. Clear failed readiness so a transient setup error can retry; never cache outcomes or wallet values.
- For a reverse proxy that rewrites the public host, set `SAKURA_ALLOWED_ORIGIN` to the site's canonical origin; do not trust client-supplied forwarded-host/proto headers for the spin origin check.
- Because this app uses Next.js standalone output, copy `public/` and `.next/static/` into `.next/standalone/` during the build so the embedded game HTML and image files are present when the standalone server starts.
- Keep the default theoretical long-run RTP at 80%, measured as paid and free-spin payouts divided by paid wagers, including cascade × progression, whole-kyat rounding, and payout caps. Allow authenticated admins to change the integer percentage from 50 through 95 in the admin dashboard; persist it and apply it server-side, without including the RTP setting in player-facing API responses.
- Bound free-spin awards to at most five per paid spin and do not allow free-spin retriggers; free spins use the originating paid stake and multiplier ×2 per free spin, without another cash debit. Reset must never alter wallet funds. The player UI must not show RTP labels/percentages or text about server-side checking/confirmation; start reel animation immediately while keeping all money-relevant outcomes server-authoritative.
- Make each normal reel spin about 7.5 seconds: use a slower visual roll, lengthen the stops progressively from the first to last column, stagger symbols as they land within each column, and leave a longer final-reel pause for anticipation. Start those visual effects immediately on tap; the optional TURBO mode remains separate. Timing is presentation-only and must not change the server outcome, wager, payout, or bonus collection.
- Hold every free-spin payout in durable per-player pending state rather than changing wallet balance after each free spin. After the final free spin, present one feature-total BIG WIN/MEGA WIN animation first, then collect and credit the full amount once; use a durable collection ID/ledger so refreshes and retries neither lose nor duplicate funds, and resume a pending presentation after reload. Keep all server/session details out of player-facing messages.
- Offer the exact stake ladder 20, 50, 100, 300, 500, 1,000, 3,000, and 5,000 MMK, defaulting to 20; +/− moves one permitted step and the server rejects all other stakes. A bonus keeps the originating paid stake.
- Generate and commit a new portrait Sakura Fortune lobby poster that matches the supplied game's art, and use it in the lobby card instead of the generic wide header artwork.
- If simulation cannot substantiate the target or live settlement cannot be proven idempotent/atomic, keep real-money spins disabled rather than fall back to client-side demo outcomes.
- Validation: a deterministic simulator calls the same TypeScript outcome engine for 1,000,000 paid rounds at each of the eight permitted MMK bets. It includes paid-spin payout, up to five non-retriggering free spins, all cascade multipliers, whole-kyat rounding, and payout caps. Observed estimates were 80.427% (20), 79.765% (50), 79.898% (100), 80.018% (300), 79.736% (500), 79.960% (1,000), 80.295% (3,000), and 80.373% (5,000 MMK). These are per-step Monte Carlo estimates, not a guarantee for any player or individual spin. Local-only API tests verified all wager steps, rejection of legacy paid stakes, existing free-spin stake compatibility, no wallet credit during individual free spins, final bonus collection and replay idempotency, cross-origin rejection, and successful standalone delivery of the game page/poster. All wallet tests used temporary SQLite data; no production wallet was accessed.
