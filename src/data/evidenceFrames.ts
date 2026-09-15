/**
 * Maps each room to its most representative extracted walkthrough frame
 * (see analysis/house-evidence.json:timeline for the source timestamps and
 * confidence). Used by the evidence section, room stories, before/concept
 * comparisons, and the 2D/WebGL-fallback room cards.
 */

import type { RoomId } from '@/lib/types';

export interface EvidenceFrame {
  path: string;
  timestamp: string;
  confidence: 'high' | 'medium-high' | 'medium' | 'low';
}

export const roomEvidenceFrame: Record<RoomId, EvidenceFrame> = {
  stair_landing: { path: '/evidence/frames/00-00-03_exterior-stair-landing.jpg', timestamp: '00:00-00:06', confidence: 'high' },
  balcony_service: { path: '/evidence/frames/00-00-03_exterior-stair-landing.jpg', timestamp: '00:00-00:06', confidence: 'medium' },
  entry_hall: { path: '/evidence/frames/00-00-09_entry-threshold.jpg', timestamp: '00:06-00:12', confidence: 'medium-high' },
  living: { path: '/evidence/frames/00-00-16_open-social-zone.jpg', timestamp: '00:12-00:20', confidence: 'high' },
  kitchen: { path: '/evidence/frames/00-00-16_open-social-zone.jpg', timestamp: '00:12-00:20', confidence: 'high' },
  dining: { path: '/evidence/frames/00-00-16_open-social-zone.jpg', timestamp: '00:12-00:20', confidence: 'high' },
  terrace_social: { path: '/evidence/frames/00-00-22_covered-terrace.jpg', timestamp: '00:20-00:25', confidence: 'medium' },
  mamad: { path: '/evidence/frames/00-00-40_bedroom-or-mamad.jpg', timestamp: '00:38-00:42', confidence: 'medium' },
  twin_bed: { path: '/evidence/frames/00-00-44_second-bedroom.jpg', timestamp: '00:42-00:47', confidence: 'medium-high' },
  hall_south: { path: '/evidence/frames/00-00-35_bedroom-bathroom-junction.jpg', timestamp: '00:33-00:38', confidence: 'high' },
  bathroom_main: { path: '/evidence/frames/00-00-29_hall-wetroom.jpg', timestamp: '00:25-00:33', confidence: 'high' },
  bathroom_ensuite: { path: '/evidence/frames/00-00-49_second-shower.jpg', timestamp: '00:47-00:51', confidence: 'high' },
  wc_guest: { path: '/evidence/frames/00-00-29_hall-wetroom.jpg', timestamp: '00:25-00:33', confidence: 'low' },
  parents_bed: { path: '/evidence/frames/00-00-54_third-bedroom-mamad.jpg', timestamp: '00:51-00:57', confidence: 'medium' },
};
