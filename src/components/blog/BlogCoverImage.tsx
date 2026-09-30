import Image from "next/image";
import { ImageOff } from "lucide-react";

/**
 * The picture slot on a blog card — always rendered, with or without a picture.
 *
 * Every surface used to write `{post.image && <div>…</div>}`, so a post with no
 * cover produced a card of a different shape: no art, text starting at the top,
 * and in a grid a card visibly shorter than the ones beside it. A listing where
 * some cards have a band of colour and some do not reads as broken rather than
 * as sparse.
 *
 * So the container is unconditional and the *contents* vary. The placeholder is
 * deliberately quiet — a tint, a muted icon, a label — because it is a piece of
 * furniture holding a space open, not something a reader should look at. It is
 * marked aria-hidden: a missing picture is a visual fact and carries nothing a
 * screen reader needs, and announcing "no image" on every card would be noise.
 *
 * `sizes` is required whenever this is not a fixed-width slot; next/image warns
 * on a `fill` image without it and ships a needlessly large file.
 */
export default function BlogCoverImage({
  src,
  alt,
  className = "",
  imageClassName = "",
  sizes,
  priority = false,
  children,
}: {
  src: string | null;
  alt: string;
  /** Sizing and rounding for the slot itself — the caller owns the shape. */
  className?: string;
  /** Extra classes on the <Image>, typically the hover zoom. */
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  /** Overlays that sit on top of the picture, e.g. the "Featured" badge. */
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={`object-cover ${imageClassName}`}
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#FEF2F2] via-[#fdf6f6] to-white"
        >
          <ImageOff size={26} strokeWidth={1.6} className="text-[#C10007]/35" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C10007]/40">
            No image
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
