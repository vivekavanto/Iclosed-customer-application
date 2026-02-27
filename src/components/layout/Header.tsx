"use client";

import Image from "next/image";

export default function Header() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-[#f0e4e4] bg-white/95 shadow-[0_2px_20px_rgba(0,0,0,0.06)] backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center px-6 py-5 sm:px-10 lg:px-14">
        <Image
          src="/logo.png"
          alt="iClosed Logo"
          width={120}
          height={40}
          priority
          className="object-contain"
        />
      </div>
    </header>
  );
}
