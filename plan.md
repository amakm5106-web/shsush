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


## Buffalo Game UI/UX and visual feedback

### Implementation approach

- Keep `components/BuffaloSlotGame.tsx` as the owner of the existing game state and spin flow. Treat all work in this request as presentation and interaction improvements; do not alter outcome generation, RTP/odds, bet options, wager deductions, payout/balance calculations, authentication, Firestore/API calls, or result persistence.
- Keep the existing dark obsidian and amber-gold Charge Buffalo visual language. From the player's Buffalo-entry gesture, request fullscreen and landscape orientation; if the browser/device cannot lock orientation, automatically use the CSS-rotated landscape fallback. On exit, release the orientation lock and fullscreen so the lobby returns to its normal view.
- Add a small, isolated Buffalo result-effects layer under `components/buffalo/` that receives existing spin/result/free-spin state and renders only visual feedback. Use generated transparent gold-coin/energy VFX art under `public/assets/slot-vfx/`; keep the reel outcome and payout state as the sole source of truth.
- Consolidate repeated modal semantics into a reusable accessible Buffalo dialog wrapper under `components/buffalo/` where practical. Scope responsive and animation rules to the Buffalo game in `app/globals.css`; retain the existing parent mount and callbacks in `app/page.tsx`.

### Design

- **Design movement:** premium obsidian-and-amber casino arcade, continuing the existing Charge Buffalo art direction.
- **Core principles:** keep the 6×4 reels dominant; make each wager's cost and action state explicit; keep result feedback visible and readable; use purposeful, short motion rather than constant decoration.
- **Color philosophy:** charcoal/black surfaces protect reel contrast; amber/gold marks stakes, wins, and primary actions; use distinct, non-color-only labels for closed, insufficient-balance, win, and free-spin states.
- **Layout paradigm:** enter an immersive fullscreen arena and request landscape on Buffalo entry; use an automatic CSS-rotated landscape fallback on devices that reject orientation locking, then restore the regular lobby view on exit.
- **Signature elements:** a generated translucent gold-coin burst beneath resolved results; restrained glow/bounce on winning symbols; a concise, high-contrast result rail.
- **Interaction philosophy:** use the Buffalo-entry tap to request fullscreen/orientation, handle unsupported or rejected APIs without blocking play, and release immersive state on exit; show why an action is unavailable; surface current bet and available balance together; keep Auto Spin and Buy Bonus terms visible before confirmation; make modal actions keyboard and touch accessible.
- **Animation:** staggered reel motion remains untouched; add a short result-drop/landing response, particle/coin burst on existing win states, and a reduced-motion alternative. Avoid obstructing symbols or triggering animation when there is no corresponding result.
- **Typography:** reuse current system sans for labels and tabular monospace for Ks values; preserve readable sizes at phone widths and short landscape heights.
- **Brand essence:** a bold, clear Charge Buffalo slot arcade for mobile and desktop players; energetic, legible, trustworthy.
- **Brand voice:** short Burmese state messages that explain the next action, such as “လောင်းကြေး မလုံလောက်ပါ — Wallet ကို ကြည့်ပါ” and “အနိုင်ရရလဒ်ကို အပေါ်ဘက် Balance တွင် စစ်ဆေးပါ”.

### Buffalo project structure

- `components/BuffaloSlotGame.tsx`: existing gameplay state and primary arena/control integration; visual changes only.
- `components/buffalo/BuffaloDialog.tsx`: shared accessible dialog shell for Buffalo modals.
- `components/buffalo/BuffaloResultEffects.tsx`: presentational result and coin effects driven by existing results.
- `components/BuffaloBigWinModal.tsx` and `components/BuffaloSymbolImage.tsx`: retain existing award/symbol rendering while improving presentation/accessibility where needed.
- `app/globals.css`: responsive breakpoints, reduced-motion behavior, and game-scoped effect animations.
- `public/assets/slot-vfx/`: generated transparent Buffalo result-effects images.
- `app/page.tsx`: continue using the existing Buffalo mount and callbacks without changing backend behavior.

## Sakura Fortune Deluxe game integration

- Preserve the supplied HTML design and embedded WebP artwork in `public/games/sakura-fortune/index.html`, while replacing its browser-owned demo balance, outcome, and reset logic with the authenticated server API. Keep the assets as separate static files under `public/games/sakura-fortune/assets/`.
- Add `/sakura-fortune` as a mobile-responsive full-screen page hosting the game UI in an iframe, with a visible return-to-lobby action. Add a Sakura Fortune poster card to the existing lobby and register the new route in `public/manus-routes.json`.
- Replace the demo-credit-only behavior with authenticated MMK wallet wagers, but never trust browser-provided balance, outcome, or payout. Use the signed Turso account session and server-side CSPRNG/paytable; settle debit, payout, round record, and persistent free-spin entitlement in one write transaction with a per-user idempotency key.
- For a reverse proxy that rewrites the public host, set `SAKURA_ALLOWED_ORIGIN` to the site's canonical origin; do not trust client-supplied forwarded-host/proto headers for the spin origin check.
- Because this app uses Next.js standalone output, copy `public/` and `.next/static/` into `.next/standalone/` during the build so the embedded game HTML and image files are present when the standalone server starts.
- Keep the default theoretical long-run RTP at 80%, measured as paid and free-spin payouts divided by paid wagers, including cascade × progression, whole-kyat rounding, and payout caps. Allow authenticated admins to change the integer percentage from 50 through 95 in the admin dashboard; persist it and apply it server-side, without including the RTP setting in player-facing API responses.
- Bound free-spin awards to at most five per paid spin and do not allow free-spin retriggers; free spins use the originating paid stake and multiplier ×2 per free spin, without another cash debit. Reset must never alter wallet funds. The player UI must not show RTP labels/percentages or text about server-side checking/confirmation; start reel animation immediately while keeping all money-relevant outcomes server-authoritative.
- If simulation cannot substantiate the target or live settlement cannot be proven idempotent/atomic, keep real-money spins disabled rather than fall back to client-side demo outcomes.
- Validation: a deterministic simulator calls the same TypeScript outcome engine for 1,000,000 paid rounds at each permitted MMK bet. It includes paid-spin payout, up to five non-retriggering free spins, all cascade multipliers, whole-kyat rounding, and payout caps. The final observed RTP estimates were 79.776% (10), 80.258% (20), 79.833% (40), 80.318% (80), 80.417% (160), 79.766% (320), and 79.996% (500 MMK). These are per-step Monte Carlo estimates, not a guarantee for any player or individual spin. A separate local-only API test verified debit/credit, same-key replay, free-spin stake retention, origin rejection, and insufficient-fund rejection against a temporary SQLite database.
