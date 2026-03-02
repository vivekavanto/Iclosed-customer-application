"use client";

import {
  Calendar,
  ArrowLeft,
  Share2,
  Twitter,
  Facebook,
  LinkedinIcon,
  MessageCircle,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";

const blogPosts: Record<string, any> = {
  "1": {
    id: 1,
    title: "Why Title Insurance Is Essential for Ontario Homebuyers",
    excerpt:
      "Why title insurance is essential protection for Ontario homebuyers and investors.",
    content: `
      <p><em>From the Real Estate Law Desk at IClosed</em></p>

      <p>When you purchase property in Ontario — whether it's your first home, a commercial unit, or a pre-construction condo — you're entering a chain of ownership that may span generations. At IClosed, we've encountered countless cases where a clean-looking transaction turned legally complicated because title insurance wasn't in place. That's why we don't just recommend title insurance. We consider it a crucial layer of legal protection.</p>

      <h2>📄 What Is Title Insurance, Really?</h2>
      <p>Title insurance is a one-time premium that protects your legal ownership of the property. Unlike home insurance, which covers future physical damage, title insurance covers risks tied to the property's legal history. These are issues that may not show up in a standard title search. It can cover:</p>
      <ul>
        <li>Existing but undisclosed liens</li>
        <li>Errors in public records</li>
        <li>Fraud or forgery in past transfers</li>
        <li>Boundary disputes</li>
        <li>Unregistered easements</li>
        <li>Previously unknown heirs claiming interest</li>
      </ul>
      <p>In short: title insurance protects your ownership from the unexpected and the invisible.</p>

      <h2>⚖ Why It Matters in Ontario</h2>
      <p>Ontario real estate transactions move quickly, and legal complexities are often buried deep within historic land registry records. At IClosed, we've seen the unique risks that come with Ontario properties, including:</p>
      <ul>
        <li>Unpermitted renovations by prior owners</li>
        <li>Outstanding property taxes from builder deals</li>
        <li>Title fraud, which has seen a notable increase in Ontario in recent years</li>
        <li>Misfiled or incomplete registry documents</li>
      </ul>
      <p>Without title insurance, these issues could become your legal and financial responsibility. With it, you're protected.</p>

      <h2>🧩 Owner's Policy vs. Lender's Policy: What You Need to Know</h2>
      <p>In Ontario, most lenders will require a Lender's Title Insurance Policy. This protects them, not you. That's why you need an Owner's Policy. It ensures that your investment, your equity, and your rights are defended in court should a claim ever arise.</p>

      <h2>🏛 What IClosed Does Differently</h2>
      <p>Unlike a title company or online conveyancer, we don't just process your transaction. We examine it thoroughly and interpret the legal implications. We'll help you:</p>
      <ul>
        <li>Understand what your title insurance covers (and doesn't)</li>
        <li>Navigate easements, encroachments, and zoning issues</li>
        <li>Ensure your interests are protected before and after closing</li>
      </ul>
      <p>Our job isn't just to help you close. Our job is to help you protect what you've bought.</p>

      <h2>💼 Final Word from Our Real Estate Lawyers</h2>
      <p>Purchasing property is a major investment. Whether you're buying a $400,000 condo or a $2 million detached home, your ownership should never be uncertain. Title insurance is one of the simplest, most cost-effective legal protections you can add. At IClosed, we help ensure your title is not just transferred but protected.</p>

      <h2>📞 Have Questions About Title Insurance or a Real Estate Closing in Ontario?</h2>
      <p>Speak with a real estate lawyer today at IClosed. Call us at (416) 321-1100 or email info@iclosed.ca.</p>
    `,
    date: "February 27, 2026",
    status: "published",
    readTime: "5 min read",
    image: "/blog1.png",
    author: "IClosed Real Estate Law Desk",
    tags: ["Title Insurance", "Ontario Law", "Real Estate", "Homebuyers"],
  },
  "2": {
    id: 2,
    title: "Disbursements: What Are They and Why Are You Paying Them?",
    excerpt: "Understanding disbursements in Ontario real estate transactions - the out-of-pocket expenses your lawyer incurs on your behalf.",
    date: "February 27, 2026",
    status: "published",
    readTime: "7 min read",
    image: "/blog2.png",
    author: "IClosed Real Estate Law Desk",
    tags: ["Disbursements", "Closing Costs", "Legal Fees", "Real Estate"],
    content: `
      <p><em>Real Estate Law Insights from IClosed</em></p>

      <p>Let's say you're buying or selling a property in Ontario. You hire a lawyer and get a quote for legal fees. But when closing time comes, there's another section on your invoice labeled "disbursements."</p>

      <p>It's one of the most misunderstood parts of any real estate transaction — and also one of the most important.</p>

      <p>At IClosed, we believe in full transparency. So, let's unpack disbursements once and for all. No legal jargon, no mystery, just clarity.</p>

      <h2>First Things First: What Are Disbursements?</h2>
      <p>Disbursements are out-of-pocket expenses your lawyer incurs on your behalf while handling your real estate transaction.</p>

      <p>Think of it like this: You're taking a trip and hire a guide. The guide charges a flat fee for their services (that's your legal fee). But along the way, they pay for bus tickets, maps, and entry passes — and ask to be reimbursed (those are your disbursements).</p>

      <p>In legal terms, disbursements are necessary third-party costs that make the transaction happen properly and legally.</p>

      <h2>Common Disbursements in Ontario Real Estate Closings</h2>
      <p>Here's what you might find itemized on your closing invoice at IClosed:</p>

      <h2>1. Title Search Fees</h2>
      <p>To confirm that the property you're buying has a clean title. This means no liens, encroachments, or ownership disputes.</p>

      <h2>2. Banking, Courier and Storage</h2>
      <p>Funds need to be transferred securely and quickly. We use certified trust accounts and wires to ensure no delays on closing day. While much is now digital, some elements like delivering original documents or cheques still require physical handling.</p>

      <h2>3. Land Registry Office Charges</h2>
      <p>We register the deed and, if applicable, the mortgage using Ontario's electronic system (Teraview). Each registration has a government-set fee.</p>

      <h2>4. Software Fees</h2>
      <p>Modern real estate law relies on licensed legal software and secure cloud platforms. These tools ensure compliance, document accuracy, and protection of your sensitive information.</p>

      <h2>5. Law Society Transaction Levy</h2>
      <p>A mandatory fee paid to the Law Society of Ontario on each real estate Sale files. This is part of maintaining professional standards and accountability in the industry.</p>

      <h2>Are Disbursements the Same at Every Firm?</h2>
      <p>Not even close.</p>

      <p>While disbursements are standard in function, how they're disclosed or padded can vary wildly.</p>

      <p>Some firms lump disbursements into a vague flat fee. Others may mark them up without explanation. At IClosed, we:</p>
      <ul>
        <li>✅ Provide a detailed, transparent quote</li>
        <li>✅ Break down your legal fee separately from disbursements</li>
        <li>✅ Never hide costs in fine print</li>
      </ul>
      <p>We treat your money like our own. If we don't need to spend it, we don't.</p>

      <h2>What Sets IClosed Apart?</h2>
      <p>Here's how we're different when it comes to disbursements:</p>
      <ul>
        <li>We explain every line item in plain English. No generic line like "admin fees – $350" with no detail.</li>
        <li>We use efficient digital systems to keep costs down where possible — and we pass those savings on to you.</li>
        <li>We believe clarity builds trust. That's why our quotes are more than numbers. They're roadmaps.</li>
      </ul>

      <h2>Final Word</h2>
      <p>Disbursements aren't just "extra charges." They're part of how we get the deal done the right way.</p>

      <p>And at IClosed, we make sure you know exactly where your money is going, every step of the way.</p>

      <h2>Have Questions About Disbursements or Closing Costs?</h2>
      <p>Speak directly with a real estate lawyer at IClosed.</p>

      <p>Let's talk numbers — clearly, fairly, and with your best interest in mind.</p>

      <p>Located in 10 Milner Business Court, Suite 210 Toronto, ON, M1B 3C6<br/>Call us at 416-321-1100<br/>Email: info@iclosed.ca</p>
    `,
  },
  "3": {
    id: 3,
    title: "Understanding Real Estate Transaction Costs: The Legal Side They Dont Tell You About",
    excerpt: "Breaking down the real estate transaction costs you will encounter in Ontario - and the ones most people overlook.",
    date: "February 27, 2026",
    status: "published",
    image: "/blog3.png",
    readTime: "4 min read",
    author: "IClosed Real Estate Law Desk",
    tags: ["Transaction Costs", "Land Transfer Tax", "Closing Costs", "Ontario"],
    content: `
      <p><em>Real Estate Law Brief from IClosed | Serving Ontario Buyers &amp; Sellers</em></p>

      <p>You've found the perfect property. The price is right. Your financing is approved. But suddenly, the final number at closing looks a lot higher than expected.</p>

      <p>Why? Because the purchase price isn't the only cost.</p>

      <p>At IClosed, we believe Ontario homebuyers and sellers deserve full clarity before signing anything. Below, we break down the real estate transaction costs you'll encounter — and the ones most people overlook.</p>

      <h2>The "Hidden" Costs That Are Actually Standard</h2>
      <p>Many clients come to us thinking the down payment and mortgage are the bulk of the expenses. In reality, there are several standard costs tied to closing a real estate deal in Ontario.</p>

      <p>Let's break them down. I'll explain lawyer to client.</p>

      <h2>1. Land Transfer Tax (LTT)</h2>
      <p><strong>✔ Applies to Buyers Only</strong></p>
      <p>One of the most significant transaction costs. The LTT is calculated based on your property's purchase price. And if you're buying in Toronto, be prepared for double. There's a separate Municipal Land Transfer Tax.</p>
      <p>🟢 First-time homebuyers may be eligible for rebates. Ask us before you waive conditions.</p>

      <h2>2. Legal Fees &amp; Disbursements</h2>
      <p><strong>✔ Applies to Buyers &amp; Sellers</strong></p>
      <p>This is where we come in. At IClosed, we don't just "do paperwork." We review, flag, and protect your interests in the agreement. Our legal fees cover:</p>
      <ul>
        <li>Reviewing the Agreement of Purchase and Sale</li>
        <li>Conducting title searches</li>
        <li>Registering the deed/mortgage</li>
        <li>Coordinating with your lender and the other party's lawyer</li>
        <li>Handling trust funds and closing mechanics</li>
      </ul>
      <p>Disbursements are out-of-pocket expenses like title search fees, software charges, and registration costs. We'll always provide a clear, itemized estimate in advance.</p>

      <h2>3. Title Insurance</h2>
      <p><strong>✔ Mandatory for Most Lenders</strong></p>
      <p>While it's technically optional for buyers, we strongly recommend it and explain why in this blog. It protects you from fraud, title defects, or ownership disputes that can arise after closing.</p>
      <p>🛡 We secure the right title insurance policy tailored to your property type and risk level.</p>

      <h2>4. HST on New Builds</h2>
      <p><strong>✔ Applies to Buyers of Newly Built Homes/Condos</strong></p>
      <p>If you're buying a new property from a builder, HST may be applicable and not always included in the listed price. Rebates may apply, but beware: you may have to repay the rebate if the home isn't your primary residence.</p>

      <h2>5. Adjustments on Closing</h2>
      <p><strong>✔ Buyers &amp; Sellers</strong></p>
      <p>These include prepaid property taxes, utility bills, or condo fees. You'll reimburse or receive credit for any amounts the seller has prepaid beyond the closing date.</p>
      <p>📘 Example: If the seller prepaid property tax through October but you close in July, you'll reimburse 3 months' worth at closing.</p>

      <h2>The Costs You Don't Want to Learn About the Hard Way</h2>
      <p>Sometimes, transaction costs come as a result of oversight or misinformation. That's where a lawyer can prevent unnecessary loss:</p>
      <ul>
        <li>Missed deadlines = penalties</li>
        <li>Incomplete conditions = lost deposit</li>
        <li>Title defects = delayed possession</li>
        <li>Misunderstood builder contracts = surprise charges</li>
      </ul>
      <p>Our role is to identify these risks before they become real costs.</p>

      <h2>Final Thoughts from IClosed</h2>
      <p>At IClosed, our approach to real estate law is simple: transparency, protection, and proactive communication.</p>

      <p>We don't just prepare closing documents. We:</p>
      <ul>
        <li>✔ Answer your questions in plain language</li>
        <li>✔ Help you budget for the full cost of the deal</li>
        <li>✔ Spot red flags in contracts you might miss</li>
        <li>✔ Stay with you right through to key handover and beyond</li>
      </ul>

      <h2>Ready to Buy or Sell in Ontario?</h2>
      <p>Let's make sure you know exactly what it'll cost — and why.</p>

      <p>Talk to a real estate lawyer today at IClosed.</p>

      <p>📍 Located in Markham and Milner<br/>📞 416-321-1100<br/>📧 info@iclosed.ca</p>
    `,
  },
  "4": {
    id: 4,
    title: "Legal Deed vs. Mortgage: Key Differences Explained",
    excerpt: "Clarify the differences between a legal deed and a mortgage and what each means for your property ownership.",
    date: "February 27, 2026",
    status: "published",
    image: "/blog1.png",
    readTime: "6 min read",
    author: "IClosed Real Estate Law Desk",
    tags: ["Deed", "Mortgage", "Property Law", "Ownership"],
    content: `
      <p>Understanding the difference between a deed and a mortgage is crucial for any property transaction. These two documents serve different purposes but work together in most home purchases.</p>

      <h2>What is a Deed?</h2>
      <p>A deed is a legal document that transfers property ownership from one party to another. It serves as proof of ownership and includes details about the property, the buyer, and the seller.</p>

      <h2>What is a Mortgage?</h2>
      <p>A mortgage is a loan document that allows you to borrow money to purchase a property. The property serves as collateral for the loan, and the lender can foreclose if you default on payments.</p>

      <h2>Key Differences</h2>
      <ul>
        <li>Deed transfers ownership; mortgage creates a debt obligation</li>
        <li>Deed is recorded at the county; mortgage is filed with the lender</li>
        <li>Deed is permanent; mortgage is discharged when paid off</li>
      </ul>

      <h2>How They Work Together</h2>
      <p>During a typical home purchase, both documents are used. The deed transfers ownership to you, while the mortgage secures the lender's interest in the property until the loan is paid off.</p>
    `,
  },
  "5": {
    id: 5,
    title: "First-Time Homebuyer: Common Mistakes to Avoid",
    excerpt: "Don't let common pitfalls derail your home purchase. Learn what first-time buyers should watch out for.",
    date: "February 27, 2026",
    status: "published",
    image: "/blog2.png",
    readTime: "8 min read",
    author: "IClosed Real Estate Law Desk",
    tags: ["First-Time Buyers", "Home Buying", "Closing Tips", "Real Estate"],
    content: `
      <p>First-time home buying can be overwhelming, but being aware of common mistakes can help you navigate the process successfully.</p>

      <h2>Mistake #1: Not Getting Pre-Approved for a Mortgage</h2>
      <p>Before house hunting, get pre-approved for a mortgage. This shows sellers you're serious and gives you a clear budget to work with.</p>

      <h2>Mistake #2: Making Large Purchases Before Closing</h2>
      <p>Avoid making big purchases or changing jobs before closing. Lenders re-check your financial situation, and changes could affect your loan approval.</p>

      <h2>Mistake #3: Skipping the Home Inspection</h2>
      <p>Always get a professional home inspection. It can reveal hidden problems that may affect your decision or negotiating power.</p>

      <h2>Mistake #4: Not Understanding All Closing Costs</h2>
      <p>Review your Closing Disclosure carefully. Make sure you understand all fees and costs associated with your purchase.</p>

      <h2>Mistake #5: Neglecting Title Insurance</h2>
      <p>Title insurance protects you from ownership disputes. It's a one-time cost that provides invaluable protection.</p>

      <h2>How iClosed Helps</h2>
      <p>Our team guides first-time buyers through every step, ensuring you understand each component of the process and avoid costly mistakes.</p>
    `,
  },
  "6": {
    id: 6,
    title: "The Role of Title Insurance in Your Property Purchase",
    excerpt: "Discover why title insurance is essential and how it protects your investment in real estate.",
    date: "January 30, 2026",
    status: "draft",
    image: "/blog3.png",
    readTime: "5 min read",
    author: "IClosed Real Estate Law Desk",
    tags: ["Title Insurance", "Legal Protection", "Property Purchase", "Ontario"],
    content: `
      <p>Title insurance is one of the most important yet often misunderstood aspects of real estate transactions. Let's explore why it matters and how it protects you.</p>

      <h2>What is Title Insurance?</h2>
      <p>Title insurance is a policy that protects property owners and lenders from financial loss due to disputes over property ownership or claims against the title.</p>

      <h2>Types of Title Insurance</h2>
      <ul>
        <li><strong>Owner's Title Insurance:</strong> Protects your ownership interest</li>
        <li><strong>Lender's Title Insurance:</strong> Protects the lender's interests</li>
      </ul>

      <h2>What Does it Cover?</h2>
      <p>Title insurance covers claims such as unpaid taxes, liens, previous ownership disputes, forged documents, and other title defects that existed before you purchased the property.</p>

      <h2>Why It's Essential</h2>
      <p>Real estate title problems can be expensive to resolve. Title insurance provides protection and peace of mind that your investment is secure.</p>

      <h2>Cost and Coverage</h2>
      <p>Title insurance is a one-time cost paid at closing, typically 0.5-1% of the purchase price. This small investment can save you thousands if title issues arise.</p>
    `,
  },
};

export default function BlogDetails() {
  const params = useParams();
  const id = params.id as string;
  const post = blogPosts[id];

  if (!post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfcfc]">
        <div className="text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
            404 — Not Found
          </p>
          <h1 className="mb-8 text-3xl font-bold tracking-tight text-gray-900">
            Post Not Found
          </h1>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-full bg-[#C10007] px-7 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-lg"
          >
            <ArrowLeft size={15} strokeWidth={2.5} />
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfcfc]">

      {/* ── Hero + Image Row ──────────────────────────────── */}
      <header className="relative bg-white">

        {/* Top red accent bar */}
        <div className="h-[3px] bg-[#C10007]" />

        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-10 sm:py-14 lg:px-14">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-14">

            {/* ── Left: text content ── */}
            <div className="flex flex-1 flex-col">

              {/* Back link */}
              <Link
                href="/blog"
                className="group mb-8 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#C10007] transition-colors duration-200 hover:text-red-700"
              >
                <ArrowLeft
                  size={14}
                  strokeWidth={2.5}
                  className="transition-transform duration-200 group-hover:-translate-x-1"
                />
                Back to Blog
              </Link>

              {/* Badge row */}
              <div className="mb-5 flex flex-wrap items-center gap-2.5">
                <span className="rounded-full border border-red-100 bg-red-50 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-[#C10007]">
                  {post.status}
                </span>
                {post.category && (
                  <span className="rounded-full border border-gray-100 bg-gray-50 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    {post.category}
                  </span>
                )}
                <span className="text-[11px] font-medium text-gray-400">
                  {post.readTime}
                </span>
              </div>

              {/* Title */}
              <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl lg:text-[2.4rem] lg:leading-[1.18]">
                {post.title}
              </h1>

              {/* Excerpt */}
              <p className="mb-6 text-[16.5px] leading-relaxed text-gray-500">
                {post.excerpt}
              </p>

              {/* Tags */}
              {post.tags && (
                <div className="mb-8 flex flex-wrap items-center gap-2">
                  {/* <Tag size={12} strokeWidth={2} className="shrink-0 text-gray-400" /> */}
                  {post.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors duration-150 hover:border-red-100 hover:bg-red-50 hover:text-[#C10007]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta row */}
              <div className="mt-auto flex flex-wrap items-center gap-6 border-t border-gray-100 pt-6">
                <div className="flex items-center gap-2">
                  <Calendar size={13} strokeWidth={2} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">{post.date}</span>
                </div>
                {post.author && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50">
                      <span className="text-[11px] font-bold text-[#C10007]">
                        {post.author.charAt(0)}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      By {post.author}
                    </span>
                  </div>
                )}
              </div>

            </div>

            {/* ── Right: image ── */}
            <div className="relative h-64 w-full shrink-0 overflow-hidden rounded-3xl shadow-[0_8px_48px_rgba(0,0,0,0.09)] ring-1 ring-gray-100 sm:h-80 lg:h-[420px] lg:w-[46%]">
              <Image
                src={post.image}
                alt={post.title}
                fill
                className="object-cover transition-transform duration-700 hover:scale-[1.02]"
                priority
              />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/10 to-transparent" />
            </div>

          </div>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-16 lg:px-12">

        {/* Blog Content */}
        <div
          className="
            mb-16
            [&_h2]:mb-5 [&_h2]:mt-12 [&_h2]:border-l-[3px] [&_h2]:border-[#C10007]
            [&_h2]:pl-5 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-gray-900
            [&_li]:text-[15.5px] [&_li]:leading-[1.8] [&_li]:text-gray-600
            [&_p]:mb-5 [&_p]:text-[16px] [&_p]:leading-[1.85] [&_p]:text-gray-600
            [&_strong]:font-semibold [&_strong]:text-gray-800
            [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-7
          "
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div className="rounded-2xl border border-gray-100 bg-white px-8 py-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <p className="mb-5 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            Share this article:
          </p>

          <div className="flex flex-wrap gap-3">

            {/* Twitter */}
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12px] font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:bg-[#C10007] hover:shadow-md"
            >
              <Twitter className="h-3.5 w-3.5 shrink-0 transition-colors duration-200 group-hover:text-white" />
              <span className="transition-colors duration-200 group-hover:text-white">
                Twitter
              </span>
            </a>

            {/* Facebook */}
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12px] font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:bg-[#C10007] hover:shadow-md"
            >
              <Facebook className="h-3.5 w-3.5 shrink-0 transition-colors duration-200 group-hover:text-white" />
              <span className="transition-colors duration-200 group-hover:text-white">
                Facebook
              </span>
            </a>

            {/* LinkedIn */}
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12px] font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:bg-[#C10007] hover:shadow-md"
            >
              <LinkedinIcon className="h-3.5 w-3.5 shrink-0 transition-colors duration-200 group-hover:text-white" />
              <span className="transition-colors duration-200 group-hover:text-white">
                LinkedIn
              </span>
            </a>

            {/* WhatsApp */}
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12px] font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:bg-[#C10007] hover:shadow-md"
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0 transition-colors duration-200 group-hover:text-white" />
              <span className="transition-colors duration-200 group-hover:text-white">
                WhatsApp
              </span>
            </a>

          </div>
        </div>

        {/* Footer nav */}
        <div className="mt-12 flex items-center border-t border-gray-100 pt-8">
          {/* <Link
            href="/blog"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#C10007] transition-colors duration-200 hover:text-red-700"
          >
            <ArrowLeft
              size={14}
              strokeWidth={2.5}
              className="transition-transform duration-200 group-hover:-translate-x-1"
            />
            Back to Blog
          </Link> */}
        </div>

      </main>
    </div>
  );
}
