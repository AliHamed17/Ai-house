'use client';

import { RoundedBox } from '@react-three/drei';
import type { FurnitureItem } from '@/lib/types';

/**
 * Purely procedural, recognizable furniture primitives — no external 3D
 * model files, so nothing here reproduces any real manufacturer's design
 * (avoids any licensing question). Local convention matches wall panels:
 * local +X = footprintM.widthM, local +Z = footprintM.depthM, and for
 * directional pieces (sofa backrest, bed headboard) the "back" sits at
 * local z = -depthM/2 — callers (see furniture.ts) choose rotationYRad so
 * that edge lands against the actual wall.
 */

function Sofa({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  const seatH = item.heightM * 0.55;
  const backH = item.heightM;
  const backThickness = Math.min(0.18, depthM * 0.3);
  return (
    <group>
      <RoundedBox args={[widthM, seatH, depthM]} radius={0.05} smoothness={2} position={[0, seatH / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={item.colorHex} roughness={0.85} />
      </RoundedBox>
      <RoundedBox
        args={[widthM, backH, backThickness]}
        radius={0.04}
        smoothness={2}
        position={[0, backH / 2, -depthM / 2 + backThickness / 2]}
        castShadow
      >
        <meshStandardMaterial color={item.colorHex} roughness={0.85} />
      </RoundedBox>
    </group>
  );
}

function Bed({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  const frameH = item.heightM * 0.35;
  const mattressH = item.heightM * 0.4;
  const headboardH = item.heightM * 1.7;
  const headboardThickness = 0.08;
  return (
    <group>
      <RoundedBox args={[widthM, frameH, depthM]} radius={0.02} position={[0, frameH / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#4B4037" roughness={0.7} />
      </RoundedBox>
      <RoundedBox
        args={[widthM * 0.96, mattressH, depthM * 0.94]}
        radius={0.06}
        position={[0, frameH + mattressH / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={item.colorHex} roughness={0.9} />
      </RoundedBox>
      <RoundedBox
        args={[widthM, headboardH, headboardThickness]}
        radius={0.02}
        position={[0, headboardH / 2, -depthM / 2 + headboardThickness / 2]}
        castShadow
      >
        <meshStandardMaterial color={item.colorHex} roughness={0.85} />
      </RoundedBox>
    </group>
  );
}

function CounterStool({ item }: { item: FurnitureItem }) {
  const seatR = Math.max(item.footprintM.widthM, item.footprintM.depthM) / 2;
  return (
    <group>
      <mesh position={[0, item.heightM * 0.42, 0]} castShadow>
        <cylinderGeometry args={[seatR * 0.55, seatR * 0.55, 0.05, 20]} />
        <meshStandardMaterial color={item.colorHex} roughness={0.7} />
      </mesh>
      <mesh position={[0, item.heightM * 0.21, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, item.heightM * 0.42, 12]} />
        <meshStandardMaterial color="#4B4037" roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}

function Vanity({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  const mountY = 0.75;
  const cabinetH = mountY - item.heightM / 2;
  return (
    <group>
      <RoundedBox args={[widthM, item.heightM, depthM]} radius={0.015} position={[0, mountY, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={item.colorHex} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, cabinetH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM * 0.8, cabinetH, depthM * 0.8]} />
        <meshStandardMaterial color="#8B7C6C" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Rug({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  return (
    <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[widthM, depthM]} />
      <meshStandardMaterial color={item.colorHex} roughness={0.95} />
    </mesh>
  );
}

function SimpleBox({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  return (
    <RoundedBox
      args={[widthM, item.heightM, depthM]}
      radius={Math.min(0.03, item.heightM * 0.1)}
      smoothness={2}
      position={[0, item.heightM / 2, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={item.colorHex} roughness={0.75} />
    </RoundedBox>
  );
}

export function FurnitureMesh({ item }: { item: FurnitureItem }) {
  switch (item.kind) {
    case 'sofa':
      return <Sofa item={item} />;
    case 'bed':
      return <Bed item={item} />;
    case 'counter-stool':
      return <CounterStool item={item} />;
    case 'vanity':
      return <Vanity item={item} />;
    case 'rug':
      return <Rug item={item} />;
    default:
      return <SimpleBox item={item} />;
  }
}
