'use client';

import { useEffect, useRef, useState } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';

const JOYSTICK_RADIUS_PX = 44;

/**
 * Touch-only virtual joystick for movement. Look is handled by the ordinary
 * one-finger drag anywhere else on the canvas (see FirstPersonControls),
 * which this widget deliberately avoids intercepting outside its own base.
 */
export function MobileControls() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);
  const baseRef = useRef<HTMLDivElement | null>(null);
  const setMobileMove = useViewerStore((s) => s.setMobileMove);
  const mode = useViewerStore((s) => s.mode);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a media query, an external system
    setIsTouchDevice(coarse);
  }, []);

  useEffect(() => {
    if (mode !== 'first-person') {
      setMobileMove({ x: 0, z: 0 });
    }
    // A cleanup, not just the mode-change branch above: if this component
    // unmounts entirely while still holding a nonzero move (a visitor holds
    // the joystick and closes the explorer with another finger), mobileMove
    // is never reset — it lives in the shared Zustand store, not local
    // state, so useFrame keeps reading that stale nonzero value and the
    // camera starts walking again the instant the explorer reopens.
    return () => {
      setMobileMove({ x: 0, z: 0 });
    };
  }, [mode, setMobileMove]);

  // The browser losing focus or the tab becoming hidden while the joystick
  // is held (switching apps, a permission dialog, minimizing) commonly never
  // delivers a pointerup — without this, activePointerId and the shared
  // mobileMove vector stay stuck nonzero, and the camera keeps walking on
  // its own once focus returns, until another joystick touch or a remount.
  // Same lost-release scenario the look-drag controller already guards
  // against in FirstPersonControls.
  useEffect(() => {
    function resetJoystick() {
      activePointerId.current = null;
      setKnob({ x: 0, y: 0 });
      setMobileMove({ x: 0, z: 0 });
    }
    window.addEventListener('blur', resetJoystick);
    document.addEventListener('visibilitychange', resetJoystick);
    return () => {
      window.removeEventListener('blur', resetJoystick);
      document.removeEventListener('visibilitychange', resetJoystick);
    };
  }, [setMobileMove]);

  if (!isTouchDevice || mode !== 'first-person') return null;

  function updateFromPointer(clientX: number, clientY: number) {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS_PX) {
      dx = (dx / dist) * JOYSTICK_RADIUS_PX;
      dy = (dy / dist) * JOYSTICK_RADIUS_PX;
    }
    setKnob({ x: dx, y: dy });
    setMobileMove({ x: dx / JOYSTICK_RADIUS_PX, z: -dy / JOYSTICK_RADIUS_PX });
  }

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto absolute bottom-8 left-8 z-20 flex h-28 w-28 items-center justify-center rounded-full border border-ivory/40 bg-charcoal/25 backdrop-blur-sm touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        activePointerId.current = e.pointerId;
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        activePointerId.current = null;
        setKnob({ x: 0, y: 0 });
        setMobileMove({ x: 0, z: 0 });
      }}
      onPointerCancel={() => {
        activePointerId.current = null;
        setKnob({ x: 0, y: 0 });
        setMobileMove({ x: 0, z: 0 });
      }}
      aria-label="Move (drag this joystick; look is a one-finger drag anywhere else on screen)"
    >
      <div
        className="h-12 w-12 rounded-full bg-ivory/80 shadow-md"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
