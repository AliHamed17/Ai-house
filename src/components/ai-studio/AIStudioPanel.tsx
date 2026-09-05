'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { houseModel } from '@/data/house';
import { materialVariants } from '@/data/materials';
import { roomEvidenceFrame } from '@/data/evidenceFrames';
import type { GenerationJob, GenerationOutputType, RoomId } from '@/lib/types';

const VIDEO_CAPABLE_ROOMS = new Set<RoomId>(['stair_landing', 'living', 'kitchen', 'dining', 'mamad', 'twin_bed', 'parents_bed', 'bathroom_main']);

const STATUS_COPY: Record<GenerationJob['status'], string> = {
  queued: 'Queued…',
  in_progress: 'Generating…',
  completed: 'Complete',
  failed: 'Failed',
  moderated: 'Moderated',
};

function conceptImagePath(roomId: RoomId): string | null {
  return VIDEO_CAPABLE_ROOMS.has(roomId) ? `/generated/concepts/${roomId}.svg` : null;
}

export function AIStudioPanel() {
  const [roomId, setRoomId] = useState<RoomId>('living');
  const [styleVariant, setStyleVariant] = useState(materialVariants[0].id);
  const [outputType, setOutputType] = useState<GenerationOutputType>('image');
  const [editInstruction, setEditInstruction] = useState('');
  const [simulate, setSimulate] = useState<'success' | 'failure' | 'moderated'>('success');
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [approved, setApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const videoAvailableForRoom = VIDEO_CAPABLE_ROOMS.has(roomId);

  function handleRoomChange(nextRoomId: RoomId) {
    setRoomId(nextRoomId);
    if (!VIDEO_CAPABLE_ROOMS.has(nextRoomId) && outputType === 'video') setOutputType('image');
  }

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    setJob(null);
    setApproved(false);
    if (pollRef.current) clearInterval(pollRef.current);

    const endpoint = outputType === 'image' ? '/api/nano-banana/generate' : '/api/higgsfield/generate';
    const sourceAssetPath = outputType === 'image' ? roomEvidenceFrame[roomId]?.path : conceptImagePath(roomId);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          styleVariant,
          sourceAssetPath,
          editInstruction: editInstruction || undefined,
          simulate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Generation request failed.');
        setSubmitting(false);
        return;
      }
      setDemoMode(Boolean(data.demoMode));

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/generation/status/${data.jobId}`);
          const statusData = (await statusRes.json()) as GenerationJob & { error?: string };
          if (!statusRes.ok) {
            setError(statusData.error ?? 'Could not fetch generation status.');
            if (pollRef.current) clearInterval(pollRef.current);
            setSubmitting(false);
            return;
          }
          setJob(statusData);
          if (statusData.status === 'completed' || statusData.status === 'failed' || statusData.status === 'moderated') {
            if (pollRef.current) clearInterval(pollRef.current);
            setSubmitting(false);
          }
        } catch {
          setError('Lost connection while checking generation status.');
          if (pollRef.current) clearInterval(pollRef.current);
          setSubmitting(false);
        }
      }, 1000);
    } catch {
      setError('Could not reach the generation service.');
      setSubmitting(false);
    }
  }

  const activeRoom = houseModel.rooms.find((r) => r.id === roomId)!;

  return (
    <div className="rounded-3xl border border-limestone/60 bg-ivory p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl text-charcoal">AI Design Studio</h3>
        {demoMode !== null && (
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${demoMode ? 'bg-olive/15 text-olive' : 'bg-bronze/15 text-bronze'}`}>
            {demoMode ? 'Demo mode — no API credentials' : 'Live provider'}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-charcoal/70">
        Select a room, choose an output, and generate. Nano Banana produces photorealistic room concepts; Higgsfield
        animates an approved concept still into a short cinematic clip.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-charcoal/80">Room</span>
          <select
            value={roomId}
            onChange={(e) => handleRoomChange(e.target.value as RoomId)}
            className="rounded-xl border border-limestone/60 bg-ivory px-3 py-2 text-charcoal"
          >
            {houseModel.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.hotspotLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-charcoal/80">Style variation</span>
          <select
            value={styleVariant}
            onChange={(e) => setStyleVariant(e.target.value)}
            className="rounded-xl border border-limestone/60 bg-ivory px-3 py-2 text-charcoal"
          >
            {materialVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-semibold text-charcoal/80">Output</legend>
          <div className="flex overflow-hidden rounded-xl border border-limestone/60">
            <button
              type="button"
              onClick={() => setOutputType('image')}
              className={`flex-1 px-3 py-2 text-xs font-semibold ${outputType === 'image' ? 'bg-bronze text-ivory' : 'bg-ivory text-charcoal'}`}
            >
              Photorealistic image (Nano Banana)
            </button>
            <button
              type="button"
              onClick={() => videoAvailableForRoom && setOutputType('video')}
              disabled={!videoAvailableForRoom}
              className={`flex-1 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${outputType === 'video' ? 'bg-bronze text-ivory' : 'bg-ivory text-charcoal'}`}
              title={videoAvailableForRoom ? undefined : 'Cinematic clips are limited to the principal rooms.'}
            >
              Cinematic clip (Higgsfield)
            </button>
          </div>
        </fieldset>

        {demoMode && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-charcoal/80">Demo: simulate outcome</span>
            <select
              value={simulate}
              onChange={(e) => setSimulate(e.target.value as typeof simulate)}
              className="rounded-xl border border-limestone/60 bg-ivory px-3 py-2 text-charcoal"
            >
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="moderated">Moderated</option>
            </select>
          </label>
        )}

        {outputType === 'image' && (
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-semibold text-charcoal/80">Optional refinement instruction</span>
            <input
              type="text"
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              placeholder="e.g. warm up the pendant light, swap the rug to a darker weave"
              className="rounded-xl border border-limestone/60 bg-ivory px-3 py-2 text-charcoal"
              maxLength={200}
            />
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={submitting}
        className="mt-5 w-full rounded-full bg-bronze px-4 py-3 text-sm font-semibold text-ivory shadow disabled:opacity-60 md:w-auto"
      >
        {submitting ? 'Working…' : `Generate ${outputType === 'image' ? 'concept image' : 'cinematic clip'}`}
      </button>
      <p className="mt-2 text-xs text-charcoal/50">
        {outputType === 'video'
          ? 'Uses the approved concept still as its source — this triggers a real paid job when live credentials are configured.'
          : `Uses ${roomEvidenceFrame[roomId]?.path.split('/').pop()} as the architectural reference frame for ${activeRoom.hotspotLabel}.`}
      </p>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {job && (
        <div className="mt-6 rounded-2xl border border-limestone/50 bg-ivory p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-charcoal">{STATUS_COPY[job.status]}</span>
            {job.status !== 'completed' && job.status !== 'failed' && job.status !== 'moderated' && (
              <span className="h-3 w-3 animate-pulse rounded-full bg-bronze" aria-hidden />
            )}
          </div>

          {job.status === 'completed' && job.resultUrl && (
            <div className="mt-3">
              <div className={`relative h-64 w-full overflow-hidden rounded-xl bg-limestone/30 ${job.outputType === 'video' ? 'animate-[kenburns_8s_ease-in-out_infinite_alternate]' : ''}`}>
                <Image
                  src={job.resultUrl}
                  alt={`Generated concept for ${activeRoom.hotspotLabel}`}
                  fill
                  sizes="600px"
                  className="object-cover"
                  unoptimized={job.resultUrl.startsWith('data:') || job.resultUrl.endsWith('.svg')}
                />
              </div>
              {job.outputType === 'video' && (
                <p className="mt-2 text-xs italic text-charcoal/50">
                  Demo mode simulates the cinematic move with a gentle pan over the approved still; a live Higgsfield job
                  returns an actual video clip here instead.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setApproved(true)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${approved ? 'bg-olive text-ivory' : 'border border-limestone/60 text-charcoal hover:bg-limestone/30'}`}
                >
                  {approved ? '✓ Approved' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => setJob(null)}
                  className="rounded-full border border-limestone/60 px-4 py-2 text-xs font-semibold text-charcoal hover:bg-limestone/30"
                >
                  Reject
                </button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-charcoal/50">
                <div>
                  <dt className="inline font-semibold">Model: </dt>
                  <dd className="inline">{job.meta.model}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Variant: </dt>
                  <dd className="inline">{job.meta.styleVariant}</dd>
                </div>
              </dl>
            </div>
          )}

          {(job.status === 'failed' || job.status === 'moderated') && (
            <p className="mt-2 text-sm text-charcoal/70">{job.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
