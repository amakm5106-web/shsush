# Turso Database Real-Time Balance Synchronization Architecture

Establish Turso Cloud Database as the authoritative, real-time primary database for both the WebApp and Telegram Customer Service Bot, eliminating the 0-balance display bug and stopping accidental zero-balance overwrites.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following two architectural decisions were confirmed in Phase 1:
> - **Turso as Primary Authority**: Both WebApp and Telegram Bot connect directly to Turso (`libsql://casino-xavianelio.aws-ap-southeast-1.turso.io`) as the primary source of truth for user accounts and wallet balance.
> - **3-Second Real-Time Auto-Sync**: The WebApp will automatically query Turso every 3 seconds in the background so that any balance adjustment or deposit approval from the Telegram Bot reflects live on the user's screen without a manual page refresh.

---

### 1. Root Cause Breakdown

Through codebase diagnosis, we identified the five specific reasons why the WebApp was stuck displaying a 0 balance:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ROOT CAUSE FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Bot adjusts balance ────► Updates Turso (Balance = 50,000 Ks)           │
│                             │                                               │
│                             └──► Tries Firestore update ─► FAILS            │
│                                  (Missing permissions / Quota limit)        │
│                                                                             │
│ 2. WebApp loads ───────────► Listens ONLY to Firestore (users/{uid})       │
│                             Never queried Turso for user profile / balance  │
│                                                                             │
│ 3. Zero-Overwrite Trap ────► WebApp sees 0 in Firestore / Local Cache       │
│                             Calls syncToTurso('user', { balance: 0 })       │
│                             Turso executes INSERT OR REPLACE with 0 Ks!     │
│                             Overwrites Bot's 50,000 Ks back to 0!           │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **WebApp was querying only Firestore**: `onAuthStateChanged` and `onSnapshot` were attached exclusively to Firestore `users/{uid}`, completely ignoring Turso.
2. **Server Bot API Firestore Permission Failure**: When the Bot calls `/api/bot/balance`, the server route executes with the client SDK (unauthenticated), causing Firestore Security Rules to reject the write (`PERMISSION_DENIED`). As a result, Firestore remained at 0 while only Turso held the updated balance.
3. **The Destructive Sync Overwrite**: When the WebApp initialized with `balance: 0`, `cacheUserProfile` invoked `syncToTurso('user', profile)`. `/api/turso/sync` used an unconstrained `INSERT OR REPLACE INTO users (uid, balance, ...) VALUES (..., 0, ...)`, wiping out the Bot's adjustment in Turso back to 0.
4. **No Realtime Poller for Turso**: While Firestore has native WebSockets (`onSnapshot`), Turso is an HTTP/libSQL database requiring an active background synchronization mechanism in the WebApp.

---

### 2. Implementation Strategy & Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEW TURSO-FIRST PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Telegram CS Bot                   WebApp Client (Player)                  │
│  ┌─────────────────┐               ┌─────────────────────────────────────┐  │
│  │ /topup, /review │               │ 1. Phone / Google Login             │  │
│  └────────┬────────┘               │ 2. 3-Second Turso Poller Hook       │  │
│           │                        │ 3. Bet / Win / Loss State Handlers  │  │
│           ▼                        └──────────────────┬──────────────────┘  │
│   POST /api/bot/balance                               │                     │
│   POST /api/bot/review                                │                     │
│           │                                           ▼                     │
│           │                           GET /api/turso/user?uid={uid}         │
│           │                           POST /api/turso/sync (Guarded)        │
│           │                                           │                     │
│           ▼                                           ▼                     │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    TURSO CLOUD DATABASE (PRIMARY)                     │  │
│  │  - table: users (balance, role, phone, boundBank, etc.)               │  │
│  │  - table: deposits (trxLast5, status, amount, etc.)                   │  │
│  │  - table: withdrawals (amount, phone, status, etc.)                   │  │
│  │  - table: bets (roundId, amount, payout, status, etc.)                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                   │                                         │
│                      (Secondary Async Mirror Only)                          │
│                                   ▼                                         │
│                       Firestore (Backup / Legacy)                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Detailed Action Plan

#### Step 1: Shield `/api/turso/sync` from Zero-Balance Overwrites
- In `/app/api/turso/sync/route.ts`:
  - When updating users via `sync`, check if the incoming `data.balance === 0`. If Turso already contains an existing user record with `balance > 0`, **DO NOT** overwrite the balance with 0!
  - Use SQLite `ON CONFLICT(uid) DO UPDATE SET balance = CASE WHEN excluded.balance > 0 THEN excluded.balance ELSE users.balance END, ...` or fetch existing record before applying updates.
  - This guarantees that a fresh or offline client profile can never wipe out a player's real balance.

#### Step 2: Optimize `/api/turso/user`
- Add `export const dynamic = 'force-dynamic';` and cache-control headers (`no-store, no-cache, must-revalidate`).
- Add fallback search by phone number if UID is not found, ensuring seamless compatibility with phone-authenticated players.

#### Step 3: Implement 3-Second Real-Time Turso Polling Hook in WebApp (`app/page.tsx`)
- Create an active synchronization effect `useTursoRealtimeSync`:
  - Triggers immediately when `currentUser` is authenticated or phone user exists.
  - Calls `/api/turso/user?uid=${uid}&t=${Date.now()}` every 3,000 ms (3 seconds).
  - Compares the Turso balance with local `userProfile.balance`. If Turso has a newer `updatedAt` or updated `balance`, instantly update `userProfile` state and localStorage cache.
  - Automatically pauses polling when the browser tab is hidden or in background (`document.visibilityState === 'hidden'`) to save network bandwidth, and immediately refreshes when the user focuses back on the tab.

#### Step 4: Turso-First Initial Authentication & Phone Sign In
- Update `handlePhoneSignIn`, `handlePhoneSignUp`, and `onAuthStateChanged` in `app/page.tsx`:
  - Immediately query `/api/turso/user?uid=${uid}` during login.
  - If Turso already has the user profile, load it as primary immediately rather than waiting for Firestore.
  - Only create a new default profile if both Turso and Firestore confirm the user is brand new.

#### Step 5: Verify Bot Endpoints (`/api/bot/balance` & `/api/bot/review`)
- Ensure `/api/bot/balance` updates `balance`, `updatedAt = Date.now()` in Turso cleanly.
- Verify that testing a 50,000 Ks top-up immediately reflects on both `/api/turso/user` and the WebApp UI within 3 seconds.

---

### 4. Verification Plan

1. **Turso Protection Test**:
   - Issue a mock sync call with `{ balance: 0 }` to a user who has `50,000 Ks` in Turso; verify Turso retains the `50,000 Ks` and rejects the zero overwrite.
2. **Bot Top-up & WebApp Live Sync Test**:
   - Send top-up request via `POST /api/bot/balance` for user `09965665415`.
   - Call `/api/turso/user?uid=Ly9m0V5JWBQM9KtyfvcSlnuVrsT2`.
   - Verify HTTP 200 and accurate updated balance.
3. **Build & Lint Verification**:
   - Execute `compile_applet` and `lint_applet` to confirm 0 compilation or type errors.
