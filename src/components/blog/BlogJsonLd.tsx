import type { BlogPost } from "@/lib/blogPosts";
import { siteUrl } from "@/lib/siteUrl";

/**
 * The structured data for one article: Article, BreadcrumbList, and — when the
 * post has one — FAQPage.
 *
 * sql/create_blog_posts.sql describes `faq` as "the AEO payload … emitted as
 * FAQPage JSON-LD", and this is the code that makes that true. The same note
 * carries the rule that matters: structured data must never describe content a
 * visitor cannot see. That is why this component takes the SAME `post.faq`
 * array the page renders visibly, rather than accepting its own — there is no
 * way to pass one thing to Google and show another without editing this
 * signature, which is the point.
 *
 * A post with `noindex` set emits nothing. Handing a crawler rich metadata for
 * a page you have just asked it not to index is a contradiction, and Search
 * Console reports it as one.
 */

/**
 * `</script>` inside a JSON string value would close the tag early and put the
 * remainder of the payload into the document as markup. Escaping `<` is the
 * standard defence and costs nothing — the content here is admin- and
 * model-written, which is exactly the input you do not want to assume about.
 */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function BlogJsonLd({ post }: { post: BlogPost }) {
  if (post.noindex) return null;

  const base = siteUrl();
  const url = post.canonicalUrl ?? `${base}/blogs/${post.slug}`;
  const image = post.ogImageUrl ?? post.image;
  // Schema.org requires absolute URLs; the cover is usually a site-relative
  // path like /blog1.png.
  const absoluteImage = image.startsWith("http") ? image : `${base}${image}`;

  const graph: Record<string, unknown>[] = [
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      headline: post.metaTitle ?? post.title,
      name: post.title,
      description: post.metaDescription ?? post.excerpt,
      image: absoluteImage,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      datePublished: post.publishedAt ?? undefined,
      dateModified: post.updatedAt,
      keywords: post.tags.length ? post.tags.join(", ") : undefined,
      inLanguage: "en-CA",
      author: { "@type": "Organization", name: post.author, url: base },
      publisher: {
        "@type": "Organization",
        name: "iClosed",
        url: base,
        logo: { "@type": "ImageObject", url: `${base}/favicon.ico` },
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${base}/blogs` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];

  if (post.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: post.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  }

  return (
    <script
      type="application/ld+json"
      // Inert data in a non-executing script tag, escaped by serialize() above.
      dangerouslySetInnerHTML={{
        __html: serialize({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}
