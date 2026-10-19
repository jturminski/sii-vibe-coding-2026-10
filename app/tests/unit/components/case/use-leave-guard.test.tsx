import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLeaveGuard } from "@/components/case/use-leave-guard";

afterEach(cleanup);

/** Dispatches a cancelable beforeunload and reports whether a handler asked to confirm leaving. */
function leaveIsGuarded(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useLeaveGuard (AC-37)", () => {
  it("asks for confirmation before unload while active", () => {
    renderHook(() => useLeaveGuard(true));
    expect(leaveIsGuarded()).toBe(true);
  });

  it("does nothing while inactive", () => {
    renderHook(() => useLeaveGuard(false));
    expect(leaveIsGuarded()).toBe(false);
  });

  it("removes the listener when deactivated and on unmount", () => {
    const { rerender, unmount } = renderHook(({ active }) => useLeaveGuard(active), { initialProps: { active: true } });
    rerender({ active: false });
    expect(leaveIsGuarded()).toBe(false);
    rerender({ active: true });
    expect(leaveIsGuarded()).toBe(true);
    unmount();
    expect(leaveIsGuarded()).toBe(false);
  });
});
