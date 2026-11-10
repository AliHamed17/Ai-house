import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { houseModel } from '@/data/house';
import { mockProvider } from '@/lib/ai/mockProvider.server';
import { encodeJobId } from '@/lib/ai/jobId';

const conceptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/generated/concepts');

describe('demo-mode concept placeholders', () => {
  it('ships a placeholder SVG for every selectable room (no broken preview)', () => {
    for (const room of houseModel.rooms) {
      const file = path.join(conceptsDir, `${room.id}.svg`);
      expect(existsSync(file), `missing placeholder for room "${room.id}"`).toBe(true);
    }
  });

  it("mock completion points at a concept asset that exists, even for a previously-unmapped room", async () => {
    // entry_hall was one of the rooms with no placeholder before the fix.
    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'entry_hall',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'test',
      createdAt: Date.now() - 5000, // old enough to be "completed"
      simulate: 'success',
    });
    const job = await mockProvider.status(jobId);
    expect(job.status).toBe('completed');
    expect(job.resultUrl).toBe('/generated/concepts/entry_hall.svg');
    expect(existsSync(path.join(conceptsDir, 'entry_hall.svg'))).toBe(true);
  });
});
