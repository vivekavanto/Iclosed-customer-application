"use client";

import { useState } from "react";
import {
  Twitter,
  Facebook,
  LinkedinIcon,
  MessageCircle,
  Link as LinkIcon,
  Check,
} from "lucide-react";

interface ShareButtonsProps {
  title: string;
}

export default function ShareButtons({ title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined" ? window.location.href : "";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const links = [
    {
      name: "Twitter",
      icon: Twitter,
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    },
    {
      name: "Facebook",
      icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: "LinkedIn",
      icon: LinkedinIcon,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      name: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-6 sm:px-8 py-7 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
      <p className="mb-5 text-[11px] font-bold uppercase tracking-widest text-gray-400">
        Share this article
      </p>

      <div className="flex flex-wrap gap-3">
        {links.map(({ name, icon: Icon, href }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12px] font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:bg-[#C10007] hover:shadow-md"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 transition-colors duration-200 group-hover:text-white" />
            <span className="transition-colors duration-200 group-hover:text-white">
              {name}
            </span>
          </a>
        ))}

        <button
          onClick={handleCopy}
          className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12px] font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:bg-[#C10007] hover:shadow-md cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 shrink-0 transition-colors duration-200 group-hover:text-white" />
              <span className="transition-colors duration-200 group-hover:text-white">
                Copied!
              </span>
            </>
          ) : (
            <>
              <LinkIcon className="h-3.5 w-3.5 shrink-0 transition-colors duration-200 group-hover:text-white" />
              <span className="transition-colors duration-200 group-hover:text-white">
                Copy link
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
