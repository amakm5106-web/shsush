'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { CreditCard, Minus, Plus } from 'lucide-react';

type Row = Record<string, unknown>;
type Data = { users: Row[]; deposits: Row[]; withdrawals: Row[]; stats?: Row };
export type DashboardSection = 'overview' | 'users' | 'deposits' | 'withdrawals' | 'settings';

const money = (v: unknown) => `${Number(v || 0).toLocaleString()} Ks`;
const date = (v: unknown) => v ? new Date(Number(v)).toLocaleString() : '-';

export default function AdminDashboard({ section }: { section: DashboardSection }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<Data>({ users: [], deposits: [], withdrawals: [] });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [dailyBonus, setDailyBonus] = useState('0');
  const [dailyBonusBusy, setDailyBonusBusy] = useState(false);
  const [dailyBonusNotice, setDailyBonusNotice] = useState('');
  const [sakuraRtp, setSakuraRtp] = useState('80');
  const [sakuraRtpBusy, setSakuraRtpBusy] = useState(false);
  const [sakuraRtpNotice, setSakuraRtpNotice] = useState('');
  const [buffaloRtp, setBuffaloRtp] = useState('80');
  const [buffaloRtpBusy, setBuffaloRtpBusy] = useState(false);
  const [buffaloRtpNotice, setBuffaloRtpNotice] = useState('');

  const load = async (q = query) => {
    const response = await fetch(`/api/admin/overview${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store', credentials: 'include' });
    if (response.status === 401) { setAuthenticated(false); return; }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Data မဖတ်နိုင်ပါ');
    setData(result); setAuthenticated(true);
  };

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get('q') || '';
    fetch('/api/admin/session', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then(async (r) => {
      setAuthenticated(r.authenticated);
      if (r.authenticated) await load(initialQuery);
    }).catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (section !== 'settings' || !authenticated) return;
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
  }, [section, authenticated]);

  useEffect(() => {
    if (section !== 'settings' || !authenticated) return;
    let active = true;
    fetch('/api/admin/buffalo-rtp', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'Buffalo RTP ဆက်တင်ကို မဖတ်နိုင်ပါ။');
        setBuffaloRtp(String(data.rtpPercent));
        setBuffaloRtpNotice('');
      })
      .catch((error) => { if (active) setBuffaloRtpNotice(error instanceof Error ? error.message : 'Buffalo RTP ဆက်တင်ကို မဖတ်နိုင်ပါ။'); });
    return () => { active = false; };
  }, [section, authenticated]);

  useEffect(() => {
    if (section !== 'settings' || !authenticated) return;
    let active = true;
    fetch('/api/admin/daily-deposit-bonus', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'နေ့စဉ်ဘောနပ်စ်ကို မဖတ်နိုင်ပါ။');
        setDailyBonus(String(data.bonusPercent));
        setDailyBonusNotice('');
      })
      .catch((error) => { if (active) setDailyBonusNotice(error instanceof Error ? error.message : 'နေ့စဉ်ဘောနပ်စ်ကို မဖတ်နိုင်ပါ။'); });
    return () => { active = false; };
  }, [section, authenticated]);

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

  const saveBuffaloRtp = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(buffaloRtp);
    if (!Number.isInteger(value) || value < 50 || value > 95) {
      setBuffaloRtpNotice('50 မှ 95 အတွင်း ကိန်းပြည့်တန်ဖိုး ထည့်ပါ။');
      return;
    }
    setBuffaloRtpBusy(true);
    setBuffaloRtpNotice('');
    try {
      const response = await fetch('/api/admin/buffalo-rtp', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtpPercent: value }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Buffalo RTP ဆက်တင်ကို သိမ်း၍မရပါ။');
      setBuffaloRtp(String(result.rtpPercent));
      setBuffaloRtpNotice('Buffalo RTP ဆက်တင်ကို သိမ်းပြီးပါပြီ။');
    } catch (error) {
      setBuffaloRtpNotice(error instanceof Error ? error.message : 'Buffalo RTP ဆက်တင်ကို သိမ်း၍မရပါ။');
    } finally {
      setBuffaloRtpBusy(false);
    }
  };

  const saveDailyBonus = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(dailyBonus);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setDailyBonusNotice('0 မှ 100 အတွင်း ကိန်းပြည့်တန်ဖိုး ထည့်ပါ။');
      return;
    }
    setDailyBonusBusy(true);
    setDailyBonusNotice('');
    try {
      const response = await fetch('/api/admin/daily-deposit-bonus', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bonusPercent: value }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'နေ့စဉ်ဘောနပ်စ်ကို သိမ်း၍မရပါ။');
      setDailyBonus(String(result.bonusPercent));
      setDailyBonusNotice('နေ့စဉ်ငွေသွင်းဘောနပ်စ်ကို သိမ်းပြီးပါပြီ။');
    } catch (error) {
      setDailyBonusNotice(error instanceof Error ? error.message : 'နေ့စဉ်ဘောနပ်စ်ကို သိမ်း၍မရပါ။');
    } finally {
      setDailyBonusBusy(false);
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
      setNotice(result.bonusAmount > 0
        ? `ငွေသွင်း ${money(result.amount)} နှင့် နေ့စဉ်ဘောနပ်စ် ${money(result.bonusAmount)} (${result.bonusPercent}%) အောင်မြင်စွာ ထည့်ပြီးပါပြီ။`
        : result.dailyBonusAlreadyUsed ? 'ငွေသွင်းမှု အတည်ပြုပြီးပါပြီ။ ယနေ့ဘောနပ်စ်ကို ယခင်ငွေသွင်းမှုတွင် သုံးပြီးဖြစ်၍ ထပ်မထည့်ပါ။' : 'လုပ်ဆောင်ပြီးပါပြီ');
      await load(); return true;
    } catch { setNotice('Server ချိတ်ဆက်မှု မအောင်မြင်ပါ'); return false; }
    finally { setBusy(false); }
  };

  const logout = async () => { await fetch('/api/admin/session', { method: 'DELETE', credentials: 'include' }); setAuthenticated(false); };

  if (authenticated === null) return <main className="admin-light-shell min-h-screen bg-[#070a12] text-white grid place-items-center">Loading...</main>;
  if (!authenticated) return (
    <main className="admin-light-shell min-h-screen bg-[#070a12] text-white grid place-items-center p-4">
      <form onSubmit={login} className="w-full max-w-sm rounded-3xl border border-amber-400/20 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400">X-SITE CONTROL</p><h1 className="mt-2 text-2xl font-black">Admin Dashboard</h1><p className="mt-1 text-xs text-white/50">Authorized operators only</p></div>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" className="mb-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="current-password" className="mb-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-amber-400" />
        {error && <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-amber-400 py-3 text-sm font-black text-black disabled:opacity-50">{busy ? 'စစ်ဆေးနေသည်...' : 'Admin Login'}</button>
      </form>
    </main>
  );

  const navItems: { key: DashboardSection; href: string; title: string; subtitle: string; tone: string }[] = [
    { key: 'overview', href: '/phyophyolover', title: 'Overview', subtitle: 'အကျဉ်းချုပ်နှင့် လုပ်ဆောင်စရာများ', tone: 'amber' },
    { key: 'users', href: '/phyophyolover/users', title: 'အသုံးပြုသူများ', subtitle: 'အကောင့်ရှာရန်နှင့် စီမံရန်', tone: 'cyan' },
    { key: 'deposits', href: '/phyophyolover/deposits', title: 'ငွေသွင်း', subtitle: 'ငွေသွင်းတောင်းဆိုမှုများ', tone: 'emerald' },
    { key: 'withdrawals', href: '/phyophyolover/withdrawals', title: 'ငွေထုတ်', subtitle: 'ငွေထုတ်တောင်းဆိုမှုများ', tone: 'rose' },
    { key: 'settings', href: '/phyophyolover/settings', title: 'ဆက်တင်နှင့် ပရိုမိုးရှင်း', subtitle: 'ဘောနပ်စ်၊ Sakura နှင့် Buffalo RTP', tone: 'pink' },
  ];
  const pageTitle = navItems.find((item) => item.key === section)?.title || 'Overview';

  return (
    <main className="admin-light-shell min-h-screen bg-[#070a12] text-white">
      <header className="border-b border-white/10 bg-zinc-950/90 px-4 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={section === 'overview' ? '/' : '/phyophyolover'} className="inline-flex min-h-11 items-center rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 text-sm font-bold text-amber-100 hover:bg-amber-300/20">
              {section === 'overview' ? '← ပင်မစာမျက်နှာ' : '← Dashboard သို့ပြန်ရန်'}
            </Link>
            <div><p className="text-[10px] font-bold tracking-[0.3em] text-amber-400">X-SITE CONTROL CENTER</p><h1 className="text-xl font-black sm:text-2xl">{pageTitle}</h1></div>
          </div>
          <button onClick={logout} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-bold text-white/80 hover:bg-white/10">Logout</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <nav aria-label="Admin sections" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {navItems.map((item) => {
            const active = section === item.key;
            const selectedStyle = item.tone === 'emerald' ? { card: 'border-emerald-300/70 bg-emerald-400/15 shadow-lg shadow-emerald-950/20', title: 'text-emerald-200' }
              : item.tone === 'cyan' ? { card: 'border-cyan-300/70 bg-cyan-400/15 shadow-lg shadow-cyan-950/20', title: 'text-cyan-200' }
              : item.tone === 'rose' ? { card: 'border-rose-300/70 bg-rose-400/15 shadow-lg shadow-rose-950/20', title: 'text-rose-200' }
              : item.tone === 'pink' ? { card: 'border-pink-300/70 bg-pink-400/15 shadow-lg shadow-pink-950/20', title: 'text-pink-200' }
              : { card: 'border-amber-300/70 bg-amber-400/15 shadow-lg shadow-amber-950/20', title: 'text-amber-200' };
            return <Link key={item.key} href={item.href} aria-current={active ? 'page' : undefined} className={`flex min-h-[84px] flex-col justify-center rounded-2xl border p-4 transition ${active ? selectedStyle.card : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'}`}>
              <span className={`text-base font-black ${active ? selectedStyle.title : 'text-white'}`}>{item.title}</span>
              <span className="mt-1 text-xs text-white/50">{item.subtitle}</span>
            </Link>;
          })}
        </nav>
        {notice && <div role="status" className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{notice}</div>}
        {section === 'users' && <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="mb-5 flex flex-wrap gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="UID / ဖုန်း / အမည်ဖြင့် ရှာရန်" className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-sm outline-none focus:border-cyan-300" />
          <button type="submit" className="min-h-12 rounded-xl bg-cyan-300 px-6 text-sm font-black text-zinc-950">ရှာရန်</button>
        </form>}
        {section === 'overview' && <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[
            ['အသုံးပြုသူ စုစုပေါင်း', data.stats?.users],
            ['Balance စုစုပေါင်း', money(data.stats?.balance)],
            ['ငွေသွင်းသူ စုစုပေါင်း', data.stats?.totalDepositors],
            ['အောင်မြင်ငွေသွင်းသူ', data.stats?.successfulDepositors],
            ['အောင်မြင်ငွေသွင်းငွေ', money(data.stats?.successfulDepositAmount)],
            ['စောင့်ဆိုင်းငွေသွင်း', data.stats?.pendingDeposits],
            ['စောင့်ဆိုင်းငွေထုတ်', data.stats?.pendingWithdrawals],
          ].map(([label, value]) => <div key={String(label)} className="ledger-panel rounded-2xl p-4"><p className="text-xs text-white/50">{String(label)}</p><p className="mt-2 text-xl font-black text-amber-300">{String(value ?? '-')}</p></div>)}</div>
          <div className="grid gap-6 lg:grid-cols-2"><Queue title="Pending Deposits" rows={data.deposits} type="deposit" onAction={action} busy={busy} /><Queue title="Pending Withdrawals" rows={data.withdrawals} type="withdrawal" onAction={action} busy={busy} /></div>
        </>}
        {section === 'deposits' && <Queue title="Pending Deposits" rows={data.deposits} type="deposit" onAction={action} busy={busy} />}
        {section === 'withdrawals' && <Queue title="Pending Withdrawals" rows={data.withdrawals} type="withdrawal" onAction={action} busy={busy} />}
        {section === 'users' && <UserTable rows={data.users} searchQuery={query} onAction={action} busy={busy} />}
        {section === 'settings' && <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-950/20 p-5 sm:p-7">
            <div className="mb-5"><h2 className="text-lg font-black text-emerald-100">နေ့စဉ် ငွေသွင်းဘောနပ်စ်</h2><p className="mt-2 text-sm leading-6 text-white/60">0% မှ 100% အတွင်း ရာခိုင်နှုန်းကို သတ်မှတ်ပါ။ 0% ထားလျှင် ပိတ်ထားသည်။ ငွေသွင်းတောင်းဆိုမှုတင်သည့် မြန်မာရက်စွဲအလိုက် အသုံးပြုသူတစ်ဦးလျှင် ပထမအတည်ပြုငွေသွင်းမှုတစ်ခုတွင်သာ သက်ရောက်ပါမည်။</p></div>
            <form onSubmit={saveDailyBonus} className="flex flex-wrap items-end gap-3">
              <label className="block text-sm font-bold text-white/75">ဘောနပ်စ်နှုန်း (%)
                <input type="number" min={0} max={100} step={1} value={dailyBonus} onChange={(event) => setDailyBonus(event.target.value)} className="mt-2 block w-40 rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-xl text-white outline-none focus:border-emerald-300" />
              </label>
              <button type="submit" disabled={dailyBonusBusy} className="min-h-12 rounded-xl bg-emerald-300 px-6 text-sm font-black text-zinc-950 disabled:opacity-50">{dailyBonusBusy ? 'သိမ်းဆည်းနေသည်…' : 'ဘောနပ်စ်နှုန်း သိမ်းမည်'}</button>
            </form>
            {dailyBonusNotice && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">{dailyBonusNotice}</p>}
          </section>
          <section className="rounded-2xl border border-pink-400/20 bg-pink-950/20 p-5 sm:p-7">
            <h2 className="text-lg font-black text-pink-100">Sakura Fortune RTP (%)</h2>
            <p className="mt-2 text-sm text-white/60">50% မှ 95% အတွင်း ကိန်းပြည့်တန်ဖိုး သတ်မှတ်နိုင်သည်။ သိမ်းပြီးနောက်ကစားမည့်လှည့်မှုများတွင် သက်ရောက်ပါမည်။</p>
            <form onSubmit={saveSakuraRtp} className="mt-5 flex flex-wrap items-end gap-3">
              <label className="block text-sm font-bold text-white/70">RTP ရာခိုင်နှုန်း
                <input type="number" min={50} max={95} step={1} value={sakuraRtp} onChange={(event) => setSakuraRtp(event.target.value)} className="mt-2 block w-40 rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-xl text-white outline-none focus:border-pink-300" />
              </label>
              <button type="submit" disabled={sakuraRtpBusy} className="min-h-12 rounded-xl bg-pink-300 px-6 text-sm font-black text-zinc-950 disabled:opacity-50">{sakuraRtpBusy ? 'သိမ်းဆည်းနေသည်…' : 'Sakura ဆက်တင် သိမ်းမည်'}</button>
            </form>
            {sakuraRtpNotice && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">{sakuraRtpNotice}</p>}
          </section>
          <section className="rounded-2xl border border-cyan-400/20 bg-cyan-950/20 p-5 sm:p-7">
            <h2 className="text-lg font-black text-cyan-100">Buffalo RTP (%)</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">Spin တစ်ခုတွင် Scatter 3 ခုထွက်လျှင် Free Spin 3 ကြိမ်ရပြီး Free Spin ထဲတွင်လည်း Scatter 3 ခုထပ်ထွက်လျှင် retrigger လုပ်သည်။ Paid stake စုစုပေါင်းအပေါ် paid နှင့် Free Spin payout အားလုံး၏ ရေရှည်ပြန်ပေးနှုန်း target ဖြစ်သည်။ 50% မှ 95% အတွင်း သတ်မှတ်နိုင်သည်။ သိမ်းပြီးနောက် စမည့် paid round အသစ်များတွင် သက်ရောက်ပြီး ထို round မှရသော Free Spins များသည် RTP တူညီစွာအသုံးပြုမည်။ တစ်လှည့်ချင်းအတွက် အနိုင်အရှုံးအာမခံချက် မဟုတ်ပါ။</p>
            <form onSubmit={saveBuffaloRtp} className="mt-5 flex flex-wrap items-end gap-3">
              <label className="block text-sm font-bold text-white/70">RTP ရာခိုင်နှုန်း
                <input type="number" min={50} max={95} step={1} value={buffaloRtp} onChange={(event) => setBuffaloRtp(event.target.value)} className="mt-2 block w-40 rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-xl text-white outline-none focus:border-cyan-300" />
              </label>
              <button type="submit" disabled={buffaloRtpBusy} className="min-h-12 rounded-xl bg-cyan-300 px-6 text-sm font-black text-zinc-950 disabled:opacity-50">{buffaloRtpBusy ? 'သိမ်းဆည်းနေသည်…' : 'Buffalo RTP သိမ်းမည်'}</button>
            </form>
            {buffaloRtpNotice && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">{buffaloRtpNotice}</p>}
          </section>
        </div>}
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
    return <div key={id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-bold">{String(row.userName || row.userId || '-')}</p><p className="text-[11px] text-white/50">{id} · {date(row.createdAt)}</p></div><p className="font-black text-amber-300">{money(row.amount)}</p></div><p className="mt-2 text-xs text-white/60">{String(row.method || '')} {String(row.phone || '')} {String(row.accountName || '')}</p>{type === 'deposit' && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-xs font-bold text-amber-200"><CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Transaction ID နောက်ဆုံး ၅လုံး: <b className="ml-1 tracking-widest text-white">{String(trx || 'မပါရှိပါ')}</b></span><button onClick={() => setExpanded(expanded === id ? null : id)} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-xs font-bold text-cyan-200">{expanded === id ? 'Information ပိတ်မည်' : 'Account Information ကြည့်မည်'}</button></div>}{expanded === id && type === 'deposit' && <div className="mt-3 grid gap-x-4 gap-y-1.5 rounded-lg border border-cyan-400/20 bg-black/30 p-3 text-[11px] text-white/80 sm:grid-cols-2"><div>အမည်: <b>{String(row.userName || '-')}</b></div><div>UID: <span className="font-mono">{String(row.userId || '-')}</span></div><div>ချိတ်ထားသောဖုန်း: {String(row.accountPhone || row.phone || '-')}</div><div>Email: {String(row.accountEmail || '-')}</div><div>လက်ရှိ Balance: <b className="text-emerald-300">{money(row.accountBalance)}</b></div><div>Deposit မတင်မီ Balance: <b>{money(row.accountInitialBalance)}</b></div><div>Referral Balance: {money(row.accountReferralBalance)}</div><div>ဖိတ်ခေါ်သူ: {String(row.accountReferrerId || 'မရှိပါ')}</div><div>Referral Code: {String(row.accountReferralCode || '-')}</div><div>ဖိတ်ခေါ်အရေအတွက်: {String(row.accountReferralsCount || 0)} ယောက်</div><div>စုစုပေါင်း Deposit: {money(row.accountTotalSuccessfulDeposit)}</div><div>စုစုပေါင်း Bet: {money(row.accountTotalBetCumulative)}</div><div>Withdrawal အကြိမ်: {String(row.accountWithdrawalCount || 0)} ကြိမ်</div><div>First Deposit Bonus: {row.accountFirstDepositBonusClaimed ? 'Claimed' : 'မယူရသေးပါ'}</div><div>Account ဖွင့်ချိန်: {date(row.accountCreatedAt)}</div><div className="sm:col-span-2">ချိတ်ထားသော ငွေလွှဲအကောင့်: {boundBank ? `${String(boundBank.method || '')} ${String(boundBank.accountName || '')} ${String(boundBank.phone || '')}` : `${String(row.accountName || '-') } ${String(row.phone || '')}`}</div></div>}<div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => void review(row, 'approve')} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-black disabled:opacity-50">Approve</button><button disabled={busy} onClick={() => void review(row, 'reject')} className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50">Reject</button></div></div>;
  })}</div></section>;
}
function UserTable({ rows, searchQuery, onAction, busy }: { rows: Row[]; searchQuery: string; onAction: (url: string, body: Row) => void; busy: boolean }) {
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [expandedUid, setExpandedUid] = useState<string | false | null>(null);
  const autoExpandedUid = searchQuery.trim() && rows.length === 1 ? String(rows[0].uid) : null;
  const activeExpandedUid = expandedUid === false ? null : (expandedUid || autoExpandedUid);
 return <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-white/5 text-white/50"><tr><th className="p-3">User</th><th className="p-3">Phone</th><th className="p-3">Balance</th><th className="p-3">Action</th></tr></thead><tbody>{rows.map((row) => { const uid = String(row.uid); const bank = typeof row.boundBank === 'string' ? (() => { try { return JSON.parse(String(row.boundBank)); } catch { return null; } })() : row.boundBank as Row | null; return <Fragment key={uid}><tr className="border-t border-white/10"><td className="p-3"><b>{String(row.fullName || '-')}</b><br /><span className="text-white/40">{uid}</span></td><td className="p-3">{String(row.phoneNumber || '-')}</td><td className="p-3 font-bold text-amber-300">{money(row.balance)}</td><td className="p-3"><div className="flex min-w-56 flex-wrap gap-2"><button onClick={() => setExpandedUid(activeExpandedUid === uid ? false : uid)} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-2 font-bold text-cyan-200">{activeExpandedUid === uid ? 'Information ပိတ်မည်' : 'Information ကြည့်မည်'}</button><input value={amount[uid] || ''} onChange={(e) => setAmount({ ...amount, [uid]: e.target.value })} placeholder="Amount" className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-2" /><button disabled={busy} onClick={() => onAction('/api/admin/balance', { uid: row.uid, amount: amount[uid], action: 'topup', note: 'Admin dashboard topup' })} aria-label="Balance တိုးရန်" title="Balance တိုးရန်" className="rounded-lg border border-black/15 bg-white/70 p-2 text-black"><Plus className="h-4 w-4" aria-hidden="true" /></button><button disabled={busy} onClick={() => onAction('/api/admin/balance', { uid: row.uid, amount: amount[uid], action: 'deduct', note: 'Admin dashboard deduction' })} aria-label="Balance လျှော့ရန်" title="Balance လျှော့ရန်" className="rounded-lg border border-black/15 bg-white/70 p-2 text-black"><Minus className="h-4 w-4" aria-hidden="true" /></button></div></td></tr>{activeExpandedUid === uid && <tr className="border-t border-cyan-400/20 bg-cyan-400/5"><td colSpan={4} className="p-4"><div className="grid gap-x-5 gap-y-2 text-[11px] text-white/80 sm:grid-cols-2 lg:grid-cols-3"><div>အမည်: <b>{String(row.fullName || '-')}</b></div><div>UID: <span className="font-mono">{uid}</span></div><div>Role: {String(row.role || 'user')}</div><div>Phone: {String(row.phoneNumber || '-')}</div><div>Email: {String(row.email || '-')}</div><div>လက်ရှိ Balance: <b className="text-emerald-300">{money(row.balance)}</b></div><div>Referral Balance: {money(row.referralBalance)}</div><div>Referral Code: {String(row.referralCode || '-')}</div><div>ဖိတ်ခေါ်သူ: {String(row.referrerId || 'မရှိပါ')}</div><div>ဖိတ်ခေါ်အရေအတွက်: {String(row.referralsCount || 0)} ယောက်</div><div>Deposited Referrals: {String(row.depositedReferralsCount || 0)} ယောက်</div><div>Referral Total Deposits: {money(row.referralTotalDeposits)}</div><div>Total Successful Deposits: {money(row.totalSuccessfulDeposit)}</div><div>Total Bets: {money(row.totalBetCumulative)}</div><div>Withdrawals: {String(row.withdrawalCount || 0)} ကြိမ်</div><div>Wager Since Withdrawal: {money(row.wagerSinceLastWithdrawal)}</div><div>First Deposit Bonus: {row.firstDepositBonusClaimed ? 'Claimed' : 'မယူရသေးပါ'}</div><div>Successful Deposit: {row.hasSuccessfulDeposit ? 'Yes' : 'No'}</div><div>Hedging Flag: {row.isHedgingFlagged ? 'Flagged' : 'No'}</div><div>Account Created: {date(row.createdAt)}</div><div>Last Updated: {date(row.updatedAt)}</div><div className="sm:col-span-2 lg:col-span-3">ချိတ်ထားသော ငွေလွှဲအကောင့်: {bank ? `${String(bank.method || '')} ${String(bank.accountName || '')} ${String(bank.phone || '')}` : '-'}</div></div></td></tr>}</Fragment>; })}</tbody></table></div></section>;
}
