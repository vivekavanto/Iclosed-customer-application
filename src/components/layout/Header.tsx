"use client";

import Image from "next/image";

export default function Header() {
  return (
    <header className="fixed top-0 left-0 w-full bg-white z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-8 py-6 flex items-center">
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