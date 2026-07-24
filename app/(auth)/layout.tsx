export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center px-5 py-8 sm:px-6">
      {/* cosmic glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 mx-auto h-[380px] max-w-lg blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,91,255,0.22), rgba(232,102,61,0.06) 45%, transparent 72%)",
        }}
      />
      {children}
    </main>
  );
}
