import { GameSettings } from './types';

export const ADMIN_EMAILS = [
  'primren685@gmail.com',
  'magire34@gmail.com',
  'Magire34@gmail.com',
];

export const ADMIN_EMAIL = 'primren685@gmail.com';

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized === 'primren685@gmail.com' ||
    normalized === 'magire34@gmail.com'
  );
}

export const TELEGRAM_CHANNEL_LINK = 'https://t.me/dicemyanmar1';
export const CUSTOMER_SERVICE_BOT_LINK = 'https://t.me/xsitecasinobot';
export const CUSTOMER_SERVICE_BOT_HANDLE = '@xsitecasinobot';

export function openTelegramLink(url: string) {
  if (typeof window === 'undefined') return;
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } })?.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export const DEFAULT_SETTINGS: GameSettings = {
  OVER_UNDER_MULTIPLIER: 1.9,
  SIX_MULTIPLIER: 3.9, // Common 7 multiplier
  DEFAULT_NUM_MULTIPLIER: 2.9,
  MINIMUM_BET: 100,
  MINIMUM_DEPOSIT: 3000,
  MINIMUM_FIRST_DEPOSIT: 3000,
  MINIMUM_WITHDRAW: 3000,
  MAX_DAILY_WITHDRAWAL: 300000, // 300,000 Ks per day max limit
  FIRST_WITHDRAW_DEPOSIT_REQUIRED: 5000,
  WITHDRAW_WAGER_PERCENT: 0.50,
  WELCOME_BONUS: 0,
  KPAY_PHONE: '09753499023',
  KPAY_NAME: 'Aung Khant Min',
  WAVE_PHONE: '09680327601',
  WAVE_NAME: 'Phyo ko Ko',
  PROMO_BET_THRESHOLD: 2000,
  PROMO_BONUS_AMOUNT: 500,
  COMMISSION_RATE: 0.01,
  MINIMUM_TRANSFER_AMOUNT: 5000,
  ROUND_DURATION_SECONDS: 60,
  GAME_GROUP_LINK: 'https://t.me/dicemyanmar1',
};

export function classifyDiceTotal(total: number): 'small' | 'common' | 'big' {
  if (total === 7) return 'common';
  if (total >= 2 && total <= 6) return 'small';
  if (total >= 8 && total <= 12) return 'big';
  return 'common';
}

export function getResultClassLabel(resultClass: 'small' | 'common' | 'big'): string {
  switch (resultClass) {
    case 'small':
      return 'အသေး (Small 2-6)';
    case 'common':
      return 'ဘုံအများဆုံး (Common 7)';
    case 'big':
      return 'အကြီး (Big 8-12)';
  }
}

export function classifyDiceColor(total: number): 'red' | 'green' | 'violet' {
  if (total === 6 || total === 7) return 'violet';
  if (total % 2 === 0) return 'red';
  return 'green';
}

export function getColorLabel(color: 'red' | 'green' | 'violet'): string {
  switch (color) {
    case 'red':
      return 'အနီ (Red)';
    case 'green':
      return 'အစိမ်း (Green)';
    case 'violet':
      return 'ခရမ်း (Violet 6,7)';
  }
}

export function formatKs(amount: number | undefined | null): string {
  const val = Math.round(Number(amount) || 0);
  return `${val.toLocaleString()} Ks`;
}
