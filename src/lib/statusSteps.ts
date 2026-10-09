// Status Overview steps; each groups milestones by title keyword.

export interface StatusStep {
  title: string;
  description: string;
  // Milestone title keywords (lowercase) rolled into this step.
  match: string[];
}

const PURCHASE: StatusStep[] = [
  { title: "Agreement received", description: "We have your signed agreement and any amendments.", match: ["agreement of purchase"] },
  { title: "Your information and ID", description: "Personal information, title and ID for each purchaser.", match: ["personal information", "identification"] },
  { title: "Title search", description: "We check title for liens, work orders and anything that affects ownership.", match: ["title search"] },
  { title: "Mortgage instructions", description: "Your lender sends us your mortgage terms, at least 3 business days before closing.", match: ["mortgage instructions", "mortgage representative", "solicitor information"] },
  { title: "Home insurance", description: "Insurance starting on closing day, with your lender as 1st mortgagee.", match: ["home insurance"] },
  { title: "Signing appointment", description: "You sign your closing documents with your lawyer.", match: ["appointment", "documents sign"] },
  { title: "Closing funds", description: "Your balance due is in our trust account.", match: ["closing funds", "funds received"] },
  { title: "Purchase complete", description: "We register the transfer and mortgage, release funds to the seller, and you get your keys.", match: ["transaction completed", "closing date coordination"] },
  { title: "Final report", description: "We send your final reporting letter and title insurance policy.", match: ["final report"] },
];

const SALE: StatusStep[] = [
  { title: "Agreement received", description: "We have your signed agreement and any amendments.", match: ["agreement of purchase"] },
  { title: "Your information and ID", description: "Personal information and ID for each seller.", match: ["personal information", "identification"] },
  { title: "Mortgage payout statement", description: "Your lender confirms the exact payout amount for closing day.", match: ["mortgage"] },
  { title: "Property tax and rentals", description: "We work out the tax adjustment and confirm rental equipment.", match: ["property tax", "rental equipment"] },
  { title: "Signing appointment", description: "You sign your closing documents with your lawyer.", match: ["appointment", "documents sign"] },
  { title: "Sale complete", description: "The buyer’s funds arrive, the transfer registers and we release your keys.", match: ["transaction completed", "lockbox", "closing funds", "funds received", "closing date coordination"] },
  { title: "Proceeds sent to you", description: "We pay off your mortgage and send the rest to your account.", match: ["funds disbursed", "void cheque"] },
  { title: "Final report", description: "We discharge your mortgage and send your final reporting letter.", match: ["final report"] },
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
  return steps.map((step) => {
    const mine = milestones.filter((m, idx) => {
      if (claimed.has(idx)) return false;
      const t = m.title.toLowerCase();
      const hit = step.match.some((k) => t.includes(k));
      if (hit) claimed.add(idx);
      return hit;
    });
    const done = mine.length > 0 && mine.every((m) => m.done);
    const current = !done && !currentSet;
    if (current) currentSet = true;
    return { title: step.title, description: step.description, done, current };
  });
}
