'use client';
/* eslint-disable react-hooks/immutability --
 * React Three Fiber's camera/object refs are deliberately mutable imperative
 * handles updated every frame inside useFrame (the standard, documented R3F
 * pattern for 60fps updates without triggering React re-renders). The
 * generic React-Compiler-readiness rule doesn't know about this escape
 * hatch and flags every camera.position/rotation mutation here.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useViewerStore } from '@/lib/store/viewerStore';
import { builtWalls } from '@/lib/geometry/builtHouse';
import { resolveCollision, pointInPolygon } from '@/lib/geometry/collision';
import { houseModel } from '@/data/house';
import { EYE_HEIGHT_M, PLAYER_RADIUS_M } from '@/data/house';

const MOVE_SPEED_M_S = 2.2;
const MOUSE_LOOK_SENSITIVITY = 0.0026;
const TOUCH_LOOK_SENSITIVITY = 0.0062;
const PITCH_LIMIT_RAD = Math.PI / 2 - 0.06;
const STORE_UPDATE_INTERVAL_S = 0.12;

/**
 * First-person walk controller: WASD/arrow-key movement with wall collision,
 * mouse-drag or pointer-lock look, and mobile touch-look/joystick support
 * (driven by values the mobile control overlay writes into the store).
 * Camera rotation always uses a YXZ Euler order so roll is impossible.
 */
export function FirstPersonControls() {
  const { camera, gl } = useThree();
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const pressedKeys = useRef<Set<string>>(new Set());
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const lastStoreUpdateRef = useRef(0);
  const initializedRef = useRef(false);

  const mode = useViewerStore((s) => s.mode);
  const teleportToken = useViewerStore((s) => s.teleportToken);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    persp.near = 0.05;
    persp.far = 60;
    persp.fov = 70;
    persp.updateProjectionMatrix();
    camera.rotation.order = 'YXZ';

    if (!initializedRef.current) {
      const pose = useViewerStore.getState().playerPose;
      camera.position.set(pose.x, EYE_HEIGHT_M, pose.z);
      yawRef.current = pose.yaw;
      pitchRef.current = 0;
      initializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teleport: snap camera to the target room's spawn point + facing.
  useEffect(() => {
    const target = useViewerStore.getState().teleportTarget;
    if (!target) return;
    const room = houseModel.rooms.find((r) => r.id === target);
    useViewerStore.getState().consumeTeleport();
    if (!room) return;
    camera.position.set(room.cameraSpawn.x, EYE_HEIGHT_M, room.cameraSpawn.z);
    yawRef.current = room.cameraSpawnYaw;
    pitchRef.current = 0;
    useViewerStore.getState().setActiveRoomId(room.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleportToken]);

  // Smooth handoff when switching back from orbit/dollhouse mode. Skipped on
  // the very first mount (mode is already 'first-person' by default there),
  // since reading camera.quaternion before the init effect above has ever
  // run would clobber the room's intended spawn yaw with the camera's
  // untouched identity rotation. Also skipped whenever a teleport has landed
  // since this effect last ran: the teleport effect above already set the
  // correct destination position/yaw for that room, and restoring a saved
  // pose here would overwrite that authored facing/position.
  //
  // The no-teleport branch restores from the store's playerPose (the last
  // position/yaw recorded while this WAS the active first-person camera —
  // see the useFrame below) rather than reading the live camera transform.
  // camera is a single shared object across modes, so by the time this
  // effect runs after e.g. clicking Walk from Dollhouse with no teleport in
  // between, camera.position/quaternion reflect wherever the orbit camera
  // was left (often far outside the house), not where the visitor was
  // actually standing before they left Walk mode.
  const hasHandledModeRef = useRef(false);
  const teleportTokenAtLastHandoffRef = useRef(teleportToken);
  useEffect(() => {
    if (mode !== 'first-person') return;
    if (!hasHandledModeRef.current) {
      hasHandledModeRef.current = true;
      teleportTokenAtLastHandoffRef.current = teleportToken;
      return;
    }
    const teleportedSinceLastHandoff = teleportToken !== teleportTokenAtLastHandoffRef.current;
    teleportTokenAtLastHandoffRef.current = teleportToken;
    if (teleportedSinceLastHandoff) return;
    const pose = useViewerStore.getState().playerPose;
    pitchRef.current = 0;
    yawRef.current = pose.yaw;
    const resolved = resolveCollision({ x: pose.x, z: pose.z }, PLAYER_RADIUS_M, builtWalls);
    camera.position.set(resolved.x, EYE_HEIGHT_M, resolved.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, teleportToken]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      pressedKeys.current.add(e.code);
      if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock();
    }
    function onKeyUp(e: KeyboardEvent) {
      pressedKeys.current.delete(e.code);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;

    function onPointerDown(e: PointerEvent) {
      if (useViewerStore.getState().mode !== 'first-person') return;
      draggingRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'mouse') {
        try {
          canvas.requestPointerLock?.();
        } catch {
          // Pointer Lock can be denied/unsupported (iframes, automated tests) — drag-to-look still works.
        }
      }
    }
    function onPointerMove(e: PointerEvent) {
      if (useViewerStore.getState().mode !== 'first-person') return;
      let dx = 0;
      let dy = 0;
      if (document.pointerLockElement === canvas) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (draggingRef.current) {
        dx = e.clientX - lastPointerRef.current.x;
        dy = e.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      } else {
        return;
      }
      yawRef.current -= dx * MOUSE_LOOK_SENSITIVITY;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - dy * MOUSE_LOOK_SENSITIVITY, -PITCH_LIMIT_RAD, PITCH_LIMIT_RAD);
    }
    function onPointerUp() {
      draggingRef.current = false;
    }
    function onPointerLockChange() {
      useViewerStore.getState().setPointerLocked(document.pointerLockElement === canvas);
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [gl]);

  useFrame((state, rawDelta) => {
    if (useViewerStore.getState().mode !== 'first-person') return;
    const dt = Math.min(rawDelta, 0.05);

    const mobileLook = useViewerStore.getState().consumeMobileLook();
    if (mobileLook.dx !== 0 || mobileLook.dy !== 0) {
      yawRef.current -= mobileLook.dx * TOUCH_LOOK_SENSITIVITY;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - mobileLook.dy * TOUCH_LOOK_SENSITIVITY,
        -PITCH_LIMIT_RAD,
        PITCH_LIMIT_RAD,
      );
    }

    camera.rotation.set(pitchRef.current, yawRef.current, 0, 'YXZ');

    let moveRight = 0;
    let moveForward = 0;
    const keys = pressedKeys.current;
    if (keys.has('KeyW') || keys.has('ArrowUp')) moveForward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) moveForward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) moveRight += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) moveRight -= 1;

    const mobileMove = useViewerStore.getState().mobileMove;
    moveRight += mobileMove.x;
    moveForward += mobileMove.z;

    const len = Math.hypot(moveRight, moveForward);
    if (len > 1e-4) {
      const nRight = moveRight / len;
      const nForward = moveForward / len;
      const yaw = yawRef.current;
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const worldDX = forward.x * nForward + right.x * nRight;
      const worldDZ = forward.z * nForward + right.z * nRight;
      const candidate = {
        x: camera.position.x + worldDX * MOVE_SPEED_M_S * dt,
        z: camera.position.z + worldDZ * MOVE_SPEED_M_S * dt,
      };
      const resolved = resolveCollision(candidate, PLAYER_RADIUS_M, builtWalls);
      camera.position.x = resolved.x;
      camera.position.z = resolved.z;
    }
    camera.position.y = EYE_HEIGHT_M;

    const now = state.clock.elapsedTime;
    if (now - lastStoreUpdateRef.current > STORE_UPDATE_INTERVAL_S) {
      lastStoreUpdateRef.current = now;
      useViewerStore.getState().setPlayerPose({ x: camera.position.x, z: camera.position.z, yaw: yawRef.current });
      const here = { x: camera.position.x, z: camera.position.z };
      const room = houseModel.rooms.find((r) => pointInPolygon(here, r.floorPolygon));
      if (room) useViewerStore.getState().setActiveRoomId(room.id);
    }
  });

  return null;
}
