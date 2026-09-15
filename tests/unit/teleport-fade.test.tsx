import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { TeleportFade } from '@/components/viewer3d/TeleportFade';
import { useViewerStore } from '@/lib/store/viewerStore';

/**
 * The fade is a full-screen opaque overlay over the explorer, so any state
 * that leaves it stuck at opacity 1 hides the entire 3D view with no way back.
 */

function overlayOpacity(container: HTMLElement): string {
  const el = container.querySelector('div[aria-hidden]') as HTMLElement;
  return el.style.opacity;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  act(() => {
    useViewerStore.setState({ teleportToken: 0, reducedMotion: false });
  });
});

describe('TeleportFade', () => {
  it('fades in on a teleport and lifts itself again', () => {
    vi.useFakeTimers();
    const { container } = render(<TeleportFade />);
    expect(overlayOpacity(container)).toBe('0');

    act(() => {
      useViewerStore.setState({ teleportToken: 1 });
    });
    expect(overlayOpacity(container)).toBe('1');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(overlayOpacity(container)).toBe('0');
  });

  it('clears an in-flight fade when reduced motion is switched on mid-fade (regression)', () => {
    // The effect re-runs when reducedMotion changes, and its cleanup cancels
    // the hide timer. Returning early without clearing `visible` left the
    // explorer under an opaque overlay indefinitely — nothing else would ever
    // lift it.
    vi.useFakeTimers();
    const { container } = render(<TeleportFade />);

    act(() => {
      useViewerStore.setState({ teleportToken: 1 });
    });
    expect(overlayOpacity(container)).toBe('1');

    act(() => {
      useViewerStore.setState({ reducedMotion: true });
    });
    expect(overlayOpacity(container), 'the overlay must not stay opaque').toBe('0');

    // And it stays clear: the cancelled timer is not coming back.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(overlayOpacity(container)).toBe('0');
  });

  it('never replays a teleport that happened before it mounted (regression)', () => {
    // Closing the explorer unmounts this component but leaves teleportToken
    // at its last value in the module-level store. Keying off "token !== 0"
    // therefore fired a fade on every reopen after any teleport — and if
    // reduced motion had been enabled meanwhile, that stale fade is exactly
    // what got stuck opaque.
    act(() => {
      useViewerStore.setState({ teleportToken: 7 });
    });
    const { container } = render(<TeleportFade />);
    expect(overlayOpacity(container)).toBe('0');
  });

  it('does not fade for a teleport that arrives while reduced motion is on, even after it is turned off', () => {
    vi.useFakeTimers();
    act(() => {
      useViewerStore.setState({ reducedMotion: true });
    });
    const { container } = render(<TeleportFade />);

    act(() => {
      useViewerStore.setState({ teleportToken: 3 });
    });
    expect(overlayOpacity(container)).toBe('0');

    // Turning the preference back off must not retroactively play the fade
    // for a jump the visitor already made.
    act(() => {
      useViewerStore.setState({ reducedMotion: false });
    });
    expect(overlayOpacity(container)).toBe('0');
  });

  it('still fades for a NEW teleport after reduced motion is turned back off', () => {
    vi.useFakeTimers();
    act(() => {
      useViewerStore.setState({ reducedMotion: true, teleportToken: 3 });
    });
    const { container } = render(<TeleportFade />);

    act(() => {
      useViewerStore.setState({ reducedMotion: false });
    });
    act(() => {
      useViewerStore.setState({ teleportToken: 4 });
    });
    expect(overlayOpacity(container)).toBe('1');
  });
});
