import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { buildBlogToc, cleanArticleBody } from "@/lib/blogToc";

/**
 * The rendered body of a blog article — public page and dashboard alike.
 *
 * One component rather than two copies of a long Tailwind arbitrary-variant
 * block, because the styling has to cover whatever tags the sanitizer allows.
 * When the allowlist in sanitizeBlogHtml gains a tag and this does not, the
 * result is not an error — it is an article that quietly renders an unstyled
 * <ol> or a borderless table on a live page.
 *
 * Sanitizes again here, at the point of render. That is redundant for anything
 * written through /api/blog/*, and deliberately so: it is the only thing
 * standing in front of rows seeded before the sanitizer existed, and rows the
 * separate admin app writes straight to the table.
 *
 * Heading ids are added here, after sanitizing (which strips ids) and on every
 * render, so the anchors the "On this page" panel links to always exist — even
 * on a page that never renders a contents list. buildBlogToc is the single
 * source of both those ids and the sidebar's links; see src/lib/blogToc.ts.
 */
export default function BlogArticleBody({
  html,
  hasRenderedFaq = false,
  className = "",
}: {
  html: string;
  /**
   * Whether the page lays out post.faq itself, below this block. When it does,
   * an FAQ section in the body is a duplicate and is dropped; when it does not,
   * the body's copy is the article's only FAQ and is kept. The page must pass
   * the same answer it uses to decide whether to render that block.
   */
  hasRenderedFaq?: boolean;
  className?: string;
}) {
  return (
    <article
      className={`
        mb-12
        [&_h2]:mb-5 [&_h2]:mt-12 [&_h2]:border-l-[3px] [&_h2]:border-[#C10007]
        [&_h2]:pl-5 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-gray-900
        [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 [&_h4]:scroll-mt-24
        [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-gray-900
        [&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:text-[15px] [&_h4]:font-semibold [&_h4]:text-gray-800
        [&_p]:mb-5 [&_p]:text-[16px] [&_p]:leading-[1.85] [&_p]:text-gray-600
        [&_li]:text-[15.5px] [&_li]:leading-[1.8] [&_li]:text-gray-600
        [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-7
        [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-7
        [&_strong]:font-semibold [&_strong]:text-gray-800
        [&_em]:italic
        [&_a]:font-medium [&_a]:text-[#C10007] [&_a]:underline [&_a]:underline-offset-2
        hover:[&_a]:text-red-700
        [&_hr]:my-10 [&_hr]:border-gray-100
        [&_blockquote]:mb-6 [&_blockquote]:rounded-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-[#C10007]
        [&_blockquote]:bg-red-50/60 [&_blockquote]:px-6 [&_blockquote]:py-4 [&_blockquote]:text-[15px]
        [&_blockquote]:leading-relaxed [&_blockquote]:text-gray-700
        [&_figure]:mb-6
        [&_figcaption]:mt-2 [&_figcaption]:text-[13px] [&_figcaption]:text-gray-400
        [&_img]:rounded-2xl
        [&_table]:mb-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14.5px]
        [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2
        [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-700
        [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_td]:text-gray-600
        [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13.5px]
        [&_pre]:mb-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-gray-900 [&_pre]:p-4
        [&_pre]:text-[13px] [&_pre]:text-gray-100
        ${className}
      `}
      dangerouslySetInnerHTML={{
        __html: buildBlogToc(
          cleanArticleBody(sanitizeBlogHtml(html), { hasRenderedFaq })
        ).html,
      }}
    />
  );
}
