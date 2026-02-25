// Public layout: transparent wrapper – each page owns its own full-screen UI
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
