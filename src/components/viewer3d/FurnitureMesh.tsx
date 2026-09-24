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

// --- Fitted kitchen joinery (the transformation set) -----------------------

/** Slab-front cabinetry: one body with shallow vertical reveals between
 *  door leaves, which is what reads as "handleless" at this scale. */
function SlabCabinet({
  item,
  leafAxis = 'depth',
  emissive = false,
}: {
  item: FurnitureItem;
  leafAxis?: 'depth' | 'width';
  emissive?: boolean;
}) {
  const { widthM, depthM } = item.footprintM;
  const span = leafAxis === 'depth' ? depthM : widthM;
  const leaves = Math.max(1, Math.round(span / 0.5));
  const leafSpan = span / leaves;
  return (
    <group>
      <mesh position={[0, item.heightM / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM, item.heightM, depthM]} />
        <meshStandardMaterial
          color={item.colorHex}
          roughness={0.55}
          metalness={0.02}
          emissive={emissive ? '#E8A55C' : '#000000'}
          emissiveIntensity={emissive ? 0.35 : 0}
        />
      </mesh>
      {Array.from({ length: leaves - 1 }, (_, i) => {
        const offset = -span / 2 + leafSpan * (i + 1);
        return (
          <mesh
            key={i}
            position={
              leafAxis === 'depth'
                ? [widthM / 2 + 0.002, item.heightM / 2, offset]
                : [offset, item.heightM / 2, depthM / 2 + 0.002]
            }
          >
            <boxGeometry
              args={
                leafAxis === 'depth'
                  ? [0.006, item.heightM * 0.94, 0.012]
                  : [0.012, item.heightM * 0.94, 0.006]
              }
            />
            <meshStandardMaterial color="#2A2622" roughness={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Tall display joinery: a dark slim frame around a recessed lighter
 *  interior with real shelves, fronted by glass. Rendering it as one solid
 *  slab made it read as a dark void rather than a display cabinet. */
function DisplayCabinet({ item, lit = false }: { item: FurnitureItem; lit?: boolean }) {
  const { widthM, depthM } = item.footprintM;
  const shelves = 4;
  return (
    <group>
      <mesh position={[0, item.heightM / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM, item.heightM, depthM]} />
        <meshStandardMaterial color={item.colorHex} roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Recessed interior */}
      <mesh position={[0.02, item.heightM / 2, 0]}>
        <boxGeometry args={[widthM * 0.86, item.heightM - 0.16, depthM - 0.1]} />
        <meshStandardMaterial
          color="#B9A78E"
          roughness={0.8}
          emissive={lit ? '#E8A55C' : '#000000'}
          emissiveIntensity={lit ? 0.75 : 0}
        />
      </mesh>
      {Array.from({ length: shelves - 1 }, (_, i) => {
        const y = ((i + 1) * (item.heightM - 0.16)) / shelves + 0.08;
        return (
          <mesh key={i} position={[0.03, y, 0]}>
            <boxGeometry args={[widthM * 0.84, 0.022, depthM - 0.12]} />
            <meshStandardMaterial color="#8E7A61" roughness={0.7} />
          </mesh>
        );
      })}
      {/* Glass front */}
      <mesh position={[widthM / 2 + 0.006, item.heightM / 2, 0]}>
        <boxGeometry args={[0.01, item.heightM - 0.12, depthM - 0.08]} />
        <meshPhysicalMaterial
          color="#C6D2D6"
          transparent
          opacity={0.18}
          roughness={0.06}
          metalness={0}
          transmission={0.6}
        />
      </mesh>
    </group>
  );
}

/** Base run with a pale stone worktop slab on top. */
function BaseRun({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  const topH = 0.04;
  const bodyH = item.heightM - topH;
  return (
    <group>
      <SlabCabinet item={{ ...item, heightM: bodyH }} leafAxis="depth" />
      <mesh position={[0, bodyH + topH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM + 0.02, topH, depthM]} />
        <meshStandardMaterial color="#E6DFD3" roughness={0.35} metalness={0.03} />
      </mesh>
    </group>
  );
}

/** Island: fluted oak base (vertical ribs) under a stone worktop. */
function Island({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  const topH = 0.05;
  const bodyH = item.heightM - topH;
  const ribs = Math.max(4, Math.round(depthM / 0.09));
  return (
    <group>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM, bodyH, depthM]} />
        <meshStandardMaterial color={item.colorHex} roughness={0.7} />
      </mesh>
      {Array.from({ length: ribs }, (_, i) => {
        const z = -depthM / 2 + (depthM / ribs) * (i + 0.5);
        return (
          <mesh key={i} position={[widthM / 2, bodyH / 2, z]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, bodyH * 0.98, 8]} />
            <meshStandardMaterial color={item.colorHex} roughness={0.65} />
          </mesh>
        );
      })}
      <mesh position={[0, bodyH + topH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM + 0.05, topH, depthM + 0.05]} />
        <meshStandardMaterial color="#E6DFD3" roughness={0.3} metalness={0.04} />
      </mesh>
    </group>
  );
}

/** Ceiling-hung open shelf on thin dark rods. */
function SuspendedShelf({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  const mountY = item.mountYM ?? 1.6;
  const rodTop = 2.7;
  const rodH = Math.max(rodTop - mountY - item.heightM, 0.05);
  return (
    <group>
      <mesh position={[0, item.heightM / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[widthM, item.heightM, depthM]} />
        <meshStandardMaterial color={item.colorHex} roughness={0.5} metalness={0.15} />
      </mesh>
      {[-depthM / 2 + 0.06, depthM / 2 - 0.06].map((z, i) => (
        <mesh key={i} position={[0, item.heightM + rodH / 2, z]}>
          <cylinderGeometry args={[0.008, 0.008, rodH, 8]} />
          <meshStandardMaterial color="#2A2622" roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Pendant: a slim cord to the ceiling plus a bronze shade. */
function Pendant({ item, lit = false }: { item: FurnitureItem; lit?: boolean }) {
  const r = Math.max(item.footprintM.widthM, item.footprintM.depthM) / 2;
  const mountY = item.mountYM ?? 1.95;
  const cordH = Math.max(2.7 - mountY - item.heightM, 0.05);
  return (
    <group>
      <mesh position={[0, item.heightM + cordH / 2, 0]}>
        <cylinderGeometry args={[0.005, 0.005, cordH, 6]} />
        <meshStandardMaterial color="#2A2622" roughness={0.5} />
      </mesh>
      <mesh position={[0, item.heightM / 2, 0]} castShadow>
        <coneGeometry args={[r, item.heightM, 20, 1, true]} />
        <meshStandardMaterial
          color={item.colorHex}
          roughness={0.45}
          metalness={0.3}
          side={2}
          emissive={lit ? '#FFC08A' : '#000000'}
          emissiveIntensity={lit ? 0.9 : 0}
        />
      </mesh>
    </group>
  );
}

/** Thin wall-plane slab (splashback). */
function Slab({ item }: { item: FurnitureItem }) {
  const { widthM, depthM } = item.footprintM;
  return (
    <mesh position={[0, item.heightM / 2, 0]} receiveShadow>
      <boxGeometry args={[widthM, item.heightM, depthM]} />
      <meshStandardMaterial color={item.colorHex} roughness={0.3} metalness={0.03} />
    </mesh>
  );
}

/**
 * `warmLight` turns on the emissive treatment for fixtures and lit joinery.
 * It is driven by the active transformation stage's lighting state so the
 * display cabinets glow in the dusk/warm-evening beats exactly as they do in
 * the rendered video, and stay unlit in daylight.
 */
export function FurnitureMesh({ item, warmLight = false }: { item: FurnitureItem; warmLight?: boolean }) {
  const body = (() => {
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
      case 'wall-cabinet':
        return <SlabCabinet item={item} leafAxis="depth" />;
      case 'tall-cabinet':
        return <DisplayCabinet item={item} lit={warmLight} />;
      case 'base-run':
        return <BaseRun item={item} />;
      case 'backsplash':
        return <Slab item={item} />;
      case 'suspended-shelf':
        return <SuspendedShelf item={item} />;
      case 'island':
        return <Island item={item} />;
      case 'pendant':
        return <Pendant item={item} lit={warmLight} />;
      default:
        return <SimpleBox item={item} />;
    }
  })();

  // Wall-hung and ceiling-hung pieces carry their own mount height so every
  // primitive above can keep building from its own local y=0.
  return item.mountYM ? <group position={[0, item.mountYM, 0]}>{body}</group> : body;
}
