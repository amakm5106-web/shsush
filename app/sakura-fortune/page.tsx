import Link from 'next/link';

export default function SakuraFortunePage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#180c15]">
      <iframe
        title="Sakura Fortune Deluxe MMK game"
        src="/games/sakura-fortune/index.html"
        className="h-[100dvh] w-full border-0"
        allow="autoplay; fullscreen"
      />
      <Link
        href="/"
        className="fixed left-3 top-3 z-50 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 bg-black/75 px-3.5 text-xs font-black text-white shadow-xl backdrop-blur-md transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span aria-hidden="true">←</span>
        <span>ဂိမ်းများ</span>
      </Link>
    </main>
  );
}
