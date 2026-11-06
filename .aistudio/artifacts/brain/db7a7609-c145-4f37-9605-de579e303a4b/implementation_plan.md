# Referral Program & VIP Commission Redesign

Redesign the Referral (ဖိတ်ခေါ်မှု & မန်ဘာဆုကြေး) experience into a high-converting, modern luxury dark-glass interface matching the Stake and PGSoft aesthetic, featuring an instant-copy VIP referral link banner, interactive QR code generator, real-time commission stats, tiered milestone rewards, and detailed referred member activity cards.

> [!IMPORTANT]
> **User Confirmed Requirements from Phase 1:**
> - **Visual Style**: Modern Luxury Dark Glass with gold/amber accents, consistent with the redesigned casino lobby.
> - **Referral Sharing**: High-impact Hero Banner featuring One-Click Copy and an instant QR Code view for mobile-to-mobile sharing.
> - **Referred Member List**: Rich, detailed cards highlighting member deposit volume, calculated commission earned, joined dates, and active verification status.

---

## 1. Overview & Core Concept

- **What It Does**: Enables players to invite friends, track real-time commission earnings ({settings.COMMISSION_RATE * 100}%), unlock tiered deposit milestones (up to +9,000 Ks in milestone bonuses), generate QR codes for in-person sharing, and transfer earned commission instantly into their playable main balance.
- **Target Audience**: Myanmar casino and slot enthusiasts looking to build active referral teams and earn passive commissions from friends' gaming activity.
- **Key Value**: Replaces the generic, low-contrast referral page with a sleek, motivating VIP affiliate dashboard that clearly shows earnings potential and provides frictionless sharing tools.

---

## 2. User Experience & Visual Design

### Key User Flows:
1. **VIP Affiliate Hero Card**:
   - Displays the player's unique referral link with a prominent "Copy Link" button (with instant haptic/audio feedback).
   - "Show QR Code" button opens an elegant dark glass modal with a generated QR code for in-person scanning.
   - One-tap "Share to Telegram" button pre-configured with persuasive Burmese promotion text.

2. **Affiliate Performance Strip (4 Key Metrics)**:
   - Total Invited Players (ဖိတ်ခေါ်သူ စုစုပေါင်း).
   - Verified Depositing Members (ငွေသွင်း မန်ဘာအစစ်).
   - Total Team Turnover/Deposits (မန်ဘာများ စုစုပေါင်း သွင်းငွေ).
   - Available Commission Balance (ထုတ်ယူနိုင်သော မိတ်ဆက်ခ).

3. **Instant Wallet Transfer Bar**:
   - If available commission $\ge$ minimum threshold (1,000 Ks), renders a gold VIP action card with one-click transfer to main balance, complete with coin audio and celebration feedback.

4. **Tiered Milestone Rewards (3 Progressive Tiers)**:
   - Tier 1: 2 Deposited Members $\rightarrow$ Claim **+2,000 Ks**.
   - Tier 2: 5 Deposited Members $\rightarrow$ Claim **+2,000 Ks**.
   - Tier 3: 50,000 Ks Team Deposits $\rightarrow$ Claim **+5,000 Ks**.
   - Each tier has a live gradient progress bar, completed checklist indicators, and instant claim handlers.

5. **Referred Member Activity Cards**:
   - Filterable by `အားလုံး` (All), `ငွေသွင်းပြီး` (Deposited), and `မသွင်းရသေး` (Registered).
   - Each member card displays player name/UID snippet, registration date, total deposited amount, and the calculated commission contributed to the inviter.

### Visual Identity & Theme:
- **Canvas**: Deep Obsidian & Dark Carbon (`#090A0F`, `#10121A`) with subtle glass borders (`rgba(255, 255, 255, 0.08)`).
- **Accents**: Radiant Gold / Amber (`#F59E0B`, `#EAB308`) for commissions and rewards; Emerald Green (`#10B981`) for verified deposits.
- **Typography**: Clean title hierarchy with Myanmar Unicode, bold tabular numbers (`tabular-nums font-mono`) for all monetary values.
- **Micro-Interactions**: Smooth 150ms hover elevations, copied clipboard toasts, and sound triggers via `sounds.playChip()` and `sounds.playWin()`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Native SVG QR Code Generator instead of external image API**:
  - *Chosen Approach*: Render QR codes dynamically via client-side SVG generation (or a lightweight QR component) without external HTTP requests.
  - *Why*: Eliminates fragile external image dependencies (`api.qrserver.com`) that can fail or get blocked in restricted networks.
- **Decision 2: Detailed Member Cards vs. Cramped Table**:
  - *Chosen Approach*: Card-based listing with clear visual tags for verified deposits and commission contributions.
  - *Why*: Significantly more legible on mobile devices compared to cramped multi-column tables.

---

## 4. Technical Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                 ReferralView Component                      │
├─────────────────────────────────────────────────────────────┤
│ 1. Header & Commission Rate Badge (e.g. 5% ကော်မရှင်)       │
├─────────────────────────────────────────────────────────────┤
│ 2. Affiliate Hero Card                                      │
│    ├── Link Input + Copy Button (Copied feedback toast)     │
│    ├── View QR Code Trigger Button                          │
│    └── Telegram Direct Share Button                         │
├─────────────────────────────────────────────────────────────┤
│ 3. 4-Grid Commission Analytics Matrix                       │
│    ├── Total Invites | Active Depositors                    │
│    └── Team Deposit Volume | Available Commission           │
├─────────────────────────────────────────────────────────────┤
│ 4. Instant Balance Transfer Action Banner                   │
│    └── onTransferReferral() with sounds.playWin()           │
├─────────────────────────────────────────────────────────────┤
│ 5. 3 Milestone Reward Tiers                                 │
│    ├── Tier 1 (2 Deposited): Progress Bar + Claim Action    │
│    ├── Tier 2 (5 Deposited): Progress Bar + Claim Action    │
│    └── Tier 3 (50k Team Deposit): Progress Bar + Claim      │
├─────────────────────────────────────────────────────────────┤
│ 6. Detailed Member Activity Feed                           │
│    ├── Filter Segment: All / Deposited / Registered         │
│    └── Member Item Cards (Deposit amount & Commission)      │
├─────────────────────────────────────────────────────────────┤
│ 7. QR Code Modal (Conditional Overlay)                      │
│    └── In-person scan card with copy link & close button    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Verification Plan

1. **Compilation & Linting**: Run `compile_applet` and `lint_applet` together to verify zero syntax or typing errors.
2. **Interaction Verification**:
   - Test referral link copy to clipboard.
   - Test QR code modal display and closing.
   - Test commission transfer to main balance when balance $\ge 1,000\text{ Ks}$.
   - Test milestone bonus claim actions.
   - Test member list filter tabs (`All`, `Deposited`, `Registered`).
3. **Responsive Check**: Ensure optimal rendering on both mobile screens (375px–420px) and wide desktop viewports.
