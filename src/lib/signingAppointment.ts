export function isSigningAppointmentTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("book your signing appointment");
}
