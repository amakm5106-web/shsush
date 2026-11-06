# Wallet & Profile Luxury Redesign Plan

Redesign the Deposit/Withdrawal (`WalletView`) and User Profile (`ProfileView`) interfaces into a sleek, eye-friendly Dark Obsidian & Gold Shimmer luxury experience. Incorporate authentic KPAY and WavePay payment badges, VIP level progression cards, smooth receipt slip compression, and detailed betting records with zero visual clutter.

> [!IMPORTANT]
> **User Confirmed Requirements from Phase 1:**
> - **Aesthetic & Backgrounds**: Dark Obsidian and subtle Gold Shimmer textured backdrop; comfortable, eye-friendly contrast with zero neon slop or jarring colors.
> - **Payment Method Icons**: Authentic, clean KPAY and Wave Money logo badges for deposit and withdrawal selections.
> - **Profile Focus**: VIP Tier level status badge, comprehensive account balance breakdown, and clean betting ledger.

---

## 1. Overview & Core Concept

- **Wallet Experience (`WalletView`)**:
  - **Deposit Tab**: One-touch selection between KPAY and Wave Money with official logo badges. Quick amount chips (3,000 Ks to 100,000 Ks), one-click phone number copy with haptic audio, receipt screenshot upload with automated client-side compression, and instant submission.
  - **Withdrawal Tab**: Bound bank account card, 24-hour daily withdrawal limit tracker (300,000 Ks cap), wagering turnover requirement indicator, and quick withdrawal presets.
  - **History Tab**: Real-time status tracker for all deposits and withdrawals (Pending, Approved, Declined) with detailed rejection notes if any.
- **Profile Experience (`ProfileView`)**:
  - **VIP Prestige Card**: Obsidian & gold shimmer gradient card displaying Player Name, UID, VIP Tier (Bronze, Silver, Gold, Platinum based on total deposits), total wagered volume, and playable balance.
  - **Bound Bank Card**: Verified KPAY or Wave Money account details with one-click bank binding or updating.
  - **Betting History**: Filterable ledger (`အားလုံး`, `နိုင်`, `ရှုံး`, `ဆိုင်းငံ့`) with game badges (Buffalo Slot / Dice 777), bet amount, and payout multiplier.

---

## 2. User Experience & Visual Design

### Color & Texture Palette:
- **Canvas**: Deep Obsidian & Carbon Black (`#06080F`, `#0B0F19`) with soft radial gold shimmer gradients.
- **Accents**: Radiant Warm Gold (`#F59E0B`, `#EAB308`), Muted Amber (`#D97706`), Emerald Green for approvals (`#10B981`), and Soft Crimson for declined items (`#EF4444`).
- **Surface Elevation**: Single-elevation dark-glass cards with subtle hairline borders (`border-white/10`) and no distracting neon glows.
- **Typography**: Clean Myanmar Unicode text hierarchy paired with monospace tabular figures (`font-mono tabular-nums`) for currency and numbers.

### Key Visual Assets:
1. **Background Texture**: Subtle luxury dark casino obsidian backdrop (`/public/assets/casino/luxury_obsidian_bg.jpg`) generated via `generate_image`.
2. **KPAY & Wave Money Logo Badges**: High-fidelity payment badges with clear branding, rounded corners, and crisp logo graphics.
3. **VIP Tier Insignia**: Custom VIP badge with crown icon and dynamic tier level styling.

---

## 3. Key Product Decisions & Flow

- **Decision 1: Client-Side Compressed Image Uploads**:
  - *Chosen Approach*: Maintain automatic canvas-based JPEG compression (`compressReceiptImage`) before Firestore submission.
  - *Why*: Ensures instant upload under 200KB even on slow Myanmar mobile connections without crashing Firestore document limits.
- **Decision 2: Tab-Based Wallet Navigation**:
  - *Chosen Approach*: Clean 3-tab segmented selector (`ငွေသွင်း` Deposit, `ငွေထုတ်` Withdraw, `မှတ်တမ်း` History) instead of cluttered long scrolling pages.
- **Decision 3: VIP Tier Progression Math**:
  - Tier 1 (Bronze VIP): Total deposit < 20,000 Ks
  - Tier 2 (Silver VIP): Total deposit 20,000 – 100,000 Ks
  - Tier 3 (Gold VIP): Total deposit 100,000 – 500,000 Ks
  - Tier 4 (Diamond VIP): Total deposit > 500,000 Ks

---

## 4. Technical Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                    WalletView Component                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Header: Balance Bar & 3 Segmented Tabs (Deposit/Withdraw) │
├─────────────────────────────────────────────────────────────┤
│ 2. Tab: ငွေသွင်း (Deposit Flow)                              │
│    ├── Payment Method Cards (KPAY / Wave with Logo Badges)  │
│    ├── Agent Phone Number + Quick Copy Button               │
│    ├── Preset Amount Chips (3k, 5k, 10k, 20k, 50k, 100k)    │
│    ├── Slip Upload Dropzone with Live Thumbnail Preview     │
│    └── Submit Deposit Button with Loading State             │
├─────────────────────────────────────────────────────────────┤
│ 3. Tab: ငွေထုတ် (Withdrawal Flow)                            │
│    ├── Bound Bank Info & Daily Limit Gauge (300k limit)     │
│    ├── Wager Turnover Checker (0.5x turnover requirement)   │
│    ├── Preset Withdrawal Chips                              │
│    └── Submit Withdrawal Button                             │
├─────────────────────────────────────────────────────────────┤
│ 4. Tab: မှတ်တမ်း (Transaction History)                      │
│    └── Live status badges (Approved / Pending / Declined)   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   ProfileView Component                     │
├─────────────────────────────────────────────────────────────┤
│ 1. VIP Member Prestige Card (Obsidian & Gold Shimmer)       │
│    ├── Avatar, VIP Tier Badge, Name, UID + Copy Button      │
│    └── Balance & Total Turnover Metrics                     │
├─────────────────────────────────────────────────────────────┤
│ 2. Bound Bank Account Management Box                        │
├─────────────────────────────────────────────────────────────┤
│ 3. Betting History Ledger with Filters (All, Win, Loss)     │
├─────────────────────────────────────────────────────────────┤
│ 4. Account Actions: Refresh Profile & Sign Out             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Verification Plan

1. **Compilation & Linting**: Run `compile_applet` and `lint_applet` together to verify zero syntax or typing errors.
2. **Interaction Verification**:
   - Test KPAY and Wave Money tab switching and phone copying.
   - Test deposit amount preset chips and custom input.
   - Test screenshot slip upload, preview, and submission.
   - Test withdrawal amount validation, daily limit computation, and submission.
   - Test profile VIP tier rendering and bet history filtering.
3. **Visual & Responsive Verification**:
   - Verify layout looks clean, comfortable, and luxury on mobile (375px–420px) and desktop.
   - Ensure zero harsh neon colors or unreadable contrast.
