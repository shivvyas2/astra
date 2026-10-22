import Link from "next/link";
import Image from "next/image";
import { getI18n } from "@/lib/i18n/server";
import { plain } from "@/lib/i18n/rich";

export async function CTA() {
  const { t } = await getI18n();
  return (
    <section className="relative overflow-hidden px-5 py-20 text-center sm:px-6 sm:py-32 md:px-16">
      <Image src="/images/starfield.jpg" alt="" fill className="object-cover opacity-50" />
      <div className="relative z-10">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl md:text-7xl">
          {plain(t.landing.askFirst)}
        </h2>
        <Link href="/signup" className="mt-8 inline-block rounded-md bg-accent px-8 py-3 font-medium text-bg">
          {t.landing.createAccount}
        </Link>
        <p className="mt-6 text-xs text-muted">{t.common.disclaimer}</p>
      </div>
    </section>
  );
}
