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
  stair_landing: { path: '/evidence/frames/00-00-03_exterior-stair-landing.jpg', timestamp: '00:03', confidence: 'high' },
  balcony_service: { path: '/evidence/frames/00-00-03_exterior-stair-landing.jpg', timestamp: '00:03', confidence: 'medium' },
  entry_hall: { path: '/evidence/frames/00-00-10_entry-threshold.jpg', timestamp: '00:10', confidence: 'medium-high' },
  living: { path: '/evidence/frames/00-00-14_open-social-zone.jpg', timestamp: '00:14', confidence: 'high' },
  kitchen: { path: '/evidence/frames/00-01-00_return-social-zone.jpg', timestamp: '01:00', confidence: 'medium' },
  dining: { path: '/evidence/frames/00-01-00_return-social-zone.jpg', timestamp: '01:00', confidence: 'high' },
  terrace_social: { path: '/evidence/frames/00-00-21_covered-terrace.jpg', timestamp: '00:21', confidence: 'medium' },
  mamad: { path: '/evidence/frames/00-00-40_bedroom-or-mamad.jpg', timestamp: '00:40', confidence: 'medium' },
  twin_bed: { path: '/evidence/frames/00-00-43_second-bedroom.jpg', timestamp: '00:43', confidence: 'medium-high' },
  hall_south: { path: '/evidence/frames/00-00-34_bedroom-bathroom-junction.jpg', timestamp: '00:34', confidence: 'high' },
  bathroom_main: { path: '/evidence/frames/00-00-26_hall-wetroom.jpg', timestamp: '00:26', confidence: 'high' },
  bathroom_ensuite: { path: '/evidence/frames/00-00-50_second-shower.jpg', timestamp: '00:50', confidence: 'medium' },
  wc_guest: { path: '/evidence/frames/00-00-26_hall-wetroom.jpg', timestamp: '00:26', confidence: 'low' },
  parents_bed: { path: '/evidence/frames/00-00-55_third-bedroom.jpg', timestamp: '00:55', confidence: 'medium' },
};
