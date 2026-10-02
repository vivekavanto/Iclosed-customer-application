import { PORTAL_TEAM } from "@/lib/portalTeam";

// TODO: confirm booking URL.
export const SIGNING_LAWYER = {
  name: PORTAL_TEAM.find((m) => m.role === "Lawyer")?.name ?? "your lawyer",
  bookingUrl: "https://cal.com/gathya-manoharan",
};

export function isSigningAppointmentTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("book your signing appointment");
}
