import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
        <span className="text-2xl font-black text-amber-400">404</span>
      </div>
      <h2 className="text-xl font-bold mb-2">စာမျက်နှာ ရှာမတွေ့ပါ</h2>
      <p className="text-sm text-zinc-400 max-w-sm mb-6">
        သင်ရှာဖွေနေသော စာမျက်နှာ မရှိတော့ပါ သို့မဟုတ် ရွှေ့ပြောင်းသွားပါပြီ။
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all shadow-lg active:scale-95"
      >
        ပင်မစာမျက်နှာသို့ ပြန်သွားမည်
      </Link>
    </div>
  );
}
