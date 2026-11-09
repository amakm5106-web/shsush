import type { DepositRequest, WithdrawalRequest } from '@/lib/types';

export type TransactionStatus = 'pending' | 'approved' | 'completed' | 'declined' | 'failed' | 'refunded';

export type TransactionStatusTone = 'warning' | 'success' | 'danger' | 'neutral' | 'info';

export function getTransactionStatus(status: string | undefined, kind: 'deposit' | 'withdrawal' = 'deposit') {
  const normalized = status === 'rejected' ? 'declined' : status;
  if (normalized === 'pending') return { label: 'စောင့်ဆိုင်းဆဲ', shortLabel: 'Pending', tone: 'warning' as const, icon: 'clock' as const };
  if (normalized === 'completed' || normalized === 'approved') return { label: kind === 'withdrawal' ? 'အောင်မြင်စွာ လွှဲပြီး' : 'အောင်မြင်', shortLabel: 'Success', tone: 'success' as const, icon: 'check' as const };
  if (normalized === 'refunded') return { label: 'ပြန်အမ်းပြီး', shortLabel: 'Refunded', tone: 'info' as const, icon: 'rotate' as const };
  if (normalized === 'declined' || normalized === 'failed') return { label: 'ကျရှုံး', shortLabel: 'Failed', tone: 'danger' as const, icon: 'x' as const };
  return { label: normalized || 'မသိရသေး', shortLabel: normalized || 'Unknown', tone: 'neutral' as const, icon: 'dot' as const };
}

export function getTransactionReference(item: DepositRequest | WithdrawalRequest) {
  return 'depositId' in item ? item.depositId : item.withdrawalId;
}
