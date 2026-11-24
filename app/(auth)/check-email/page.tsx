import { redirect } from "next/navigation";

/** The old "open the link we sent" page; codes are entered on /verify-email now. */
export default function CheckEmailPage() {
  redirect("/verify-email");
}
