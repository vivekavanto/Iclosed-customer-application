import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/requireAdmin";

/**
 * The gate in front of every blog-admin page.
 *
 * A Server Component that redirects before any markup renders — not a
 * `useEffect` check, which would ship the editor to the browser and only then
 * decide the visitor should not have it.
 *
 * This is the real authorization boundary. `/admin` is also added to
 * PROTECTED_PAGES in src/middleware.ts, but only as defence in depth: that
 * stops a logged-out browser downloading the shell, while this is what knows
 * the difference between a signed-in client and a member of staff.
 */
export const dynamic = "force-dynamic";

export default async function AdminBlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");

  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/admin/blog" className="flex items-baseline gap-2">
            <span
              className="text-xl font-bold italic leading-none text-[#C10007]"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              i
            </span>
            <span className="text-xl font-bold leading-none tracking-tight text-gray-900">
              Closed
            </span>
            <span className="ml-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Blog admin
            </span>
          </Link>
          <span className="truncate text-xs text-gray-400">{admin.email}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
