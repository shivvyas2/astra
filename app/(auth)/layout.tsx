export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-8 sm:px-6">
      <p className="eyebrow mb-6">Astrya</p>
      {children}
    </main>
  );
}
