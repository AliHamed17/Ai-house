'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { furniture, isBlocking } from '@/data/furniture';
import { furnitureSurface, furnitureMaterialIds } from '@/lib/furniture/palette';
import type { FurnitureMaterialId, FurniturePiece } from '@/lib/furniture/types';

type Mats = Record<FurnitureMaterialId, THREE.Material>;

function useMaterials(variantId: string): Mats {
  return useMemo(() => {
    const out = {} as Mats;
    for (const id of furnitureMaterialIds) {
      const s = furnitureSurface(id, variantId);
      if (id === 'glass') {
        out[id] = new THREE.MeshPhysicalMaterial({
          color: s.color, roughness: s.roughness, metalness: 0,
          transparent: true, opacity: 0.22, transmission: 0.6, side: THREE.DoubleSide,
        });
      } else if (id === 'lampShade') {
        out[id] = new THREE.MeshStandardMaterial({
          color: s.color, roughness: s.roughness, metalness: 0,
          emissive: new THREE.Color('#FFE6BE'), emissiveIntensity: 0.55,
        });
      } else if (id === 'screen') {
        out[id] = new THREE.MeshStandardMaterial({
          color: s.color, roughness: s.roughness, metalness: s.metalness,
          emissive: new THREE.Color('#1B2530'), emissiveIntensity: 0.25,
        });
      } else {
        out[id] = new THREE.MeshStandardMaterial({ color: s.color, roughness: s.roughness, metalness: s.metalness });
      }
    }
    return out;
  }, [variantId]);
}

function useGeometries() {
  return useMemo(
    () => ({
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
      sphere: new THREE.SphereGeometry(0.5, 12, 10),
    }),
    [],
  );
}

interface PartProps {
  g: THREE.BufferGeometry;
  m: THREE.Material;
  px: number; py: number; pz: number;
  sx: number; sy: number; sz: number;
  cast?: boolean;
}

function Part({ g, m, px, py, pz, sx, sy, sz, cast = true }: PartProps) {
  return (
    <mesh geometry={g} material={m} position={[px, py, pz]} scale={[sx, sy, sz]} castShadow={cast} receiveShadow />
  );
}

function Piece({ piece, mats, geo }: { piece: FurniturePiece; mats: Mats; geo: ReturnType<typeof useGeometries> }) {
  const { w, d, h } = piece.size;
  const e = piece.elevationM ?? 0;
  const mat = mats[piece.materialId ?? 'wood'];
  const B = geo.box;
  const C = geo.cyl;
  const S = geo.sphere;
  const parts: React.ReactNode[] = [];
  const push = (key: string, node: React.ReactNode) => parts.push(<group key={key}>{node}</group>);

  switch (piece.kind) {
    case 'counter': {
      const topT = 0.04;
      push('carcass', <Part g={B} m={mat} px={0} py={e + (h - topT) / 2} pz={0} sx={w} sy={h - topT} sz={d} />);
      push('top', <Part g={B} m={mats.stoneTop} px={0} py={e + h - topT / 2} pz={0} sx={w + 0.02} sy={topT} sz={d + 0.02} />);
      break;
    }
    case 'appliance': {
      push('body', <Part g={B} m={mats.appliance} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} />);
      push('front', <Part g={B} m={mats.metal} px={0} py={e + h / 2} pz={d / 2 + 0.005} sx={w * 0.92} sy={h * 0.9} sz={0.012} />);
      break;
    }
    case 'sofa':
    case 'armchair': {
      const armW = piece.kind === 'sofa' ? 0.22 : 0.16;
      const seatH = h * 0.42;
      push('base', <Part g={B} m={mat} px={0} py={e + seatH / 2} pz={0} sx={w} sy={seatH} sz={d} />);
      push('back', <Part g={B} m={mat} px={0} py={e + h / 2} pz={-d / 2 + 0.11} sx={w} sy={h} sz={0.22} />);
      push('armL', <Part g={B} m={mat} px={-w / 2 + armW / 2} py={e + h * 0.62} pz={0.02} sx={armW} sy={h * 0.42} sz={d * 0.92} />);
      push('armR', <Part g={B} m={mat} px={w / 2 - armW / 2} py={e + h * 0.62} pz={0.02} sx={armW} sy={h * 0.42} sz={d * 0.92} />);
      push('cushion', <Part g={B} m={mat} px={0} py={e + seatH + 0.06} pz={0.05} sx={w - armW * 2.2} sy={0.13} sz={d * 0.72} />);
      break;
    }
    case 'bed': {
      const baseH = 0.28;
      push('base', <Part g={B} m={mat} px={0} py={e + baseH / 2} pz={0} sx={w} sy={baseH} sz={d} />);
      push('mattress', <Part g={B} m={mats.fabric} px={0} py={e + baseH + 0.11} pz={0} sx={w - 0.04} sy={0.22} sz={d - 0.04} />);
      push('head', <Part g={B} m={mat} px={0} py={e + 0.55} pz={-d / 2 + 0.05} sx={w + 0.06} sy={1.1} sz={0.1} />);
      push('pillowL', <Part g={B} m={mats.fabric} px={-w * 0.22} py={e + baseH + 0.28} pz={-d / 2 + 0.32} sx={w * 0.38} sy={0.13} sz={0.34} />);
      push('pillowR', <Part g={B} m={mats.fabric} px={w * 0.22} py={e + baseH + 0.28} pz={-d / 2 + 0.32} sx={w * 0.38} sy={0.13} sz={0.34} />);
      push('throw', <Part g={B} m={mats.fabricDark} px={0} py={e + baseH + 0.23} pz={d * 0.28} sx={w - 0.04} sy={0.05} sz={d * 0.32} />);
      break;
    }
    case 'table': {
      const topT = 0.05;
      const legI = 0.07;
      push('top', <Part g={B} m={mat} px={0} py={e + h - topT / 2} pz={0} sx={w} sy={topT} sz={d} />);
      for (const [i, sx] of [-1, 1].entries()) {
        for (const [j, sz] of [-1, 1].entries()) {
          push(`leg${i}${j}`, (
            <Part g={B} m={mats.woodDark} px={sx * (w / 2 - legI)} py={e + (h - topT) / 2} pz={sz * (d / 2 - legI)}
              sx={0.06} sy={h - topT} sz={0.06} />
          ));
        }
      }
      break;
    }
    case 'chair':
    case 'stool': {
      const seatY = 0.45;
      push('seat', <Part g={B} m={mats.fabric} px={0} py={e + seatY} pz={0} sx={w} sy={0.07} sz={d} />);
      if (piece.kind === 'chair') {
        push('back', <Part g={B} m={mats.wood} px={0} py={e + seatY + (h - seatY) / 2} pz={-d / 2 + 0.04} sx={w} sy={h - seatY} sz={0.06} />);
      }
      for (const [i, sx] of [-1, 1].entries()) {
        for (const [j, sz] of [-1, 1].entries()) {
          push(`leg${i}${j}`, (
            <Part g={B} m={mats.woodDark} px={sx * (w / 2 - 0.05)} py={e + seatY / 2} pz={sz * (d / 2 - 0.05)}
              sx={0.045} sy={seatY} sz={0.045} />
          ));
        }
      }
      break;
    }
    case 'bench': {
      push('top', <Part g={B} m={mat} px={0} py={e + h - 0.06} pz={0} sx={w} sy={0.12} sz={d} />);
      push('legL', <Part g={B} m={mats.woodDark} px={-w / 2 + 0.08} py={e + (h - 0.12) / 2} pz={0} sx={0.07} sy={h - 0.12} sz={d * 0.8} />);
      push('legR', <Part g={B} m={mats.woodDark} px={w / 2 - 0.08} py={e + (h - 0.12) / 2} pz={0} sx={0.07} sy={h - 0.12} sz={d * 0.8} />);
      break;
    }
    case 'rug':
      push('rug', <Part g={B} m={mats.rug} px={0} py={0.012} pz={0} sx={w} sy={0.024} sz={d} cast={false} />);
      break;
    case 'panel':
      push('panel', <Part g={B} m={mat} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} cast={false} />);
      break;
    case 'tv':
      push('screen', <Part g={B} m={mats.screen} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={Math.max(d, 0.04)} cast={false} />);
      break;
    case 'mirror':
      push('frame', <Part g={B} m={mats.metalWarm} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={Math.max(d, 0.03)} cast={false} />);
      push('glass', <Part g={B} m={mats.glass} px={0} py={e + h / 2} pz={0.012} sx={w - 0.06} sy={h - 0.06} sz={0.01} cast={false} />);
      break;
    case 'curtain':
      push('curtain', <Part g={B} m={mats.fabric} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} cast={false} />);
      break;
    case 'showerGlass':
      push('glass', <Part g={B} m={mats.glass} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={Math.max(d, 0.02)} cast={false} />);
      break;
    case 'floorLamp':
      push('base', <Part g={C} m={mats.metalWarm} px={0} py={e + 0.02} pz={0} sx={w * 0.8} sy={0.04} sz={w * 0.8} />);
      push('pole', <Part g={C} m={mats.metalWarm} px={0} py={e + h * 0.5} pz={0} sx={0.035} sy={h} sz={0.035} />);
      push('shade', <Part g={C} m={mats.lampShade} px={0} py={e + h - 0.1} pz={0} sx={w} sy={0.24} sz={w} cast={false} />);
      break;
    case 'tableLamp':
      push('base', <Part g={C} m={mats.ceramic} px={0} py={e + h * 0.25} pz={0} sx={w * 0.55} sy={h * 0.5} sz={w * 0.55} />);
      push('shade', <Part g={C} m={mats.lampShade} px={0} py={e + h * 0.78} pz={0} sx={w} sy={h * 0.45} sz={w} cast={false} />);
      break;
    case 'pendant':
      push('cord', <Part g={C} m={mats.metal} px={0} py={e + h + 0.18} pz={0} sx={0.012} sy={0.36} sz={0.012} cast={false} />);
      push('shade', <Part g={C} m={mats.lampShade} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} cast={false} />);
      break;
    case 'wallLight':
      push('body', <Part g={B} m={mats.metalWarm} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} cast={false} />);
      push('glow', <Part g={B} m={mats.lampShade} px={0} py={e + h / 2} pz={d / 2 + 0.006} sx={w * 0.7} sy={h * 0.7} sz={0.012} cast={false} />);
      break;
    case 'plant':
      push('pot', <Part g={C} m={mats.ceramic} px={0} py={e + h * 0.16} pz={0} sx={w * 0.75} sy={h * 0.32} sz={w * 0.75} />);
      push('f1', <Part g={S} m={mats.plant} px={0} py={e + h * 0.62} pz={0} sx={w * 0.95} sy={h * 0.5} sz={w * 0.95} />);
      push('f2', <Part g={S} m={mats.plant} px={w * 0.18} py={e + h * 0.85} pz={-w * 0.12} sx={w * 0.55} sy={h * 0.3} sz={w * 0.55} />);
      break;
    case 'vase':
      push('body', <Part g={C} m={mats.ceramic} px={0} py={e + h * 0.4} pz={0} sx={w} sy={h * 0.8} sz={d} />);
      push('neck', <Part g={C} m={mats.ceramic} px={0} py={e + h * 0.88} pz={0} sx={w * 0.45} sy={h * 0.25} sz={d * 0.45} />);
      break;
    case 'books': {
      const n = 4;
      for (let i = 0; i < n; i += 1) {
        const bh = h * (0.78 + ((i * 37) % 23) / 100);
        push(`b${i}`, (
          <Part g={B} m={i % 2 ? mats.fabricDark : mats.leather}
            px={-w / 2 + (w / n) * (i + 0.5)} py={e + bh / 2} pz={0} sx={w / n - 0.012} sy={bh} sz={d} />
        ));
      }
      break;
    }
    case 'shelf':
      push('shelf', <Part g={B} m={mats.wood} px={0} py={e + h / 2} pz={0} sx={w} sy={Math.max(h, 0.04)} sz={d} cast={false} />);
      break;
    case 'basin':
      push('bowl', <Part g={B} m={mats.ceramic} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} />);
      push('tap', <Part g={C} m={mats.metalWarm} px={0} py={e + h + 0.11} pz={-d / 2 + 0.05} sx={0.03} sy={0.22} sz={0.03} />);
      break;
    case 'toilet':
      push('pedestal', <Part g={B} m={mats.ceramic} px={0} py={e + 0.2} pz={0.04} sx={w * 0.6} sy={0.4} sz={d * 0.5} />);
      push('bowl', <Part g={B} m={mats.ceramic} px={0} py={e + 0.42} pz={0.06} sx={w} sy={0.14} sz={d * 0.72} />);
      push('cistern', <Part g={B} m={mats.ceramic} px={0} py={e + h * 0.55} pz={-d / 2 + 0.08} sx={w * 0.92} sy={h * 0.85} sz={0.16} />);
      break;
    case 'towels':
      push('t1', <Part g={B} m={mats.fabric} px={0} py={e + h * 0.25} pz={0} sx={w} sy={h * 0.45} sz={d} />);
      push('t2', <Part g={B} m={mats.fabricDark} px={0} py={e + h * 0.72} pz={0} sx={w * 0.92} sy={h * 0.4} sz={d * 0.92} />);
      break;
    case 'handrail':
      push('rail', <Part g={B} m={mats.metal} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} cast={false} />);
      break;
    case 'box':
    default:
      push('body', <Part g={B} m={mat} px={0} py={e + h / 2} pz={0} sx={w} sy={h} sz={d} />);
      break;
  }

  return (
    <group position={[piece.position.x, 0, piece.position.z]} rotation={[0, piece.rotationRad ?? 0, 0]}>
      {parts}
    </group>
  );
}

export function Furniture({ variantId }: { variantId: string }) {
  const mats = useMaterials(variantId);
  const geo = useGeometries();
  const [lowPower, setLowPower] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setLowPower(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => () => {
    Object.values(mats).forEach((m) => m.dispose());
    Object.values(geo).forEach((g) => g.dispose());
  }, [mats, geo]);

  const visible = useMemo(
    () => (lowPower ? furniture.filter((f) => !f.detail) : furniture),
    [lowPower],
  );

  return (
    <group name="furniture">
      {visible.map((piece) => (
        <Piece key={piece.id} piece={piece} mats={mats} geo={geo} />
      ))}
    </group>
  );
}

export const blockingFurniture = furniture.filter(isBlocking);
