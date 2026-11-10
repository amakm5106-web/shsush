'use client';

import { Fragment, useEffect, useState } from 'react';

type Row = Record<string, unknown>;
type Data = { users: Row[]; deposits: Row[]; withdrawals: Row[]; stats?: Row };

const money = (v: unknown) => `${Number(v || 0).toLocaleString()} Ks`;
const date = (v: unknown) => v ? new Date(Number(v)).toLocaleString() : '-';

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<Data>({ users: [], deposits: [], withdrawals: [] });
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'overview' | 'users' | 'deposits' | 'withdrawals' | 'sakura'>('overview');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sakuraRtp, setSakuraRtp] = useState('80');
  const [sakuraRtpBusy, setSakuraRtpBusy] = useState(false);
  const [sakuraRtpNotice, setSakuraRtpNotice] = useState('');

  const load = async (q = query) => {
    const response = await fetch(`/api/admin/overview${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store', credentials: 'include' });
    if (response.status === 401) { setAuthenticated(false); return; }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Data မဖတ်နိုင်ပါ');
    setData(result); setAuthenticated(true);
    if (q.trim()) setTab('users');
  };

  useEffect(() => {
    fetch('/api/admin/session', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then(async (r) => {
      setAuthenticated(r.authenticated);
      if (r.authenticated) await load();
    }).catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (tab !== 'sakura' || !authenticated) return;
    let active = true;
    fetch('/api/admin/sakura-rtp', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'Sakura ဆက်တင်ကို မဖတ်နိုင်ပါ။');
        setSakuraRtp(String(data.rtpPercent));
        setSakuraRtpNotice('');
      })
      .catch((error) => { if (active) setSakuraRtpNotice(error instanceof Error ? error.message : 'Sakura ဆက်တင်ကို မဖတ်နိုင်ပါ။'); });
    return () => { active = false; };
  }, [tab, authenticated]);

  const saveSakuraRtp = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(sakuraRtp);
    if (!Number.isInteger(value) || value < 50 || value > 95) {
      setSakuraRtpNotice('50 မှ 95 အတွင်း ကိန်းပြည့်တန်ဖိုး ထည့်ပါ။');
      return;
    }
    setSakuraRtpBusy(true);
    setSakuraRtpNotice('');
    try {
      const response = await fetch('/api/admin/sakura-rtp', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtpPercent: value }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Sakura ဆက်တင်ကို သိမ်း၍မရပါ။');
      setSakuraRtp(String(result.rtpPercent));
      setSakuraRtpNotice('Sakura Fortune ဆက်တင်ကို သိမ်းပြီးပါပြီ။');
    } catch (error) {
      setSakuraRtpNotice(error instanceof Error ? error.message : 'Sakura ဆက်တင်ကို သိမ်း၍မရပါ။');
    } finally {
      setSakuraRtpBusy(false);
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }) });
      const result = await response.json();
      if (!response.ok) setError(result.error || 'Login မအောင်မြင်ပါ');
      else { setAuthenticated(true); setPassword(''); await load(); }
    } catch { setError('Server ချိတ်ဆက်မှု မအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ'); }
    finally { setBusy(false); }
  };

  const action = async (url: string, body: Row): Promise<boolean> => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setNotice(result.error || 'လုပ်ဆောင်မှု မအောင်မြင်ပါ'); return false; }
      setNotice('လုပ်ဆောင်ပြီးပါပြီ'); await load(); return true;
    } catch { setNotice('Server ချိတ်ဆက်မှု မအောင်မြင်ပါ'); return false; }
    finally { setBusy(false); }
  };

  const logout = async () => { await fetch('/api/admin/session', { method: 'DELETE', credentials: 'include' }); setAuthenticated(false); };

  if (authenticated === null) return <main className="min-h-screen bg-[#070a12] text-white grid place-items-center">Loading...</main>;
  if (!authenticated) return (
    <main className="min-h-screen bg-[#070a12] text-white grid place-items-center p-4">
      <form onSubmit={login} className="w-full max-w-sm rounded-3xl border border-amber-400/20 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400">X-SITE CONTROL</p><h1 className="mt-2 text-2xl font-black">Admin Dashboard</h1><p className="mt-1 text-xs text-white/50">Authorized operators only</p></div>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" className="mb-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="current-password" className="mb-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400" />
        {error && <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-amber-400 py-3 text-sm font-black text-black disabled:opacity-50">{busy ? 'စစ်ဆေးနေသည်...' : 'Admin Login'}</button>
      </form>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#070a12] text-white">
      <header className="border-b border-white/10 bg-zinc-950/90 px-4 py-4 backdrop-blur sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between"><div><p className="text-[10px] font-bold tracking-[0.3em] text-amber-400">X-SITE CONTROL CENTER</p><h1 className="text-xl font-black sm:text-2xl">Admin Dashboard</h1></div><button onClick={logout} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10">Logout</button></div></header>
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap gap-2">{(['overview', 'users', 'deposits', 'withdrawals', 'sakura'] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === item ? 'bg-amber-400 text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>{item === 'overview' ? 'Overview' : item === 'users' ? 'Users' : item === 'deposits' ? 'ငွေသွင်း' : item === 'withdrawals' ? 'ငွေထုတ်' : 'Sakura Fortune'}</button>)}{tab !== 'sakura' && <div className="ml-auto flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="UID / phone / name ရှာရန်" className="w-52 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-amber-400" /><button onClick={() => load()} className="rounded-xl bg-white/10 px-3 py-2 text-xs">Search</button></div>}</div>
        {notice && <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">{notice}</div>}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">{[
          ['Users', data.stats?.users],
          ['Total Balance', money(data.stats?.balance)],
          ['ငွေသွင်းသူ စုစုပေါင်း', data.stats?.totalDepositors],
          ['ငွေသွင်းအောင်မြင်သူ', data.stats?.successfulDepositors],
          ['အောင်မြင်ငွေသွင်းငွေ', money(data.stats?.successfulDepositAmount)],
          ['Pending Deposits', data.stats?.pendingDeposits],
          ['Pending Withdrawals', data.stats?.pendingWithdrawals],
        ].map(([label, value]) => <div key={String(label)} className="ledger-panel rounded-2xl p-4"><p className="text-xs text-white/50">{String(label)}</p><p className="mt-2 text-xl font-black text-amber-300">{String(value ?? '-')}</p></div>)}</div>
        {tab === 'overview' && <div className="grid gap-6 lg:grid-cols-2"><Queue title="Pending Deposits" rows={data.deposits} type="deposit" onAction={action} busy={busy} /><Queue title="Pending Withdrawals" rows={data.withdrawals} type="withdrawal" onAction={action} busy={busy} /></div>}
        {tab === 'deposits' && <Queue title="Pending Deposits" rows={data.deposits} type="deposit" onAction={action} busy={busy} />}
        {tab === 'withdrawals' && <Queue title="Pending Withdrawals" rows={data.withdrawals} type="withdrawal" onAction={action} busy={busy} />}
        {tab === 'users' && <UserTable rows={data.users} searchQuery={query} onAction={action} busy={busy} />}
        {tab === 'sakura' && <section className="max-w-2xl rounded-2xl border border-pink-400/20 bg-pink-950/20 p-5 sm:p-7">
          <h2 className="text-lg font-black text-pink-100">Sakura Fortune RTP (%)</h2>
          <p className="mt-2 text-sm text-white/60">50% မှ 95% အတွင်း ကိန်းပြည့်တန်ဖိုး သတ်မှတ်နိုင်သည်။ သိမ်းပြီးနောက်ကစားမည့်လှည့်မှုများတွင် သက်ရောက်ပါမည်။</p>
          <form onSubmit={saveSakuraRtp} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="block text-xs font-bold text-white/70">RTP ရာခိုင်နှုန်း
              <input type="number" min={50} max={95} step={1} value={sakuraRtp} onChange={(event) => setSakuraRtp(event.target.value)} className="mt-1 block w-36 rounded-xl border border-white/15 bg-black/40 px-3 py-3 font-mono text-lg text-white outline-none focus:border-pink-300" />
            </label>
            <button type="submit" disabled={sakuraRtpBusy} className="rounded-xl bg-pink-300 px-5 py-3 text-sm font-black text-zinc-950 disabled:opacity-50">{sakuraRtpBusy ? 'သိမ်းဆည်းနေသည်…' : 'သိမ်းဆည်းမည်'}</button>
          </form>
          {sakuraRtpNotice && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">{sakuraRtpNotice}</p>}
        </section>}
      </div>
    </main>
  );
}

function Queue({ title, rows, type, onAction, busy }: { title: string; rows: Row[]; type: 'deposit' | 'withdrawal'; onAction: (url: string, body: Row) => Promise<boolean>; busy: boolean }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const visibleRows = rows.filter((row) => !dismissed.has(String(row.id || row.depositId || row.withdrawalId)));
  const review = async (row: Row, decision: 'approve' | 'reject') => {
    const id = String(row.id || row.depositId || row.withdrawalId);
    if (!id) return;
    setDismissed((previous) => new Set(previous).add(id));
    const ok = await onAction('/api/admin/review', { type, id, decision });
    if (!ok) setDismissed((previous) => { const next = new Set(previous); next.delete(id); return next; });
  };
  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h2 className="mb-4 font-black">{title} <span className="text-xs text-white/40">({visibleRows.length})</span></h2><div className="space-y-3">{visibleRows.length === 0 && <p className="text-sm text-white/40">စာရင်းမရှိပါ</p>}{visibleRows.map((row) => {
    const id = String(row.id || row.depositId || row.withdrawalId);
    const boundBank = typeof row.accountBoundBank === 'string' ? (() => { try { return JSON.parse(String(row.accountBoundBank)); } catch { return null; } })() : row.accountBoundBank as Row | null;
    const trx = row.trxLast5 || (!String(row.receiptImage || '').startsWith('data:image') ? row.receiptImage : '');
    return <div key={id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-bold">{String(row.userName || row.userId || '-')}</p><p className="text-[11px] text-white/50">{id} · {date(row.createdAt)}</p></div><p className="font-black text-amber-300">{money(row.amount)}</p></div><p className="mt-2 text-xs text-white/60">{String(row.method || '')} {String(row.phone || '')} {String(row.accountName || '')}</p>{type === 'deposit' && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-xs font-bold text-amber-200">💳 Transaction ID နောက်ဆုံး ၅လုံး: <b className="ml-1 tracking-widest text-white">{String(trx || 'မပါရှိပါ')}</b></span><button onClick={() => setExpanded(expanded === id ? null : id)} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-xs font-bold text-cyan-200">{expanded === id ? 'Information ပိတ်မည်' : 'Account Information ကြည့်မည်'}</button></div>}{expanded === id && type === 'deposit' && <div className="mt-3 grid gap-x-4 gap-y-1.5 rounded-lg border border-cyan-400/20 bg-black/30 p-3 text-[11px] text-white/80 sm:grid-cols-2"><div>အမည်: <b>{String(row.userName || '-')}</b></div><div>UID: <span className="font-mono">{String(row.userId || '-')}</span></div><div>ချိတ်ထားသောဖုန်း: {String(row.accountPhone || row.phone || '-')}</div><div>Email: {String(row.accountEmail || '-')}</div><div>လက်ရှိ Balance: <b className="text-emerald-300">{money(row.accountBalance)}</b></div><div>Deposit မတင်မီ Balance: <b>{money(row.accountInitialBalance)}</b></div><div>Referral Balance: {money(row.accountReferralBalance)}</div><div>ဖိတ်ခေါ်သူ: {String(row.accountReferrerId || 'မရှိပါ')}</div><div>Referral Code: {String(row.accountReferralCode || '-')}</div><div>ဖိတ်ခေါ်အရေအတွက်: {String(row.accountReferralsCount || 0)} ယောက်</div><div>စုစုပေါင်း Deposit: {money(row.accountTotalSuccessfulDeposit)}</div><div>စုစုပေါင်း Bet: {money(row.accountTotalBetCumulative)}</div><div>Withdrawal အကြိမ်: {String(row.accountWithdrawalCount || 0)} ကြိမ်</div><div>First Deposit Bonus: {row.accountFirstDepositBonusClaimed ? 'Claimed' : 'မယူရသေးပါ'}</div><div>Account ဖွင့်ချိန်: {date(row.accountCreatedAt)}</div><div className="sm:col-span-2">ချိတ်ထားသော ငွေလွှဲအကောင့်: {boundBank ? `${String(boundBank.method || '')} ${String(boundBank.accountName || '')} ${String(boundBank.phone || '')}` : `${String(row.accountName || '-') } ${String(row.phone || '')}`}</div></div>}<div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => void review(row, 'approve')} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-black disabled:opacity-50">Approve</button><button disabled={busy} onClick={() => void review(row, 'reject')} className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50">Reject</button></div></div>;
  })}</div></section>;
}
function UserTable({ rows, searchQuery, onAction, busy }: { rows: Row[]; searchQuery: string; onAction: (url: string, body: Row) => void; busy: boolean }) {
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [expandedUid, setExpandedUid] = useState<string | false | null>(null);
  const autoExpandedUid = searchQuery.trim() && rows.length === 1 ? String(rows[0].uid) : null;
  const activeExpandedUid = expandedUid === false ? null : (expandedUid || autoExpandedUid);
 return <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-white/5 text-white/50"><tr><th className="p-3">User</th><th className="p-3">Phone</th><th className="p-3">Balance</th><th className="p-3">Action</th></tr></thead><tbody>{rows.map((row) => { const uid = String(row.uid); const bank = typeof row.boundBank === 'string' ? (() => { try { return JSON.parse(String(row.boundBank)); } catch { return null; } })() : row.boundBank as Row | null; return <Fragment key={uid}><tr className="border-t border-white/10"><td className="p-3"><b>{String(row.fullName || '-')}</b><br /><span className="text-white/40">{uid}</span></td><td className="p-3">{String(row.phoneNumber || '-')}</td><td className="p-3 font-bold text-amber-300">{money(row.balance)}</td><td className="p-3"><div className="flex min-w-56 flex-wrap gap-2"><button onClick={() => setExpandedUid(activeExpandedUid === uid ? false : uid)} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-2 font-bold text-cyan-200">{activeExpandedUid === uid ? 'Information ပိတ်မည်' : 'Information ကြည့်မည်'}</button><input value={amount[uid] || ''} onChange={(e) => setAmount({ ...amount, [uid]: e.target.value })} placeholder="Amount" className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-2" /><button disabled={busy} onClick={() => onAction('/api/admin/balance', { uid: row.uid, amount: amount[uid], action: 'topup', note: 'Admin dashboard topup' })} className="rounded-lg bg-emerald-400 px-2 py-2 font-bold text-black">+</button><button disabled={busy} onClick={() => onAction('/api/admin/balance', { uid: row.uid, amount: amount[uid], action: 'deduct', note: 'Admin dashboard deduction' })} className="rounded-lg bg-red-400/20 px-2 py-2 font-bold text-red-200">−</button></div></td></tr>{activeExpandedUid === uid && <tr className="border-t border-cyan-400/20 bg-cyan-400/5"><td colSpan={4} className="p-4"><div className="grid gap-x-5 gap-y-2 text-[11px] text-white/80 sm:grid-cols-2 lg:grid-cols-3"><div>အမည်: <b>{String(row.fullName || '-')}</b></div><div>UID: <span className="font-mono">{uid}</span></div><div>Role: {String(row.role || 'user')}</div><div>Phone: {String(row.phoneNumber || '-')}</div><div>Email: {String(row.email || '-')}</div><div>လက်ရှိ Balance: <b className="text-emerald-300">{money(row.balance)}</b></div><div>Referral Balance: {money(row.referralBalance)}</div><div>Referral Code: {String(row.referralCode || '-')}</div><div>ဖိတ်ခေါ်သူ: {String(row.referrerId || 'မရှိပါ')}</div><div>ဖိတ်ခေါ်အရေအတွက်: {String(row.referralsCount || 0)} ယောက်</div><div>Deposited Referrals: {String(row.depositedReferralsCount || 0)} ယောက်</div><div>Referral Total Deposits: {money(row.referralTotalDeposits)}</div><div>Total Successful Deposits: {money(row.totalSuccessfulDeposit)}</div><div>Total Bets: {money(row.totalBetCumulative)}</div><div>Withdrawals: {String(row.withdrawalCount || 0)} ကြိမ်</div><div>Wager Since Withdrawal: {money(row.wagerSinceLastWithdrawal)}</div><div>First Deposit Bonus: {row.firstDepositBonusClaimed ? 'Claimed' : 'မယူရသေးပါ'}</div><div>Successful Deposit: {row.hasSuccessfulDeposit ? 'Yes' : 'No'}</div><div>Hedging Flag: {row.isHedgingFlagged ? 'Flagged' : 'No'}</div><div>Account Created: {date(row.createdAt)}</div><div>Last Updated: {date(row.updatedAt)}</div><div className="sm:col-span-2 lg:col-span-3">ချိတ်ထားသော ငွေလွှဲအကောင့်: {bank ? `${String(bank.method || '')} ${String(bank.accountName || '')} ${String(bank.phone || '')}` : '-'}</div></div></td></tr>}</Fragment>; })}</tbody></table></div></section>;
}
