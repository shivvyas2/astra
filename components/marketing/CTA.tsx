import Link from "next/link";
import Image from "next/image";

export function CTA() {
  return (
    <section className="relative overflow-hidden px-6 py-32 text-center md:px-16">
      <Image src="/images/starfield.jpg" alt="" fill className="object-cover opacity-50" />
      <div className="relative z-10">
        <h2 className="mx-auto max-w-2xl text-5xl font-bold tracking-tight md:text-7xl">
          Ask the sky your first question.
        </h2>
        <Link href="/signup" className="mt-8 inline-block rounded-md bg-accent px-8 py-3 font-medium text-bg">
          Create your free account
        </Link>
        <p className="mt-6 text-xs text-muted">For guidance and reflection. Not a substitute for professional advice.</p>
      </div>
    </section>
  );
}
