import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function BlogNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fdfcfc] px-4">
      <div className="text-center max-w-md">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
          404 — Not Found
        </p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-gray-900">
          Blog not found
        </h1>
        <p className="mb-8 text-sm text-gray-500 leading-relaxed">
          The blog you are looking for does not exist or was removed.
        </p>
        <Link
          href="/blogs"
          className="inline-flex items-center gap-2 rounded-full bg-[#C10007] px-7 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-lg"
        >
          <ArrowLeft size={15} strokeWidth={2.5} />
          Back to Blogs
        </Link>
      </div>
    </div>
  );
}
