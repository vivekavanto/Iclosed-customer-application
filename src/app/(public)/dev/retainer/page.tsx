import { Suspense } from "react";
import { notFound } from "next/navigation";
import RetainerDevPreview from "./RetainerDevPreview";

export default function RetainerDevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-500">
          Loading preview…
        </div>
      }
    >
      <RetainerDevPreview />
    </Suspense>
  );
}
