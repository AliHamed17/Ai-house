import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';

// A live WebGL render loop can't be driven deterministically in a jsdom
// unit test (and, in this sandboxed environment, not reliably even in a
// real browser e2e test — software-rendered frames can take seconds to
// tick). useFrame is mocked to just capture the callback FirstPersonControls
// registers, so the test can invoke it manually as many times as it wants,
// with an exact simulated delta, instead of waiting on real frames.
const { frameRef, threeRef } = vi.hoisted(() => ({
  frameRef: { current: null as ((state: { clock: { elapsedTime: number } }, delta: number) => void) | null },
  threeRef: { current: null as { camera: THREE.PerspectiveCamera; gl: { domElement: HTMLCanvasElement } } | null },
}));

vi.mock('@react-three/fiber', () => ({
  useThree: () => threeRef.current!,
  useFrame: (cb: (state: { clock: { elapsedTime: number } }, delta: number) => void) => {
    frameRef.current = cb;
  },
}));

// Collision resolution is orthogonal to this fix (pressedKeys clearing) and
// depends on real house geometry/starting position — mocked to an identity
// function so movement deltas are exact, simple arithmetic instead of also
// being a (redundant) test of the collision system.
vi.mock('@/lib/geometry/collision', () => ({
  resolveCollision: (candidate: { x: number; z: number }) => candidate,
  pointInPolygon: () => false,
}));

import { FirstPersonControls } from '@/components/viewer3d/FirstPersonControls';
import { useViewerStore } from '@/lib/store/viewerStore';

const FRAME_DT = 0.05; // matches the component's own max-delta clamp

function tick(elapsedTime: number) {
  frameRef.current?.({ clock: { elapsedTime } }, FRAME_DT);
}

describe('FirstPersonControls: losing focus while a movement key is held (regression)', () => {
  beforeEach(() => {
    const camera = new THREE.PerspectiveCamera();
    const canvas = document.createElement('canvas');
    threeRef.current = { camera, gl: { domElement: canvas } };
    frameRef.current = null;
    useViewerStore.setState({
      mode: 'first-person',
      playerPose: { x: 0, z: 0, yaw: 0 },
      teleportTarget: null,
      teleportToken: 0,
      mobileMove: { x: 0, z: 0 },
      mobileLookDelta: { dx: 0, dy: 0 },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('a keyup delivered normally stops movement on the next frame (baseline)', () => {
    render(<FirstPersonControls />);
    const { camera } = threeRef.current!;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    tick(0.05);
    const afterOneFrame = camera.position.z;
    expect(afterOneFrame).not.toBe(0);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    tick(0.1);
    expect(camera.position.z).toBe(afterOneFrame);
  });

  it('a dropped keyup (window blur) stops movement on the next frame even though the key was never released (regression)', () => {
    render(<FirstPersonControls />);
    const { camera } = threeRef.current!;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    tick(0.05);
    const afterOneFrame = camera.position.z;
    expect(afterOneFrame).not.toBe(0);

    // No keyup — this is the dropped-event scenario itself (switching apps
    // or tabs while a movement key is held).
    window.dispatchEvent(new Event('blur'));
    tick(0.1);
    expect(camera.position.z).toBe(afterOneFrame);

    // Without the fix, pressedKeys still has KeyW here and this second tick
    // would move the camera again by the same amount as the first.
    tick(0.15);
    expect(camera.position.z).toBe(afterOneFrame);
  });

  it('a dropped keyup (document visibilitychange) also stops movement on the next frame (regression)', () => {
    render(<FirstPersonControls />);
    const { camera } = threeRef.current!;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    tick(0.05);
    const afterOneFrame = camera.position.z;
    expect(afterOneFrame).not.toBe(0);

    document.dispatchEvent(new Event('visibilitychange'));
    tick(0.1);
    expect(camera.position.z).toBe(afterOneFrame);
  });

  it('a held key does not resume moving the camera after returning from a non-first-person mode (defense in depth, regression)', () => {
    render(<FirstPersonControls />);
    const { camera } = threeRef.current!;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    tick(0.05);
    const afterOneFrame = camera.position.z;
    expect(afterOneFrame).not.toBe(0);

    // Returning to first-person also restores the camera from the store's
    // playerPose (the normal "resume where you left off" handoff) — sync it
    // to where the movement above actually left the camera, so that restore
    // is a no-op and isolates what this test is actually checking: whether
    // pressedKeys itself got cleared, not whether the handoff moved anything.
    useViewerStore.setState({ playerPose: { x: camera.position.x, z: camera.position.z, yaw: 0 } });

    // Leaving first-person without an intervening keyup — e.g. switching to
    // Dollhouse while still physically holding the key. Each setState is
    // flushed (via act) as its own render, so the mode-clearing effect
    // actually observes the intermediate 'orbit' value — two updates fired
    // back-to-back outside of act() can otherwise coalesce into one render
    // that never shows 'orbit' to the effect's dependency array at all.
    act(() => {
      useViewerStore.setState({ mode: 'orbit' });
    });
    act(() => {
      useViewerStore.setState({ mode: 'first-person' });
    });
    tick(0.1);
    // The mode-change effect must have cleared pressedKeys; a stale KeyW
    // must not resume moving the camera just because mode is first-person
    // again, with no fresh keydown having occurred.
    expect(camera.position.z).toBe(afterOneFrame);
  });

  it('a fresh keydown after blur still moves the camera normally (the clear does not permanently break input)', () => {
    render(<FirstPersonControls />);
    const { camera } = threeRef.current!;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    tick(0.05);
    window.dispatchEvent(new Event('blur'));
    tick(0.1);
    const afterBlur = camera.position.z;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    tick(0.15);
    expect(camera.position.z).not.toBe(afterBlur);
  });
});
