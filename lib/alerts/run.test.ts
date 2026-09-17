import { describe, it, expect } from "vitest";
import { partitionForAlerts } from "./run";

type Row = { signature: string; scope: "natal" | "transit" };
const c = (signature: string, scope: "natal" | "transit") => ({ signature, scope });

describe("partitionForAlerts", () => {
  it("alerts natal conditions on a first read, when no natal rows exist", () => {
    const { alert, silent } = partitionForAlerts({
      started: [c("mangal_dosha:7", "natal"), c("sade_sati:peak", "transit")],
      hadNatalRows: false,
    });
    expect(alert.map((x) => x.signature)).toEqual(["mangal_dosha:7", "sade_sati:peak"]);
    expect(silent).toEqual([]);
  });

  it("never alerts a natal condition once the user has natal rows", () => {
    const { alert, silent } = partitionForAlerts({
      started: [c("mangal_dosha:8", "natal"), c("sade_sati:peak", "transit")],
      hadNatalRows: true,
    });
    expect(alert.map((x) => x.signature)).toEqual(["sade_sati:peak"]);
    expect(silent.map((x) => x.signature)).toEqual(["mangal_dosha:8"]);
  });

  it("keeps transit conditions alertable in both cases", () => {
    for (const hadNatalRows of [true, false]) {
      const { alert } = partitionForAlerts({ started: [c("kantaka_shani:4", "transit")], hadNatalRows });
      expect(alert).toHaveLength(1);
    }
  });
});
