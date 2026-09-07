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
