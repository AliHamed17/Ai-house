import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MobileControls } from '@/components/viewer3d/MobileControls';
import { useViewerStore } from '@/lib/store/viewerStore';

describe('MobileControls: resets mobileMove on unmount (regression)', () => {
  beforeEach(() => {
    // jsdom has no matchMedia implementation by default; MobileControls
    // reads it unconditionally on mount.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    // jsdom also has no Pointer Capture implementation; the joystick's own
    // onPointerDown calls it unconditionally.
    HTMLElement.prototype.setPointerCapture = vi.fn();
    useViewerStore.setState({ mode: 'first-person', mobileMove: { x: 0, z: 0 } });
  });

  afterEach(() => {
    cleanup();
  });

  it('resets a nonzero mobileMove when the component unmounts while still in first-person mode', () => {
    // If a visitor holds the joystick and closes the explorer with another
    // finger, this component unmounts entirely while mode is STILL
    // first-person — the existing effect only reset mobileMove on a mode
    // CHANGE, with no cleanup, so this exact case left the shared store's
    // mobileMove nonzero forever; useFrame keeps reading it regardless of
    // whether this component is even mounted, so the camera would resume
    // walking the instant the explorer reopened.
    const { unmount } = render(<MobileControls />);
    useViewerStore.setState({ mobileMove: { x: 0.5, z: -0.5 } });
    expect(useViewerStore.getState().mobileMove).toEqual({ x: 0.5, z: -0.5 });

    unmount();
    expect(useViewerStore.getState().mobileMove).toEqual({ x: 0, z: 0 });
  });

  it('still resets on an ordinary mode change while mounted (baseline, unchanged behavior)', () => {
    render(<MobileControls />);
    useViewerStore.setState({ mobileMove: { x: 0.3, z: 0.3 } });

    act(() => {
      useViewerStore.setState({ mode: 'orbit' });
    });
    expect(useViewerStore.getState().mobileMove).toEqual({ x: 0, z: 0 });
  });
});

describe('MobileControls: resets the joystick on lost focus while a pointer is actively dragging it (regression)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    useViewerStore.setState({ mode: 'first-person', mobileMove: { x: 0, z: 0 } });
  });

  afterEach(() => {
    cleanup();
  });

  function pointerDownAt(base: HTMLElement, pointerId: number, clientX: number) {
    // getBoundingClientRect is all-zero in jsdom (no real layout), so
    // clientX/clientY here ARE the raw dx/dy updateFromPointer computes.
    act(() => {
      base.dispatchEvent(new PointerEvent('pointerdown', { pointerId, clientX, clientY: 0, bubbles: true }));
    });
  }

  it('a pointerup delivered normally resets it (baseline)', () => {
    const { getByLabelText } = render(<MobileControls />);
    const base = getByLabelText(/Move \(drag this joystick/i);

    pointerDownAt(base, 1, 20);
    expect(useViewerStore.getState().mobileMove.x).toBeCloseTo(20 / 44);

    // setPointerCapture is stubbed as a no-op above (jsdom has no real
    // implementation), so — unlike a real browser, where a captured
    // pointer's events retarget to the capturing element regardless of
    // where they're released — this must be dispatched on the base itself
    // to reach its onPointerUp handler at all.
    act(() => {
      base.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    });
    expect(useViewerStore.getState().mobileMove).toEqual({ x: 0, z: 0 });
  });

  it('a dropped pointerup (window blur) still resets it, so the camera does not keep walking on its own after focus returns (regression)', () => {
    const { getByLabelText } = render(<MobileControls />);
    const base = getByLabelText(/Move \(drag this joystick/i);

    pointerDownAt(base, 1, 20);
    expect(useViewerStore.getState().mobileMove.x).toBeCloseTo(20 / 44);

    // No pointerup — switching apps/tabs or a permission dialog while the
    // joystick is still physically held commonly never delivers one.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(useViewerStore.getState().mobileMove).toEqual({ x: 0, z: 0 });
  });

  it('a dropped pointerup (document visibilitychange) also resets it (regression)', () => {
    const { getByLabelText } = render(<MobileControls />);
    const base = getByLabelText(/Move \(drag this joystick/i);

    pointerDownAt(base, 1, 20);
    expect(useViewerStore.getState().mobileMove.x).toBeCloseTo(20 / 44);

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(useViewerStore.getState().mobileMove).toEqual({ x: 0, z: 0 });
  });

  it('a fresh pointerdown after a blur-triggered reset still works normally (the reset does not permanently break the joystick)', () => {
    const { getByLabelText } = render(<MobileControls />);
    const base = getByLabelText(/Move \(drag this joystick/i);

    pointerDownAt(base, 1, 20);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(useViewerStore.getState().mobileMove).toEqual({ x: 0, z: 0 });

    pointerDownAt(base, 2, 30);
    expect(useViewerStore.getState().mobileMove.x).toBeCloseTo(30 / 44);
  });
});
