import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

/** Any missing page, including a person or reading that is not this account's, in the reader's language. */
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="atmosphere atmosphere-dusk flex min-h-dvh flex-col items-start justify-center px-5 py-10 sm:px-8">
      <p className="screen-eyebrow">404</p>
      <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{t.common.notFoundTitle}</h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{t.common.notFoundBody}</p>
      <Link href="/" className="brut-btn brut-btn-primary brut-btn-arrow mt-8 min-h-[48px] px-6">
        {t.common.goHome}
      </Link>
    </main>
  );
}
