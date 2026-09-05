'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { houseModel } from '@/data/house';
import type { BuiltWall, WallVoid } from '@/lib/geometry/wallPanels';
import { builtWalls } from '@/lib/geometry/builtHouse';
import { resolveFloorColor, resolveWallColor } from '@/data/materials';
import type { RoomDef } from '@/lib/types';

function polygonShape(polygon: { x: number; z: number }[]): THREE.Shape {
  const shape = new THREE.Shape();
  polygon.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.z);
    else shape.lineTo(p.x, p.z);
  });
  shape.closePath();
  return shape;
}

function Floor({ room, variantId }: { room: RoomDef; variantId: string }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(polygonShape(room.floorPolygon)), [room.floorPolygon]);
  const color = resolveFloorColor(room.floorMaterialId, variantId);
  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.02} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Ceiling({ room, variantId }: { room: RoomDef; variantId: string }) {
  const height = room.wallHeightOverrideM ?? room.ceilingHeightM;
  const geometry = useMemo(() => new THREE.ShapeGeometry(polygonShape(room.floorPolygon)), [room.floorPolygon]);
  if (room.isExterior) return null;
  const color = resolveWallColor(room.wallMaterialId, variantId);
  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]}>
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WindowGlazing({ wall, voidDef }: { wall: BuiltWall; voidDef: WallVoid }) {
  const tMid = (voidDef.t0 + voidDef.t1) / 2;
  const width = voidDef.t1 - voidDef.t0;
  const height = voidDef.y1 - voidDef.y0;
  const x = wall.start.x + wall.ux * tMid;
  const z = wall.start.z + wall.uz * tMid;
  const y = (voidDef.y0 + voidDef.y1) / 2;
  // Three.js rotation.y rotates local +X toward world +Z, but our wall
  // angle is measured as the tangent direction (atan2(dx,dz), i.e. from
  // world +Z toward +X) — the two conventions are offset by 90 degrees.
  const rotY = wall.angleRad - Math.PI / 2;
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <mesh>
        <planeGeometry args={[Math.max(width - 0.06, 0.05), Math.max(height - 0.06, 0.05)]} />
        <meshPhysicalMaterial
          color="#bcd6e0"
          transparent
          opacity={0.28}
          roughness={0.05}
          metalness={0}
          transmission={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[width, height, 0.05]} />
        <meshStandardMaterial color="#4B4037" wireframe />
      </mesh>
    </group>
  );
}

function WallMesh({ wall, variantId, isProtected }: { wall: BuiltWall; variantId: string; isProtected: boolean }) {
  const room = houseModel.rooms.find((r) => r.id === wall.roomId)!;
  const baseMaterialId = wall.exterior ? 'exterior-render' : room.wallMaterialId;
  const color = resolveWallColor(baseMaterialId, variantId);
  const windows = wall.voids.filter((v) => v.kind === 'window');
  return (
    <group>
      {wall.renderPanels.map((panel, i) => (
        <mesh key={i} position={[panel.center.x, panel.center.y, panel.center.z]} rotation={[0, panel.rotationYRad, 0]} castShadow receiveShadow>
          <boxGeometry args={[panel.widthM, panel.heightM, panel.depthM]} />
          <meshStandardMaterial
            color={isProtected ? '#8a6a4a' : color}
            roughness={wall.exterior ? 0.85 : 0.9}
            metalness={0}
          />
        </mesh>
      ))}
      {windows.map((v) => (
        <WindowGlazing key={v.openingId} wall={wall} voidDef={v} />
      ))}
    </group>
  );
}

function StructuralColumns() {
  return (
    <>
      {houseModel.structuralFeatures.map((f) => (
        <mesh key={f.id} position={[f.position.x, f.heightM / 2, f.position.z]} castShadow>
          <cylinderGeometry args={[f.radiusM, f.radiusM, f.heightM, 16]} />
          <meshStandardMaterial color="#e7e2d6" roughness={0.7} />
        </mesh>
      ))}
    </>
  );
}

export function HouseGeometry({ variantId }: { variantId: string }) {
  const protectedWallIds = useMemo(() => {
    const ids = new Set<string>();
    for (const w of builtWalls) {
      if (w.voids.some((v) => v.isProtected)) ids.add(`${w.roomId}:${w.wallId}`);
    }
    return ids;
  }, []);

  return (
    <group>
      {houseModel.rooms.map((room) => (
        <group key={room.id}>
          <Floor room={room} variantId={variantId} />
          <Ceiling room={room} variantId={variantId} />
        </group>
      ))}
      {builtWalls.map((wall) => (
        <WallMesh
          key={`${wall.roomId}:${wall.wallId}`}
          wall={wall}
          variantId={variantId}
          isProtected={protectedWallIds.has(`${wall.roomId}:${wall.wallId}`)}
        />
      ))}
      <StructuralColumns />
    </group>
  );
}
