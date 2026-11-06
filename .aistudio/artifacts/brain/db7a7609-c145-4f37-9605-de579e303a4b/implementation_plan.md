# Charge Buffalo (ကျွဲဂိမ်း) 4,096 Ways Slot Game Deluxe Overhaul

Redesign the Charge Buffalo slot game into an immersive, high-performance casino experience featuring a responsive 6x4 reel grid, authentic realistic wildlife PNG symbols, physical reel spin and bounce animations, motion blur, win line glows, screen shake on Big Wins, and a comfortable, luxury canyon prairie aesthetic with zero visual clutter.

> [!IMPORTANT]
> **User Confirmed Requirements from Phase 1:**
> - **Responsive 6x4 Layout**: Seamlessly adapts between mobile portrait/landscape and desktop wide screens with intuitive thumb-reach controls.
> - **Full Animation Effects Suite**:
>   - *Spin Physics*: Smooth reel acceleration, motion blur during rapid spinning, and mechanical ratchet stop-bounce per reel.
>   - *Winning Visuals*: Glowing win-line highlight borders, symbol pulse animations, and particle sparkle cascades.
>   - *Big Win Excitement*: Haptic camera screen shake, tiered progressive win counters (Big Win, Mega Win, Super Win), and celebratory coin showers.
> - **Symbol Graphic Style**: High-definition, realistic wildlife PNG symbols (Golden Buffalo, Bald Eagle, Grizzly Bear, Timber Wolf, Elk/Moose, Sunset Wild, and Gold Coin Scatter).
> - **Visual Comfort**: Deep twilight canyon backdrop with warm amber and bronze metal frames; eye-friendly contrast with zero neon glare.

---

## 1. Overview & Core Concept

- **Game Mechanics**: 6 Reels $\times$ 4 Rows delivering **4,096 Ways to Win** (adjacent left-to-right matching).
- **Wild Multipliers**: Sunset Wild symbols on reels 2–6 substituting for all symbols and revealing 2x, 3x, or 5x random multipliers during Free Spins.
- **Scatter & Free Spins**: 3, 4, 5, or 6 Golden Coin Scatters trigger 8, 15, 25, or 100 Free Spins with unlimited re-triggers.
- **Player Controls**:
  - Tactile Spin Button with haptic response and hold-to-turbo.
  - Preset stake chips: 100 Ks, 200 Ks, 500 Ks, 1,000 Ks, 2,000 Ks, 5,000 Ks, 10,000 Ks, 20,000 Ks, 50,000 Ks.
  - Auto-spin panel with customizable spin counts (10, 25, 50, 100) and loss limit stops.

---

## 2. Visual Assets & Symbol Strategy

In Phase 3, we will generate 8 high-fidelity visual assets via a single parallel batch of `generate_image`:
1. `buffalo_symbol_realistic` (1:1): Powerful American bison with piercing amber eyes and dark textured fur.
2. `eagle_symbol_realistic` (1:1): Majestic bald eagle with sharp golden beak and focused predator gaze.
3. `bear_symbol_realistic` (1:1): Formidable grizzly bear roaring against dark stone.
4. `wolf_symbol_realistic` (1:1): Noble timber wolf in winter twilight.
5. `moose_symbol_realistic` (1:1): Stately elk/moose with grand antlers.
6. `wild_sunset_realistic` (1:1): Golden desert mesa canyon at sunset with radiant "WILD" typography.
7. `scatter_coin_realistic` (1:1): Ancient gold coin embossed with a buffalo skull and "SCATTER".
8. `buffalo_prairie_backdrop` (16:9): Panoramic twilight American prairie canyon with subtle starfield and warm campfire glow.

---

## 3. Animation & Visual Effects Architecture

### A. Reel Spin & Bounce Physics:
- **Phase 1 (Windup)**: Slight anticipation upward tug (-8px) for 80ms.
- **Phase 2 (Spinning & Motion Blur)**: Reels spin with dynamic CSS motion blur (`filter: blur(2px)`) and high-velocity vertical translation.
- **Phase 3 (Staggered Stop)**: Reels settle from left to right (Reel 1 to 6) with 150ms intervals.
- **Phase 4 (Ratchet Bounce)**: Physical spring dampening (`cubic-bezier(0.34, 1.56, 0.64, 1)`) with simulated ratchet thud audio (`sounds.playReelStop()`).

### B. Winning Celebrations & Big Win Modal:
- **Winning Symbols**: Highlighted with an amber/gold glowing border and gentle pulse zoom (`scale: 1.08`). Non-winning symbols dim to 40% opacity.
- **Screen Shake on Big Wins**: Camera shakes (`transform: translate3d(...)` with decay over 600ms) on payouts $\ge 15\times$ stake.
- **Progressive Counter Modal**: Interactive count-up animation for Big Win ($15\times$), Mega Win ($30\times$), and Super Win ($60\times$) accompanied by confetti showers and coin rain.

---

## 4. Technical Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                 BuffaloSlotGame Component                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Header Bar: Return to Lobby, Balance Pill, Sound Toggle  │
├─────────────────────────────────────────────────────────────┤
│ 2. Free Spins & Multiplier Banner                           │
├─────────────────────────────────────────────────────────────┤
│ 3. 6x4 Slot Reels Machine (BuffaloSlotReels)               │
│    ├── 6 Individual Reel Strips with Staggered Spin Timers  │
│    ├── Motion Blur & Spring Bounce Animation Physics        │
│    ├── Winning Cell Glow Borders & Pulse Highlights         │
│    └── Dynamic Wild Multiplier Badges (2x, 3x, 5x)         │
├─────────────────────────────────────────────────────────────┤
│ 4. Tactile Bet & Spin Control Bar                           │
│    ├── Turbo Mode Toggle (Zap Icon)                         │
│    ├── Stake Increment / Preset Chips                       │
│    ├── Giant Spin Button with Spin / Stop States            │
│    └── Auto-Spin Settings Drawer                            │
├─────────────────────────────────────────────────────────────┤
│ 5. Big Win & Celebration Modal (BuffaloBigWinModal)         │
│    ├── Screen Shake Container                               │
│    ├── Tiered Progressive Win Counter                       │
│    └── Confetti Shower & Coin Sound FX                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Status: COMPLETED ✅

- [x] **Visual Assets**: Atmospheric canyon backdrop (`buffalo_canyon_bg.jpg`) generated and placed in `/public/assets/casino/`. High-resolution PNG wildlife symbols (`buffalo.png`, `eagle.png`, `bear.png`, `wolf.png`, `moose.png`, `scatter-coin.png`, `wild-sunset.png`) wired with robust fallback in `BuffaloSymbolImage.tsx`.
- [x] **Physics & Animations**: Added `animate-reel-bounce` (spring ratchet stop), `animate-slot-spinning` (vertical motion blur), `animate-screen-shake` (camera shake on Big Wins and Scatters), and `animate-win-cell` (warm amber glow on paylines).
- [x] **Responsive Layout**: Upgraded slot grid in `BuffaloSlotGame.tsx` to adapt cleanly across mobile portrait, landscape, and desktop viewports with zero visual clipping and optional 90-degree manual rotation.
- [x] **Verification**: `compile_applet` passed successfully, `lint_applet` passed with 0 errors, and dev server restarted.
