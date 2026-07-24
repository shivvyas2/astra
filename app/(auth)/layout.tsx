export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center px-5 py-8 sm:px-6">{children}</main>;
}
