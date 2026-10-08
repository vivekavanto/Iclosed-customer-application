// Team shown on every file until staff are assigned per file in the admin app.

export interface TeamMember {
  role: string;
  name: string;
  email?: string;
  phone?: string;
}

export const PORTAL_TEAM: TeamMember[] = [
  { role: "Customer Success Manager", name: "Aliya Ali", email: "aliya@iclosed.ca", phone: "647 426 3769" },
  { role: "Lawyer", name: "Gathya Manoharan" },
  { role: "Law Clerk", name: "Marcella Pitella" },
];

export function teamInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
