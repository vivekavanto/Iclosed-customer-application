"use client";

export default function Footer() {
  return (
    <footer className="mt-auto w-full bg-[#faf8f8]">
      {/* Decorative top rule */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#C10007]/20 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-10 lg:px-14">
        <p className="text-center text-sm font-medium text-gray-400">
          iClosed ©2025
        </p>
      </div>
    </footer>
  );
}
