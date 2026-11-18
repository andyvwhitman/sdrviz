// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ApiError } from "$lib/api/client";
import { loginFailure, waitText } from "./loginFailure";

describe("loginFailure", () => {
  it("a wrong password, a too-long password and any other rejection read the same", () => {
    for (const status of [400, 401, 422]) expect(loginFailure(new ApiError(status, "x"))).toEqual({ message: "Password not accepted.", waitS: null });
  });

  it("a rate limit (429) says to wait, using Retry-After when the server sends it", () => {
    expect(loginFailure(new ApiError(429, "x", 42))).toEqual({ message: "Too many attempts.", waitS: 42 });
    expect(loginFailure(new ApiError(429, "x")).waitS).toBe(60);
  });

  it("a lockout (423) is worded as a lockout and waits in minutes", () => {
    const failure = loginFailure(new ApiError(423, "x", 600));
    expect(failure.message).toBe("Locked after repeated wrong passwords.");
    expect(failure.waitS).toBe(600);
  });

  it("a network failure is the backend, not the password", () => {
    expect(loginFailure(new TypeError("fetch failed"))).toEqual({ message: "Backend unreachable", waitS: null });
  });
});

describe("waitText", () => {
  it("counts seconds under a minute and a half, minutes above", () => {
    expect(waitText(59.2)).toBe("60 S");
    expect(waitText(90)).toBe("2 MIN");
  });
});
