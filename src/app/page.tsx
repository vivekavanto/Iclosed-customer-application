import Link from "next/link";

function SiteHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center">
      <div className="max-w-7xl mx-auto w-full px-6 lg:px-10 flex items-center justify-between">
        <Link href="/" className="flex items-center select-none">
          <span
            className="text-[#C10007] font-bold italic text-xl leading-none"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            i
          </span>
          <span className="font-bold text-xl text-[#1a1a1a] tracking-tight leading-none">
            Closed
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-[#1a1a1a] rounded-lg hover:bg-gray-50 transition-colors"
          >
            Login
          </Link>
          <Link
            href="/intake"
            className="px-4 py-2 text-sm font-semibold !text-white bg-[#C10007] rounded-sm hover:bg-[#a00006] transition-colors shadow-sm"
          >
            Start your closing
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="pt-14 min-h-screen flex items-center justify-center bg-white">
        <h1 className="text-3xl font-semibold text-[#1a1a1a]">Home page</h1>
      </main>
    </>
  );
}
