import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOLD_MS, MOUSE_SLOP, Press, RENEW_MS, TOUCH_SLOP, aar4, addedMessage, alreadyOn, dwellHint, heldTimer, holdFailed, holdPlate,
  nodeDown, notAdded, rightClickAction, unlistedClick, type HoldView,
} from "./gesture";

function press(touch = false) {
  const calls: string[] = [];
  const p = new Press(54, 100, 100, touch, {
    onClick: touch ? undefined : (ch) => calls.push(`click ${ch}`),
    onHold: (ch) => calls.push(`hold ${ch}`),
    onRenew: (ch) => calls.push(`renew ${ch}`),
    onRelease: (ch) => calls.push(`release ${ch}`),
  });
  return { p, calls };
}

describe("Press", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a release before 300 ms is a click", () => {
    const { p, calls } = press();
    vi.advanceTimersByTime(HOLD_MS - 1);
    p.up();
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(calls).toEqual(["click 54"]);
  });

  it("a press held 300 ms starts listening, and release ends it without a click", () => {
    const { p, calls } = press();
    vi.advanceTimersByTime(HOLD_MS);
    expect(calls).toEqual(["hold 54"]);
    p.up();
    expect(calls).toEqual(["hold 54", "release 54"]);
  });

  it("renews every 5 s while held, and stops after release", () => {
    const { p, calls } = press();
    vi.advanceTimersByTime(HOLD_MS + RENEW_MS * 2);
    expect(calls).toEqual(["hold 54", "renew 54", "renew 54"]);
    p.up();
    vi.advanceTimersByTime(RENEW_MS * 2);
    expect(calls).toEqual(["hold 54", "renew 54", "renew 54", "release 54"]);
  });

  it("moving 6 px before the hold makes it a drag: no click, no hold", () => {
    const { p, calls } = press();
    p.move(100 + MOUSE_SLOP, 100);
    vi.advanceTimersByTime(HOLD_MS * 2);
    p.up();
    expect(calls).toEqual([]);
  });

  it("moving less than the slop still holds, and moving afterwards changes nothing", () => {
    const { p, calls } = press();
    p.move(100 + MOUSE_SLOP - 1, 100);
    vi.advanceTimersByTime(HOLD_MS);
    p.move(400, 400);
    expect(p.holding).toBe(true);
    p.up();
    expect(calls).toEqual(["hold 54", "release 54"]);
  });

  it("cancel (pointercancel, Esc, blur, leave, unmount) releases a hold and never clicks", () => {
    const held = press();
    vi.advanceTimersByTime(HOLD_MS);
    held.p.cancel();
    held.p.up();
    expect(held.calls).toEqual(["hold 54", "release 54"]);

    const early = press();
    early.p.cancel();
    vi.advanceTimersByTime(HOLD_MS * 2);
    early.p.up();
    expect(early.calls).toEqual([]);
  });

  it("a release is sent once", () => {
    const { p, calls } = press();
    vi.advanceTimersByTime(HOLD_MS);
    p.cancel();
    p.cancel();
    p.up();
    expect(calls.filter((c) => c.startsWith("release"))).toHaveLength(1);
  });

  it("touch: 8 px slop, hold listens, a tap selects nothing", () => {
    const tap = press(true);
    vi.advanceTimersByTime(100);
    tap.p.up();
    expect(tap.calls).toEqual([]);

    const drift = press(true);
    drift.p.move(100 + TOUCH_SLOP - 1, 100);
    vi.advanceTimersByTime(HOLD_MS);
    expect(drift.calls).toEqual(["hold 54"]);
    drift.p.cancel();

    const far = press(true);
    far.p.move(100 + TOUCH_SLOP, 100);
    vi.advanceTimersByTime(HOLD_MS);
    expect(far.calls).toEqual([]);
  });
});

describe("right click", () => {
  it("adds for an admin on an unlisted slot", () => expect(rightClickAction(54, true, false)).toBe("add"));
  it("viewers need admin", () => expect(rightClickAction(54, false, false)).toBe("needs-admin"));
  it("a listed slot is already on the node", () => expect(rightClickAction(54, true, true)).toBe("already"));
  it("between slots nothing happens", () => expect(rightClickAction(null, true, false)).toBe("none"));
});

describe("plate texts", () => {
  it("click on an unlisted channel", () => {
    expect(unlistedClick(52, true).text).toBe("CH52 NOT ENABLED · RIGHT-CLICK TO ADD");
    expect(unlistedClick(52, false).text).toBe("CH52 NOT ENABLED");
    expect(unlistedClick(52, true).ms).toBe(2500);
  });
  it("dwell hints", () => {
    expect(dwellHint(true, false)).toBe("CLICK TO SELECT · HOLD TO LISTEN");
    expect(dwellHint(false, true)).toBe("HOLD TO LISTEN · RIGHT-CLICK TO ADD");
    expect(dwellHint(false, false)).toBe("HOLD TO LISTEN");
  });
  it("four-digit AAR", () => {
    expect(aar4(54)).toBe("5454");
    expect(aar4(7)).toBe("0707");
  });
  it("add results", () => {
    expect(addedMessage(54, "SDR-01", true, "5454").text).toBe("5454 ADDED · ENABLED ON SDR-01");
    expect(addedMessage(54, "SDR-01", false, "CSX LNDVR").text).toBe("CSX LNDVR · 5454 ENABLED ON SDR-01");
    expect(alreadyOn(54, "SDR-01")).toMatchObject({ text: "5454 ALREADY ON SDR-01", tone: "ink-2" });
    expect(notAdded(54, "node offline")).toMatchObject({ text: "5454 NOT ADDED · NODE OFFLINE", tone: "fault" });
  });
  it("hold errors", () => {
    expect(holdFailed(54, "forbidden")).toMatchObject({ text: "LISTEN NEEDS ADMIN", tone: "ink-2" });
    expect(holdFailed(54, "node timeout")).toMatchObject({ text: "CH54 · LISTEN FAILED · NODE TIMEOUT", tone: "fault", ms: 4000 });
    expect(nodeDown("SDR-01", "offline").text).toBe("SDR-01 OFFLINE · CANNOT LISTEN");
  });
});

describe("holdPlate", () => {
  const base: HoldView = { channel: 54, node: "SDR-01", state: "tuning", inStateMs: 0, enabled: false, mhz: 160.92, audioMuted: false };
  it("tuning", () => expect(holdPlate(base)).toEqual({ text: "TUNING · CH54 · SDR-01", tone: "ink-2" }));
  it("no response after 5 s, still tuning", () => expect(holdPlate({ ...base, inStateMs: 5000 })?.text).toBe("NO RESPONSE FROM SDR-01"));
  it("listening", () => expect(holdPlate({ ...base, state: "listening" })).toEqual({ text: "LISTENING · CH54 · 160.920", tone: "ink" }));
  it("listening to an enabled channel", () => expect(holdPlate({ ...base, state: "listening", enabled: true })?.text).toBe("LISTENING · CH54 · ENABLED"));
  it("audio muted", () => expect(holdPlate({ ...base, state: "listening", audioMuted: true })?.text).toBe("LISTENING · CH54 · 160.920 · AUDIO MUTED"));
  it("never invents a state", () => {
    expect(holdPlate({ ...base, state: null })).toBeNull();
    expect(holdPlate({ ...base, state: "failed" })).toBeNull();
    expect(holdPlate({ ...base, state: "released" })).toBeNull();
  });
  it("timer", () => {
    expect(heldTimer(4900)).toBe("00:04");
    expect(heldTimer(65000)).toBe("01:05");
  });
});
