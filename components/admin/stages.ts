import type { Stage } from "@/lib/admin/types";

/** Each step of the way in, and what stopping there means. */
export const STAGE_LABEL: Record<Stage, string> = {
  signed_up: "Signed up",
  signed_in: "Confirmed and signed in",
  profile: "Added birth details",
  consented: "Agreed to AI",
  asked: "Asked a question",
  returned: "Asked on another day",
};
export const STOPPED_AT: Record<Stage, string> = {
  signed_up: "Never confirmed",
  signed_in: "No birth details",
  profile: "Not agreed to AI",
  consented: "Never asked",
  asked: "Asked one day only",
  returned: "Returning",
};
