export type BetKind = 'size' | 'number' | 'color' | 'slot';

export type SizeSelection = 'အသေး' | 'အကြီး';

export interface BoundBank {
  method: 'kpay' | 'wave';
  phone: string;
  accountName: string;
  boundAt: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  phoneNumber?: string;
  passwordHash?: string;
  fullName: string;
  role: 'user' | 'admin';
  balance: number;
  referralBalance: number;
  referralsCount: number;
  depositedReferralsCount?: number;
  referralTotalDeposits?: number;
  referrerId?: string | null;
  referralCode?: string;
  totalBetCumulative: number;
  totalSuccessfulDeposit: number;
  withdrawalCount: number;
  wagerSinceLastWithdrawal: number;
  hasSuccessfulDeposit: boolean;
  promoClaimedReferrals: string[];
  claimedMilestones?: string[];
  boundBank?: BoundBank | null;
  isHedgingFlagged?: boolean;
  cleanTurnoverRequired?: number;
  firstDepositBonusClaimed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReferralMember {
  uid: string;
  fullName: string;
  email?: string;
  joinedAt: number;
  hasSuccessfulDeposit: boolean;
  totalSuccessfulDeposit: number;
  totalBetCumulative: number;
}

export interface GameRound {
  id: string;
  roundId: number;
  status: 'open' | 'settling' | 'settled' | 'refunded';
  openedAt: number;
  deadline: number;
  durationSeconds: number;
  dice1?: number;
  dice2?: number;
  totalResult?: number;
  resultClass?: 'small' | 'common' | 'big';
  resultColor?: 'red' | 'green' | 'violet';
  settledAt?: number;
}

export interface PlayerBet {
  id?: string;
  betId: string;
  roundId: number;
  userId: string;
  userName: string;
  betKind: BetKind;
  selection: string; // 'အသေး', 'အကြီး', '7', '2', etc.
  amount: number;
  multiplier: number;
  status: 'pending' | 'win' | 'loss' | 'refunded';
  payout: number;
  profit: number;
  result?: number;
  createdAt: number;
  settledAt?: number;
}

export interface DepositRequest {
  id?: string;
  depositId: string;
  userId: string;
  userName: string;
  amount: number;
  method: 'kpay' | 'wave';
  phone?: string;
  accountName?: string;
  receiptImage?: string;
  status: 'pending' | 'approved' | 'declined';
  isFirstDeposit: boolean;
  createdAt: number;
  reviewedAt?: number;
}

export interface WithdrawalRequest {
  id?: string;
  withdrawalId: string;
  userId: string;
  userName: string;
  amount: number;
  method: 'kpay' | 'wave';
  phone: string;
  accountName: string;
  status: 'pending' | 'approved' | 'declined';
  receiptImage?: string;
  rejectionReason?: string;
  adminNote?: string;
  createdAt: number;
  reviewedAt?: number;
}

export interface GameSettings {
  OVER_UNDER_MULTIPLIER: number;
  SIX_MULTIPLIER: number; // Common 7 multiplier
  DEFAULT_NUM_MULTIPLIER: number;
  MINIMUM_BET: number;
  MINIMUM_DEPOSIT: number;
  MINIMUM_FIRST_DEPOSIT: number;
  MINIMUM_WITHDRAW: number;
  MAX_DAILY_WITHDRAWAL: number;
  FIRST_WITHDRAW_DEPOSIT_REQUIRED: number;
  WITHDRAW_WAGER_PERCENT: number;
  WELCOME_BONUS: number;
  KPAY_PHONE: string;
  KPAY_NAME: string;
  WAVE_PHONE: string;
  WAVE_NAME: string;
  PROMO_BET_THRESHOLD: number;
  PROMO_BONUS_AMOUNT: number;
  COMMISSION_RATE: number;
  MINIMUM_TRANSFER_AMOUNT: number;
  ROUND_DURATION_SECONDS: number;
  GAME_GROUP_LINK: string;
}
