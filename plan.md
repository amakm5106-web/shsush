# shsush Admin & UI/UX Overhaul

## Implementation approach

Improve the existing Firestore-backed application without introducing a second live source of truth. Add a canonical transaction status model and audit fields, preserve the existing atomic Firestore review handlers, and make every admin and user history view render the same lifecycle labels: pending, approved, completed, declined, and refunded. Expand the admin user explorer into a detailed account view with full deposit, withdrawal, and betting activity, balances, account metadata, risk flags, and review details. Refresh the admin shell and shared visual language with a clean dark finance-console treatment, compact line icons, stronger spacing, and readable status chips.

## Project structure

- `lib/types.ts`: shared transaction lifecycle, audit, and activity types.
- `app/page.tsx`: Firestore listeners, atomic review handlers, user activity loading, and transaction audit metadata.
- `components/AdminModal.tsx`: admin console navigation, queue cards, user account detail, full activity tables, and review status presentation.
- `components/views/WalletView.tsx`: user-facing deposit/withdrawal history status details.
- `app/globals.css`: admin console surface, status, table, and responsive utility styles.
- `public/manus-routes.json`: route manifest for `/` and `/phyophyolover`.

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
