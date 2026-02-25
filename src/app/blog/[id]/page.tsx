"use client";

import { Calendar, ArrowLeft, Share2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { useParams } from "next/navigation";

const blogPosts: Record<string, any> = {
  "1": {
    id: 1,
    title: "Understanding Property Closing: A Complete Guide",
    excerpt: "Learn everything you need to know about the property closing process, from inspection to final walkthrough.",
    date: "February 24, 2026",
    category: "Property Closing",
    readTime: "5 min read",
    author: "Sarah Chen",
    content: `
      <p>The property closing process is an essential part of buying or selling a home. It's the final step where all documents are signed, funds are transferred, and you officially become the new property owner.</p>
      
      <h2>What Happens During Closing?</h2>
      <p>During closing, several important things occur. First, you'll review all final documents including the mortgage note, deed of trust, and closing statement. These documents outline the terms of your loan and the property details.</p>
      
      <h2>Key Steps in the Process</h2>
      <ul>
        <li>Final walkthrough of the property</li>
        <li>Review and sign closing documents</li>
        <li>Conduct final title search</li>
        <li>Transfer funds and record deed</li>
        <li>Receive keys to your new property</li>
      </ul>
      
      <h2>Common Closing Costs</h2>
      <p>Closing costs typically range from 2-5% of the purchase price and include loan origination fees, appraisal fees, title insurance, and attorney fees. It's important to understand these costs before closing day.</p>
      
      <h2>How iClosed Can Help</h2>
      <p>At iClosed, we handle all the legal aspects of your closing to ensure a smooth and secure transaction. Our team will guide you through every step and answer any questions you may have.</p>
    `,
  },
  "2": {
    id: 2,
    title: "Mortgage Refinancing 101: When and Why You Should Consider It",
    excerpt: "Explore the benefits and considerations of refinancing your mortgage to potentially save money and simplify your finances.",
    date: "February 20, 2026",
    category: "Refinancing",
    readTime: "7 min read",
    author: "Michael Torres",
    content: `
      <p>Mortgage refinancing can be a smart financial move if done at the right time. Let's explore when and why you should consider refinancing your home loan.</p>
      
      <h2>What is Refinancing?</h2>
      <p>Refinancing means replacing your current mortgage with a new one, typically with different terms or interest rates. This can help you save money, reduce monthly payments, or change your loan term.</p>
      
      <h2>Benefits of Refinancing</h2>
      <ul>
        <li>Lower monthly payments</li>
        <li>Reduced interest rates</li>
        <li>Shorter loan terms</li>
        <li>Cash-out options for home improvements</li>
      </ul>
      
      <h2>When to Refinance</h2>
      <p>The best time to refinance is typically when interest rates drop, your credit score improves, or when you have significant equity built up in your home. However, you should also consider refinancing costs and how long you plan to stay in the property.</p>
      
      <h2>Getting Started</h2>
      <p>Our team at iClosed can help you navigate the refinancing process and ensure all legal documents are properly handled for a seamless transaction.</p>
    `,
  },
  "3": {
    id: 3,
    title: "What's Inside a Condo Status Certificate Report?",
    excerpt: "Understand what information is contained in a condo status certificate and why it's crucial for your closing.",
    date: "February 15, 2026",
    category: "Condo Reports",
    readTime: "4 min read",
    author: "Lisa Park",
    content: `
      <p>A condo status certificate is a critical document when purchasing a condominium unit. It provides important information about the building and your financial obligations as an owner.</p>
      
      <h2>What's Included in a Status Certificate?</h2>
      <p>The certificate includes details about the condo corporation, including the bylaws, rules, and financial statements. It also outlines the maintenance fees, special assessments, and any pending litigation.</p>
      
      <h2>Key Sections to Review</h2>
      <ul>
        <li>Condo corporation details and contact information</li>
        <li>Copy of bylaws and rules</li>
        <li>Financial statements and budget</li>
        <li>Property insurance and coverage details</li>
        <li>Reserve fund information</li>
        <li>Maintenance and common area details</li>
      </ul>
      
      <h2>Why It Matters</h2>
      <p>Understanding the status certificate helps you make an informed decision about the property and budget for ongoing condo fees and potential special assessments.</p>
      
      <h2>iClosed's Expertise</h2>
      <p>We review condo status certificates thoroughly at no extra charge as part of our comprehensive closing services.</p>
    `,
  },
  "4": {
    id: 4,
    title: "Legal Deed vs. Mortgage: Key Differences Explained",
    excerpt: "Clarify the differences between a legal deed and a mortgage and what each means for your property ownership.",
    date: "February 10, 2026",
    category: "Legal Terms",
    readTime: "6 min read",
    author: "James Anderson",
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
    date: "February 5, 2026",
    category: "Homebuying Tips",
    readTime: "8 min read",
    author: "Emily Rodriguez",
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
    category: "Insurance",
    readTime: "5 min read",
    author: "Robert Kim",
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Post Not Found</h1>
          <Link 
            href="/blog"
            className="inline-block bg-[#C10007] text-white px-6 py-2 rounded-sm"
          >
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-[#C10007] to-red-700 text-white py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/blog"
            className="flex items-center gap-2 text-red-100 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Blog
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-red-100">
            <span className="text-sm font-semibold bg-red-600 px-3 py-1 rounded-full">
              {post.category}
            </span>
            <div className="flex items-center gap-2">
              <Calendar size={18} />
              {post.date}
            </div>
            <span>{post.readTime}</span>
            <span>By {post.author}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center px-6 py-12">
        <div className="max-w-3xl w-full">
          {/* Featured Image Placeholder */}
          <div className="w-full h-96 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mb-12">
            <div className="text-gray-400 text-center">
              <div className="text-6xl font-bold mb-2">📰</div>
              <p className="text-lg">Featured Image</p>
            </div>
          </div>

          {/* Blog Content */}
          <div className="prose prose-lg max-w-none mb-12">
            <div
              className="text-gray-700 leading-relaxed space-y-6"
              dangerouslySetInnerHTML={{
                __html: post.content
                  .replace(/<h2>/g, '<h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">')
                  .replace(/<ul>/g, '<ul className="list-disc list-inside space-y-2 ml-4">')
                  .replace(/<li>/g, '<li className="text-gray-700">')
                  .replace(/<p>/g, '<p className="text-gray-700 mb-4">'),
              }}
            />
          </div>

          {/* Share Section */}
          <div className="border-t border-b border-gray-200 py-8 mb-12">
            <p className="text-gray-600 mb-4">Share this article:</p>
            <div className="flex gap-4">
              <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                <Share2 size={18} />
                Share
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
