// Status Overview steps; each groups milestones by title keyword.

export interface StatusStep {
  title: string;
  description: string;
  // Milestone title keywords (lowercase) rolled into this step.
  match: string[];
}

const PURCHASE: StatusStep[] = [
  { title: "File opened", description: "We opened your file and had our first call.", match: ["initial call"] },
  { title: "Agreement received", description: "We have your signed agreement and any amendments.", match: ["agreement of purchase"] },
  { title: "Your information and ID", description: "Personal information, title and ID for each purchaser.", match: ["personal information", "identification"] },
  { title: "Title search", description: "We check title for liens, work orders and anything that affects ownership.", match: ["title search"] },
  { title: "Mortgage instructions received", description: "Your lender sends us your mortgage terms, at least 3 business days before closing.", match: ["mortgage instructions", "mortgage representative", "solicitor information"] },
  { title: "Home insurance", description: "Insurance starting on closing day, with your lender as 1st mortgagee.", match: ["home insurance"] },
  { title: "Signing appointment", description: "You sign your closing documents with your lawyer.", match: ["appointment", "documents sign"] },
  { title: "Closing funds received", description: "Your balance due is in our trust account.", match: ["closing funds", "funds received"] },
  { title: "Title transferred & keys released", description: "We register the transfer and mortgage, release funds to the seller, and you get your keys.", match: ["closing date coordination"] },
  { title: "Purchase complete", description: "We send your final reporting letter and title insurance policy.", match: ["transaction completed", "final report"] },
];

const SALE: StatusStep[] = [
  { title: "File opened", description: "We opened your file and had our first call.", match: ["initial call"] },
  { title: "Agreement received", description: "We have your signed agreement and any amendments.", match: ["agreement of purchase"] },
  { title: "Your information and ID", description: "Personal information and ID for each seller.", match: ["personal information", "identification"] },
  { title: "Title search", description: "We confirm what is registered on title, including mortgages to pay off.", match: ["title search", "financial info"] },
  { title: "Mortgage payout statement", description: "Your lender confirms the exact payout amount for closing day.", match: ["mortgage"] },
  { title: "Property tax and rentals", description: "We work out the tax adjustment and confirm rental equipment.", match: ["property tax", "rental equipment"] },
  { title: "Signing appointment", description: "You sign your closing documents with your lawyer.", match: ["appointment", "documents sign"] },
  { title: "Title transferred & keys released", description: "The buyer’s funds arrive, the transfer registers and we release your keys.", match: ["lockbox", "closing funds", "funds received", "closing date coordination"] },
  { title: "Proceeds sent to you", description: "We pay off your mortgage and send the rest to your account.", match: ["funds disbursed", "void cheque"] },
  { title: "Sale complete", description: "We discharge your mortgage and send your final reporting letter.", match: ["transaction completed", "final report"] },
];

export interface MilestoneLike {
  title: string;
  done: boolean;
}

export interface ResolvedStep {
  title: string;
  description: string;
  done: boolean;
  current: boolean;
}

/** Steps for a side; a step is done once every milestone it groups is done. */
export function resolveStatusSteps(side: "purchase" | "sale", milestones: MilestoneLike[]): ResolvedStep[] {
  const steps = side === "sale" ? SALE : PURCHASE;
  const claimed = new Set<number>();
  let currentSet = false;
  return steps.map((step, i) => {
    const mine = milestones.filter((m, idx) => {
      if (claimed.has(idx)) return false;
      const t = m.title.toLowerCase();
      const hit = step.match.some((k) => t.includes(k));
      if (hit) claimed.add(idx);
      return hit;
    });
    // File opened is done from the start; other unmatched steps wait.
    const done = i === 0 ? mine.every((m) => m.done) : mine.length > 0 && mine.every((m) => m.done);
    const current = !done && !currentSet;
    if (current) currentSet = true;
    return { title: step.title, description: step.description, done, current };
  });
}
