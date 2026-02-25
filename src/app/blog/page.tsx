"use client";

import { Calendar, ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import Link from "next/link";

const blogPosts = [
  {
    id: 1,
    title: "Understanding Property Closing: A Complete Guide",
    excerpt: "Learn everything you need to know about the property closing process, from inspection to final walkthrough.",
    date: "February 24, 2026",
    category: "Property Closing",
    readTime: "5 min read",
  },
  {
    id: 2,
    title: "Mortgage Refinancing 101: When and Why You Should Consider It",
    excerpt: "Explore the benefits and considerations of refinancing your mortgage to potentially save money and simplify your finances.",
    date: "February 20, 2026",
    category: "Refinancing",
    readTime: "7 min read",
  },
  {
    id: 3,
    title: "What's Inside a Condo Status Certificate Report?",
    excerpt: "Understand what information is contained in a condo status certificate and why it's crucial for your closing.",
    date: "February 15, 2026",
    category: "Condo Reports",
    readTime: "4 min read",
  },
  {
    id: 4,
    title: "Legal Deed vs. Mortgage: Key Differences Explained",
    excerpt: "Clarify the differences between a legal deed and a mortgage and what each means for your property ownership.",
    date: "February 10, 2026",
    category: "Legal Terms",
    readTime: "6 min read",
  },
  {
    id: 5,
    title: "First-Time Homebuyer: Common Mistakes to Avoid",
    excerpt: "Don't let common pitfalls derail your home purchase. Learn what first-time buyers should watch out for.",
    date: "February 5, 2026",
    category: "Homebuying Tips",
    readTime: "8 min read",
  },
  {
    id: 6,
    title: "The Role of Title Insurance in Your Property Purchase",
    excerpt: "Discover why title insurance is essential and how it protects your investment in real estate.",
    date: "January 30, 2026",
    category: "Insurance",
    readTime: "5 min read",
  },
];

export default function Blog() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-[#C10007] to-red-700 text-white py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-5xl font-bold mb-4">iClosed Blog</h1>
          <p className="text-xl text-red-100 max-w-2xl">
            Expert insights and guidance on property closing, refinancing, and real estate transactions.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center px-6 py-16">
        <div className="max-w-7xl w-full">
          {/* Blog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post) => (
              <Link key={post.id} href={`/blog/${post.id}`}>
                <article className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col cursor-pointer h-full">
              
                {/* Placeholder Image */}
                <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <div className="text-gray-400 text-center">
                    <div className="text-4xl font-bold mb-2">📄</div>
                    <p className="text-sm">Blog Image</p>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-semibold text-[#C10007] bg-red-50 px-3 py-1 rounded-full">
                      {post.category}
                    </span>
                    <span className="text-xs text-gray-500">{post.readTime}</span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                    {post.title}
                  </h3>

                  <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-1">
                    {post.excerpt}
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar size={14} />
                      {post.date}
                    </div>
                    <button className="text-[#C10007] hover:text-red-800 transition-colors">
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
                </article>
              </Link>
            ))}
          </div>

          {/* Load More Button */}
          <div className="flex justify-center mt-16">
            <Button className="px-10 py-3 bg-[#C10007] text-white rounded-sm font-medium hover:bg-red-800 transition-colors">
              Load More Articles
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
