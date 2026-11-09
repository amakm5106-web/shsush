'use client';

import { useEffect, useState } from 'react';

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
  const [tab, setTab] = useState<'overview' | 'users' | 'deposits' | 'withdrawals'>('overview');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async (q = query) => {
    const response = await fetch(`/api/admin/overview${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store', credentials: 'include' });
    if (response.status === 401) { setAuthenticated(false); return; }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Data မဖတ်နိုင်ပါ');
    setData(result); setAuthenticated(true);
  };

  useEffect(() => {
    fetch('/api/admin/session', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then(async (r) => {
      setAuthenticated(r.authenticated);
      if (r.authenticated) await load();
    }).catch(() => setAuthenticated(false));
  }, []);

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

  const action = async (url: string, body: Row) => {
    setBusy(true); setNotice('');
    const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) setNotice(result.error || 'လုပ်ဆောင်မှု မအောင်မြင်ပါ');
    else { setNotice('လုပ်ဆောင်ပြီးပါပြီ'); await load(); }
    setBusy(false);
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
        <div className="mb-6 flex flex-wrap gap-2">{(['overview', 'users', 'deposits', 'withdrawals'] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === item ? 'bg-amber-400 text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>{item === 'overview' ? 'Overview' : item === 'users' ? 'Users' : item === 'deposits' ? 'ငွေသွင်း' : 'ငွေထုတ်'}</button>)}<div className="ml-auto flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="UID / phone / name ရှာရန်" className="w-52 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-amber-400" /><button onClick={() => load()} className="rounded-xl bg-white/10 px-3 py-2 text-xs">Search</button></div></div>
        {notice && <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">{notice}</div>}
        <div className="mb-6 grid gap-3 sm:grid-cols-4">{[['Users', data.stats?.users], ['Total Balance', money(data.stats?.balance)], ['Pending Deposits', data.stats?.pendingDeposits], ['Pending Withdrawals', data.stats?.pendingWithdrawals]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">{String(label)}</p><p className="mt-2 text-xl font-black text-amber-300">{String(value ?? '-')}</p></div>)}</div>
        {tab === 'overview' && <div className="grid gap-6 lg:grid-cols-2"><Queue title="Pending Deposits" rows={data.deposits} type="deposit" onAction={action} busy={busy} /><Queue title="Pending Withdrawals" rows={data.withdrawals} type="withdrawal" onAction={action} busy={busy} /></div>}
        {tab === 'deposits' && <Queue title="Pending Deposits" rows={data.deposits} type="deposit" onAction={action} busy={busy} />}
        {tab === 'withdrawals' && <Queue title="Pending Withdrawals" rows={data.withdrawals} type="withdrawal" onAction={action} busy={busy} />}
        {tab === 'users' && <UserTable rows={data.users} onAction={action} busy={busy} />}
      </div>
    </main>
  );
}

function Queue({ title, rows, type, onAction, busy }: { title: string; rows: Row[]; type: 'deposit' | 'withdrawal'; onAction: (url: string, body: Row) => void; busy: boolean }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h2 className="mb-4 font-black">{title} <span className="text-xs text-white/40">({rows.length})</span></h2><div className="space-y-3">{rows.length === 0 && <p className="text-sm text-white/40">စာရင်းမရှိပါ</p>}{rows.map((row) => <div key={String(row.id)} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-bold">{String(row.userName || row.userId || '-')}</p><p className="text-[11px] text-white/50">{String(row.id)} · {date(row.createdAt)}</p></div><p className="font-black text-amber-300">{money(row.amount)}</p></div><p className="mt-2 text-xs text-white/60">{String(row.method || '')} {String(row.phone || '')} {String(row.accountName || '')}</p><div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => onAction('/api/admin/review', { type, id: row.id, decision: 'approve' })} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-black">Approve</button><button disabled={busy} onClick={() => onAction('/api/admin/review', { type, id: row.id, decision: 'reject' })} className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold text-red-200">Reject</button></div></div>)}</div></section>;
}

function UserTable({ rows, onAction, busy }: { rows: Row[]; onAction: (url: string, body: Row) => void; busy: boolean }) {
  const [amount, setAmount] = useState<Record<string, string>>({});
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-white/5 text-white/50"><tr><th className="p-3">User</th><th className="p-3">Phone</th><th className="p-3">Balance</th><th className="p-3">Action</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.uid)} className="border-t border-white/10"><td className="p-3"><b>{String(row.fullName || '-')}</b><br /><span className="text-white/40">{String(row.uid)}</span></td><td className="p-3">{String(row.phoneNumber || '-')}</td><td className="p-3 font-bold text-amber-300">{money(row.balance)}</td><td className="p-3"><div className="flex min-w-56 gap-2"><input value={amount[String(row.uid)] || ''} onChange={(e) => setAmount({ ...amount, [String(row.uid)]: e.target.value })} placeholder="Amount" className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-2" /><button disabled={busy} onClick={() => onAction('/api/admin/balance', { uid: row.uid, amount: amount[String(row.uid)], action: 'topup', note: 'Admin dashboard topup' })} className="rounded-lg bg-emerald-400 px-2 py-2 font-bold text-black">+</button><button disabled={busy} onClick={() => onAction('/api/admin/balance', { uid: row.uid, amount: amount[String(row.uid)], action: 'deduct', note: 'Admin dashboard deduction' })} className="rounded-lg bg-red-400/20 px-2 py-2 font-bold text-red-200">−</button></div></td></tr>)}</tbody></table></div></section>;
}
