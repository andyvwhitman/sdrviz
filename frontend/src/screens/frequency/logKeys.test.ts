// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Recording } from "$lib/types/recordings";
import { logKey, type LogKeyActions } from "./logKeys";
import { player } from "./player.svelte";

const rec = { id: 7, audio_state: "ok", audio_url: "/a" } as Recording;

function setup(over: Partial<LogKeyActions> = {}) {
  const actions: LogKeyActions = {
    step: vi.fn(), focused: () => undefined, play: vi.fn(), toggleContinuous: vi.fn(), showToday: vi.fn(), jumped: () => false, clearJump: vi.fn(), ...over,
  };
  const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, "target", { value: target });
    return { handled: logKey(event, actions), event };
  };
  return { actions, press };
}

describe("the log's keys", () => {
  it("J and K step through rows, C toggles continuous play, T goes to today", () => {
    const { actions, press } = setup();
    expect(press("j").handled).toBe(true);
    expect(actions.step).toHaveBeenLastCalledWith(1);
    press("K");
    expect(actions.step).toHaveBeenLastCalledWith(-1);
    press("c");
    expect(actions.toggleContinuous).toHaveBeenCalled();
    press("t");
    expect(actions.showToday).toHaveBeenCalled();
  });

  it("plays the focused row on Space or Enter, only when the key came from a row", () => {
    const row = document.createElement("li");
    row.dataset.rec = "7";
    const { actions, press } = setup({ focused: () => rec });
    expect(press(" ", {}, row).handled).toBe(true);
    expect(actions.play).toHaveBeenCalledWith(rec);
    expect(press("Enter", {}, document.body).handled).toBe(false);
  });

  it("leaves modified keys and typing in a field alone", () => {
    const { press } = setup();
    expect(press("j", { metaKey: true }).handled).toBe(false);
    expect(press("j", {}, document.createElement("input")).handled).toBe(false);
  });

  it("Esc steps back one layer: playback first, then a bucket jump, then nothing", () => {
    const stop = vi.spyOn(player, "stop").mockImplementation(() => {});
    player.playingId = 7;
    const { actions, press } = setup({ jumped: () => true });
    expect(press("Escape").handled).toBe(true);
    expect(stop).toHaveBeenCalled();
    player.playingId = null;
    expect(press("Escape").handled).toBe(true);
    expect(actions.clearJump).toHaveBeenCalled();
    const bare = setup();
    expect(bare.press("Escape").handled).toBe(false);
  });
});
