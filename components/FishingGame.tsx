'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Coins, Crosshair, RotateCcw, Settings2, Target, Trophy, Volume2, VolumeX, Waves, X, Zap } from 'lucide-react';
import { sounds } from '@/lib/audio';
import { FishAnimationCanvas } from './fishing/FishAnimationCanvas';
import { createCatch, type FishExit, type FishSpriteTarget } from './fishing/fishData';

interface FishingGameProps {
  onBack: () => void;
  balance: number;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

export function FishingGame({ onBack, balance: initialBalance, isAuthenticated, onRequireAuth }: FishingGameProps) {
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(15);
  const [caught, setCaught] = useState(0);
  const [balance, setBalance] = useState(initialBalance);
  const [charging, setCharging] = useState(false);
  const [round, setRound] = useState(1);
  const [fish, setFish] = useState<FishSpriteTarget[]>(() => [1, 2, 3, 4, 5].map((id) => createCatch(id)));
  const nextFishId = useRef(6);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState('ငါးကို ချိန်ပြီး ပစ်ပါ');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => sounds.enabled);

  const toggleSound = () => {
    const enabled = sounds.toggleSound();
    setSoundEnabled(enabled);
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const trigger = settingsTriggerRef.current;
    settingsCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      trigger?.focus();
    };
  }, [settingsOpen]);

  const reset = useCallback(() => {
    setScore(0);
    setShots(15);
    setCaught(0);
    setRound((value) => value + 1);
    nextFishId.current = 6;
    setFish([1, 2, 3, 4, 5].map((id) => createCatch(id)));
    setMessage('ငါးကို ချိန်ပြီး ပစ်ပါ');
  }, []);

  const shoot = async (target: FishSpriteTarget): Promise<number | null> => {
    if (shots <= 0 || charging) return null;
    if (!isAuthenticated) {
      setMessage('ကစားရန် Login ဝင်ပေးပါ');
      onRequireAuth();
      return null;
    }
    if (balance < 1) {
      setMessage('Balance မလုံလောက်ပါ — 1 MMK လိုအပ်ပါသည်');
      return null;
    }
    setCharging(true);
    const chargeResponse = await fetch('/api/fishing/shot', { method: 'POST', cache: 'no-store' });
    const charge = await chargeResponse.json().catch(() => ({ success: false, error: 'ကျည်ဖိုးဖြတ်ရာတွင် အဆင်မပြေပါ' }));
    setCharging(false);
    if (!charge.success) {
      setMessage(charge.error || 'ကျည်ဖိုးဖြတ်ရာတွင် အဆင်မပြေပါ');
      if (typeof charge.balance === 'number') setBalance(charge.balance);
      return null;
    }
    sounds.playChip();
    const remainingShots = shots - 1;
    const scoreGain = Math.round(10 + target.size / 2);
    setShots((value) => value - 1);
    setCaught((value) => value + 1);
    setScore((value) => value + scoreGain);
    setBalance(Number(charge.balance) || Math.max(0, balance - 1));
    setMessage(remainingShots === 0 ? 'အလှည့်ပြီးပါပြီ — ပြန်စကစားနိုင်ပါတယ်' : 'အောင်မြင်စွာ ဖမ်းမိပါပြီ');
    const replacement = createCatch(nextFishId.current++);
    setFish((current) => [...current.filter((item) => item.id !== target.id), replacement]);
    return scoreGain;
  };

  const handleFishExit = useCallback((exits: FishExit[]) => {
    const replacements = exits.map((exit) => ({
      exitId: exit.id,
      fish: createCatch(nextFishId.current++, exit.side === 'left' ? 'right' : 'left'),
    }));
    const exitIds = new Set(exits.map((exit) => exit.id));

    setFish((current) => {
      const leaving = current.filter((target) => exitIds.has(target.id));
      if (!leaving.length) return current;
      const leavingIds = new Set(leaving.map((target) => target.id));
      const additions = replacements
        .filter((replacement) => leavingIds.has(replacement.exitId))
        .map((replacement) => replacement.fish);
      return [...current.filter((target) => !leavingIds.has(target.id)), ...additions];
    });
  }, []);

  const cannonLabel = charging ? 'ကျည်ဖိုးစစ်ဆေးနေသည်...' : shots > 0 ? `ပစ်ခွင့် ${shots}` : 'ပစ်ခွင့်ကုန်ပါပြီ';

  return (
    <div className="fishing-arena relative overflow-hidden text-white">
      <div className="fishing-environment" aria-hidden="true">
        <div className="fishing-environment__base" />
        <div className="fishing-environment__vignette" />
        <div className="fishing-environment__rays" />
        <div className="fishing-environment__caustics" />
        <div className="fishing-environment__flow" />
        <div className="fishing-environment__reef" />
        <div className="fishing-environment__particles" />
      </div>

      <div className="fishing-shell">
        <header className="fishing-topbar">
          <button type="button" onClick={onBack} className="fishing-icon-button fishing-lobby-button" aria-label="Back to lobby">
            <ArrowLeft className="h-4 w-4" />
            <span>Lobby</span>
          </button>

          <div className="fishing-brand">
            <div className="fishing-brand__crest"><Waves className="h-5 w-5" /></div>
            <div>
              <p>XSITE CASINOS ARCADE</p>
              <h1>Deep Sea Catch</h1>
            </div>
          </div>

          <div className="fishing-header-actions">
            <button
              type="button"
              onClick={toggleSound}
              className={`fishing-icon-button ${soundEnabled ? 'is-active' : ''}`}
              aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
              aria-pressed={soundEnabled}
              title={soundEnabled ? 'Sound on' : 'Sound off'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              ref={settingsTriggerRef}
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className={`fishing-icon-button ${settingsOpen ? 'is-active' : ''}`}
              aria-label="Game settings"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              aria-controls="fishing-settings-panel"
              title="Settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={reset} className="fishing-icon-button" aria-label="Restart round" title="Restart round">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {settingsOpen && (
            <div className="fishing-settings-panel" id="fishing-settings-panel" role="dialog" aria-label="Fishing game settings">
              <div className="fishing-settings-panel__head">
                <div><span>QUICK SETTINGS</span><strong>Game controls</strong></div>
                <button ref={settingsCloseRef} type="button" onClick={() => setSettingsOpen(false)} className="fishing-settings-panel__close" aria-label="Close settings">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button type="button" className="fishing-setting-row" onClick={toggleSound} aria-pressed={soundEnabled}>
                <span className="fishing-setting-row__icon">{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</span>
                <span className="fishing-setting-row__copy"><strong>Sound effects</strong><small>{soundEnabled ? 'Enabled' : 'Muted'}</small></span>
                <span className={`fishing-switch ${soundEnabled ? 'is-on' : ''}`} aria-hidden="true"><i /></span>
              </button>
              <div className="fishing-settings-facts">
                <div><span>Shot cost</span><strong>1 MMK · fixed</strong></div>
                <div><span>Ammo</span><strong>Standard</strong></div>
                <div><span>Score</span><strong>Game points</strong></div>
              </div>
              <p className="fishing-settings-note">This game currently uses one standard shot type. Cash winnings and cannon upgrades are not configured.</p>
            </div>
          )}
        </header>

        <section className="fishing-stats" aria-label="Round status">
          <div className="fishing-stat fishing-stat--balance">
            <div className="fishing-stat__heading"><Coins className="h-4 w-4" /><span>AVAILABLE BALANCE</span></div>
            <div className="fishing-stat__value fishing-stat__value--balance"><b>{balance.toLocaleString()}</b><small>MMK</small></div>
            <div className="fishing-stat__subline"><span>SHOT COST</span><strong>1 MMK</strong></div>
          </div>
          <div className="fishing-stat">
            <div className="fishing-stat__heading"><Trophy className="h-4 w-4" /><span>ROUND SCORE</span></div>
            <div className="fishing-stat__value"><b>{score.toLocaleString()}</b><small>PTS</small></div>
          </div>
          <div className="fishing-stat">
            <div className="fishing-stat__heading"><Target className="h-4 w-4" /><span>CATCHES</span></div>
            <div className="fishing-stat__value"><b>{caught}</b><small>FISH</small></div>
          </div>
          <div className="fishing-stat">
            <div className="fishing-stat__heading"><Waves className="h-4 w-4" /><span>ROUND</span></div>
            <div className="fishing-stat__value"><b>{String(round).padStart(2, '0')}</b><small>LIVE</small></div>
          </div>
          <div className="fishing-stat fishing-stat--shots">
            <div className="fishing-stat__heading"><Zap className="h-4 w-4" /><span>SHOTS LEFT</span></div>
            <div className="fishing-stat__value"><b>{shots}</b><small>/ 15</small></div>
          </div>
        </section>

        <main className="fishing-playfield" aria-label="Underwater fishing game field">
          <FishAnimationCanvas key={round} fish={fish} disabled={shots <= 0 || charging} onFishClick={shoot} onFishExit={handleFishExit} />
          <div className="fishing-playfield__status" aria-live="polite"><Waves className="h-4 w-4" /><span>{message}</span></div>
          <div className="fishing-playfield__hint"><Crosshair className="h-4 w-4" /><span>Tap a fish to aim &amp; fire</span></div>
          <div className="fishing-cannon-hud pointer-events-none">
            <div className="fishing-cannon-hud__label"><Target className="h-3.5 w-3.5" />{cannonLabel}</div>
            <div className="fishing-cannon-hud__track"><div style={{ width: `${(shots / 15) * 100}%` }} /></div>
          </div>
        </main>

        <section className="fishing-control-dock" aria-label="Cannon and ammunition status">
          <div className="fishing-dock-card fishing-dock-card--ammo">
            <div className="fishing-dock-card__top"><span>AMMUNITION</span><i>FIXED</i></div>
            <div className="fishing-dock-card__value"><span className="fishing-dock-card__icon"><Zap className="h-4 w-4" /></span><span><strong>STANDARD</strong><small>1 MMK / SHOT</small></span></div>
          </div>
          <div className="fishing-fire-prompt" role="note" aria-label="Fire control: tap a fish to shoot">
            <span className="fishing-fire-prompt__icon"><Crosshair className="h-5 w-5" /></span>
            <span className="fishing-fire-prompt__copy"><small>FIRE CONTROL</small><strong>{shots > 0 ? 'Tap a fish' : 'No shots left'}</strong></span>
            <span className="fishing-fire-prompt__tag">AIM &amp; FIRE</span>
          </div>
          <div className="fishing-dock-card fishing-dock-card--cannon">
            <div className="fishing-dock-card__top"><span>CANNON</span><i>DEFAULT</i></div>
            <div className="fishing-dock-card__value"><span className="fishing-dock-card__icon"><Target className="h-4 w-4" /></span><span><strong>STANDARD</strong><small>NO UPGRADE SYSTEM</small></span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
