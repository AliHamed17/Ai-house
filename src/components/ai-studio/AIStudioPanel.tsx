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

// A completed video job whose result is a real playable clip (a live
// Higgsfield URL), as opposed to the demo mode's still (its own placeholder
// SVG, or — when Nano Banana was live — the actual approved concept image)
// that we animate with a CSS pan instead. Checking job.provider rather than
// sniffing the resultUrl's shape is what lets the mock provider return
// either kind of still and always get the pan treatment: a mock job is
// never a real video regardless of what its resultUrl looks like.
function isPlayableVideo(job: GenerationJob): boolean {
  return job.outputType === 'video' && job.provider !== 'mock' && Boolean(job.resultUrl);
}

interface LiveStatus {
  nanoBanana: boolean;
  higgsfield: boolean;
}

export function AIStudioPanel() {
  const [roomId, setRoomId] = useState<RoomId>('living');
  const [styleVariant, setStyleVariant] = useState(materialVariants[0].id);
  const [outputType, setOutputType] = useState<GenerationOutputType>('image');
  const [editInstruction, setEditInstruction] = useState('');
  const [simulate, setSimulate] = useState<'success' | 'failure' | 'moderated'>('success');
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  // True only once a genuine (non-fallback) /api/generation/mode response has
  // been received — see the probe effect below. liveVideoNeedsApproval is
  // gated on this rather than on liveStatus.higgsfield directly, so neither
  // failure mode is possible: a fallback "assume live" guess (kept for the
  // cost-confirmation banner, which must fail safe) can never relax the
  // approval requirement for an actually-live deployment, and it can never
  // permanently lock out a genuinely-demo deployment's cinematic-clip path
  // either, since the gate only tightens (never loosens) while unconfirmed.
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [modeProbeRetryNonce, setModeProbeRetryNonce] = useState(0);
  const [confirmingLiveRun, setConfirmingLiveRun] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [approved, setApproved] = useState(false);
  const [approvedSource, setApprovedSource] = useState<{ path: string; roomId: RoomId } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A job whose status-polling gave up after repeated transient failures
  // (see startPolling below) rather than reaching a terminal state. The
  // provider-side job may still be running (and already billed), so its id
  // is kept here — not just dropped — until the visitor resumes checking on
  // it or deliberately starts a fresh generation.
  const [recoverableJobId, setRecoverableJobId] = useState<string | null>(null);
  // A submission whose HTTP response never reached us (a dropped connection,
  // a client-side timeout) — the server may have already accepted, run, and
  // billed it. Holds exactly what's needed to retry the identical request:
  // its idempotencyKey lets the server recognize the retry and return the
  // job it already created instead of starting a duplicate one.
  const [recoverableSubmission, setRecoverableSubmission] = useState<{ endpoint: string; body: Record<string, unknown> } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every new generation; each in-flight fetch captures the value and
  // bails if a newer run has superseded it, so a slow/out-of-order status
  // response can never overwrite the current job's state.
  const pollTokenRef = useRef(0);

  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  // Sync which providers are live (billed) vs. demo, so the UI can require
  // confirmation before a paid run instead of only learning the mode after
  // the first submission already fired it. /api/generation/mode is a
  // same-origin route with no external I/O, so a real deployment (live or
  // demo) almost always resolves it well within this retry window; it
  // retries persistently on failure rather than giving up after one attempt,
  // and only falls back to a display-only "assume live" guess once that
  // window is exhausted. modeProbeRetryNonce re-arms this effect for one
  // more attempt — bumped by the manual "Check again" action rendered next
  // to the video-approval notice below — so an unresolved provider mode is
  // never a permanent dead end even in that fallback case.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const MAX_AUTO_RETRIES = 4;
    const RETRY_DELAY_MS = 1500;

    const scheduleRetryOrFallback = () => {
      attempt += 1;
      if (attempt <= MAX_AUTO_RETRIES) {
        timeoutId = setTimeout(probe, RETRY_DELAY_MS);
        return;
      }
      // Display/cost-confirmation purposes only (never silently assume demo,
      // which could let a live submission through unconfirmed). modeConfirmed
      // stays false, so liveVideoNeedsApproval keeps requiring an approved
      // image until a genuine response arrives.
      setLiveStatus({ nanoBanana: true, higgsfield: true });
    };

    function probe() {
      fetch('/api/generation/mode')
        .then((res) => (res.ok ? (res.json() as Promise<LiveStatus>) : null))
        .then((data) => {
          if (cancelled) return;
          if (data) {
            setLiveStatus(data);
            setModeConfirmed(true);
          } else scheduleRetryOrFallback();
        })
        .catch(() => {
          if (!cancelled) scheduleRetryOrFallback();
        });
    }

    probe();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [modeProbeRetryNonce]);

  const videoAvailableForRoom = VIDEO_CAPABLE_ROOMS.has(roomId);
  const isLiveForOutput = outputType === 'image' ? liveStatus?.nanoBanana : liveStatus?.higgsfield;
  const approvedForCurrentRoom = approvedSource !== null && approvedSource.roomId === roomId;
  // A live (billed) Higgsfield clip must animate a real approved concept, not
  // the placeholder still. Default to requiring approval whenever the mode
  // isn't genuinely confirmed yet — never relax this on an unconfirmed
  // fallback guess — and only relax it once a genuine response confirms
  // Higgsfield is actually in demo mode for this deployment.
  const liveVideoNeedsApproval = outputType === 'video' && !approvedForCurrentRoom && (!modeConfirmed || Boolean(liveStatus?.higgsfield));
  // Either kind of unresolved job (a submission whose response was lost, or
  // one whose status-polling gave up) must block both a new submission and
  // a room/output change — changing context out from under an unresolved
  // job would let its eventual result get displayed, approved, or billed
  // against the wrong room.
  const hasUnresolvedJob = recoverableJobId !== null || recoverableSubmission !== null;

  function handleRoomChange(nextRoomId: RoomId) {
    // The selector is disabled in this state too; this guard is defense in
    // depth so an unresolved job's eventual result can never be displayed,
    // approved, or billed against a room switched to after it was submitted.
    if (hasUnresolvedJob) return;
    setRoomId(nextRoomId);
    if (!VIDEO_CAPABLE_ROOMS.has(nextRoomId) && outputType === 'video') setOutputType('image');
    setConfirmingLiveRun(false);
    // The room selector is disabled while a generation is in flight, so no
    // active (possibly billed) job is ever discarded here — just clear the
    // shown result and its approval, which belong to the room being left.
    setJob(null);
    setError(null);
    setApproved(false);
    setApprovedSource(null);
  }

  function handleOutputTypeChange(nextOutputType: GenerationOutputType) {
    if (hasUnresolvedJob) return;
    if (nextOutputType === 'video' && !videoAvailableForRoom) return;
    setOutputType(nextOutputType);
    setConfirmingLiveRun(false);
  }

  function handleGenerateClick() {
    if (liveStatus === null) return;
    if (liveVideoNeedsApproval) return;
    // Never start a new (possibly billed) job while a previous one's fate is
    // still unknown — resume checking on it instead of risking a duplicate.
    if (hasUnresolvedJob) return;
    if (isLiveForOutput && !confirmingLiveRun) {
      setConfirmingLiveRun(true);
      return;
    }
    setConfirmingLiveRun(false);
    void handleGenerate();
  }

  // Self-scheduling poll: the next status request is only queued after the
  // current one resolves, so a slow live poll never spawns overlapping
  // requests, and the token check drops any stale/out-of-order response. A
  // live job keeps running provider-side, so a transient status error (a
  // brief 502 or dropped connection) is retried a few times with backoff
  // rather than abandoning a job that may already be billed — and if every
  // retry is exhausted, the job id is kept (recoverableJobId) rather than
  // lost, so "resume checking" can pick the same job back up instead of the
  // only remaining option being to start a new, possibly duplicate, job.
  // Shared between a fresh submission (handleGenerate) and resuming an
  // unresolved one (handleResumeStatusCheck) so both get identical
  // retry/backoff behavior from one place.
  function startPolling(jobId: string, token: number) {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const MAX_TRANSIENT_FAILURES = 5;
    let transientFailures = 0;
    const retryOrFail = (fallbackMessage: string, serverMessage?: string) => {
      transientFailures += 1;
      if (transientFailures > MAX_TRANSIENT_FAILURES) {
        setError(serverMessage ?? fallbackMessage);
        setSubmitting(false);
        setRecoverableJobId(jobId);
        return;
      }
      pollTimerRef.current = setTimeout(poll, 1500);
    };
    const poll = async () => {
      if (token !== pollTokenRef.current) return;
      try {
        const statusRes = await fetch(`/api/generation/status/${jobId}`);
        const statusData = (await statusRes.json().catch(() => ({}))) as GenerationJob & { error?: string };
        if (token !== pollTokenRef.current) return;
        if (!statusRes.ok) {
          retryOrFail('Could not fetch generation status.', statusData.error);
          return;
        }
        transientFailures = 0;
        setJob(statusData);
        if (statusData.status === 'completed' || statusData.status === 'failed' || statusData.status === 'moderated') {
          setSubmitting(false);
          setRecoverableJobId(null);
          return;
        }
        pollTimerRef.current = setTimeout(poll, 1000);
      } catch {
        if (token !== pollTokenRef.current) return;
        retryOrFail('Lost connection while checking generation status.');
      }
    };
    void poll();
  }

  function handleResumeStatusCheck() {
    if (!recoverableJobId) return;
    const jobId = recoverableJobId;
    const token = ++pollTokenRef.current;
    setSubmitting(true);
    setError(null);
    // Cleared eagerly; startPolling re-sets it if this attempt also
    // exhausts its retries, so the banner never shows a stale/wrong state
    // while a fresh attempt is in flight.
    setRecoverableJobId(null);
    startPolling(jobId, token);
  }

  // Submits one generation request. On a definite failure (a non-OK HTTP
  // response, which the server has already resolved one way or another) it
  // just reports the error. On a network-level failure — the fetch itself
  // throwing, so we cannot tell "never reached the server" apart from
  // "reached the server, which ran and billed it, but the response never
  // came back" — it does NOT tell the visitor it's safe to just try again.
  // The exact request (endpoint, body, and its idempotencyKey) is kept as
  // recoverableSubmission so a retry reuses the same key: the server
  // recognizes it and returns the job it already created rather than
  // starting and billing a second one. Shared between a fresh submission
  // (handleGenerate) and resuming one (handleResumeSubmission).
  async function submitOnce(endpoint: string, body: Record<string, unknown>, token: number): Promise<string | null> {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (token !== pollTokenRef.current) return null; // a newer run superseded this one
      if (!res.ok) {
        setError(data.error ?? 'Generation request failed.');
        setSubmitting(false);
        return null;
      }
      return data.jobId as string;
    } catch {
      if (token !== pollTokenRef.current) return null;
      setError('Could not reach the generation service. If it was already submitted, Resume below reuses the exact same request instead of starting a new one.');
      setSubmitting(false);
      setRecoverableSubmission({ endpoint, body });
      return null;
    }
  }

  function handleResumeSubmission() {
    if (!recoverableSubmission) return;
    const { endpoint, body } = recoverableSubmission;
    const token = ++pollTokenRef.current;
    setSubmitting(true);
    setError(null);
    setRecoverableSubmission(null);
    void (async () => {
      const jobId = await submitOnce(endpoint, body, token);
      if (jobId) startPolling(jobId, token);
    })();
  }

  async function handleGenerate() {
    const token = ++pollTokenRef.current;
    setSubmitting(true);
    setError(null);
    setJob(null);
    setApproved(false);
    // A deliberate new submission is the one case where abandoning a prior
    // unresolved job is the visitor's own informed choice, not silent loss.
    setRecoverableJobId(null);
    setRecoverableSubmission(null);

    const endpoint = outputType === 'image' ? '/api/nano-banana/generate' : '/api/higgsfield/generate';
    // Once a concept for THIS room has been approved, both a refinement and a
    // cinematic clip operate on that approved image; before then, an image
    // starts from the room's evidence frame and a clip from its concept still.
    const approvedForRoom = approvedSource && approvedSource.roomId === roomId ? approvedSource.path : undefined;
    const sourceAssetPath = approvedForRoom ?? (outputType === 'image' ? roomEvidenceFrame[roomId]?.path : conceptImagePath(roomId));
    const body = {
      roomId,
      styleVariant,
      sourceAssetPath,
      editInstruction: editInstruction || undefined,
      simulate,
      idempotencyKey: crypto.randomUUID(),
    };

    const jobId = await submitOnce(endpoint, body, token);
    if (jobId) startPolling(jobId, token);
  }

  const activeRoom = houseModel.rooms.find((r) => r.id === roomId)!;

  return (
    <div className="rounded-3xl border border-limestone/60 bg-ivory p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl text-charcoal">AI Design Studio</h3>
        {liveStatus !== null && (
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${isLiveForOutput ? 'bg-bronze/15 text-bronze' : 'bg-olive/15 text-olive'}`}>
            {isLiveForOutput ? 'Live provider' : 'Demo mode — no API credentials'}
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
            disabled={submitting || hasUnresolvedJob}
            className="rounded-xl border border-limestone/60 bg-ivory px-3 py-2 text-charcoal disabled:cursor-not-allowed disabled:opacity-60"
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
              onClick={() => handleOutputTypeChange('image')}
              disabled={submitting || hasUnresolvedJob}
              className={`flex-1 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${outputType === 'image' ? 'bg-bronze text-ivory' : 'bg-ivory text-charcoal'}`}
            >
              Photorealistic image (Nano Banana)
            </button>
            <button
              type="button"
              onClick={() => handleOutputTypeChange('video')}
              disabled={submitting || hasUnresolvedJob || !videoAvailableForRoom}
              className={`flex-1 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${outputType === 'video' ? 'bg-bronze text-ivory' : 'bg-ivory text-charcoal'}`}
              title={videoAvailableForRoom ? undefined : 'Cinematic clips are limited to the principal rooms.'}
            >
              Cinematic clip (Higgsfield)
            </button>
          </div>
        </fieldset>

        {liveStatus !== null && !isLiveForOutput && (
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

      {confirmingLiveRun && isLiveForOutput ? (
        <div className="mt-5 rounded-xl border border-bronze/40 bg-bronze/10 p-4">
          <p className="text-sm font-semibold text-charcoal">
            This runs a real, billed {outputType === 'image' ? 'Nano Banana' : 'Higgsfield'} generation using the
            configured API credentials.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleGenerateClick}
              className="rounded-full bg-bronze px-4 py-2 text-xs font-semibold text-ivory shadow"
            >
              Yes, generate (may incur cost)
            </button>
            <button
              type="button"
              onClick={() => setConfirmingLiveRun(false)}
              className="rounded-full border border-limestone/60 px-4 py-2 text-xs font-semibold text-charcoal hover:bg-limestone/30"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleGenerateClick}
          disabled={submitting || liveStatus === null || liveVideoNeedsApproval || hasUnresolvedJob}
          className="mt-5 w-full rounded-full bg-bronze px-4 py-3 text-sm font-semibold text-ivory shadow disabled:opacity-60 md:w-auto"
        >
          {liveStatus === null
            ? 'Checking provider status…'
            : submitting
              ? 'Working…'
              : `Generate ${outputType === 'image' ? 'concept image' : 'cinematic clip'}`}
        </button>
      )}
      {recoverableJobId && (
        <div className="mt-4 rounded-xl border border-bronze/40 bg-bronze/10 px-4 py-3">
          <p className="text-sm font-semibold text-charcoal">
            Lost connection while checking on a generation that may still be running (and already billed)
            provider-side. Starting a new one risks a duplicate charge.
          </p>
          <button
            type="button"
            onClick={handleResumeStatusCheck}
            className="mt-2 rounded-full bg-bronze px-4 py-2 text-xs font-semibold text-ivory shadow"
          >
            Resume checking status
          </button>
        </div>
      )}
      {recoverableSubmission && (
        <div className="mt-4 rounded-xl border border-bronze/40 bg-bronze/10 px-4 py-3">
          <p className="text-sm font-semibold text-charcoal">
            Lost connection while submitting a generation — it may have already been received and billed. Resuming
            reuses the exact same request rather than starting a new, possibly duplicate one.
          </p>
          <button
            type="button"
            onClick={handleResumeSubmission}
            className="mt-2 rounded-full bg-bronze px-4 py-2 text-xs font-semibold text-ivory shadow"
          >
            Resume submission
          </button>
        </div>
      )}
      {liveVideoNeedsApproval && modeConfirmed && (
        <p className="mt-2 text-xs font-semibold text-bronze">
          Generate a concept image for this room and Approve it first — a live cinematic clip animates the approved
          still, not a placeholder.
        </p>
      )}
      {liveVideoNeedsApproval && !modeConfirmed && (
        <p className="mt-2 text-xs font-semibold text-bronze">
          Still confirming whether cinematic clips are live-billed on this deployment before allowing generation.{' '}
          <button type="button" onClick={() => setModeProbeRetryNonce((n) => n + 1)} className="underline hover:no-underline">
            Check again
          </button>
        </p>
      )}
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
              {isPlayableVideo(job) ? (
                // A live Higgsfield job returns an actual video URL, which an
                // <img>/next-image element cannot decode — render it as video.
                <video
                  src={job.resultUrl}
                  controls
                  playsInline
                  loop
                  className="h-64 w-full rounded-xl bg-limestone/30 object-cover"
                />
              ) : (
                <div className={`relative h-64 w-full overflow-hidden rounded-xl bg-limestone/30 ${job.outputType === 'video' ? 'animate-[kenburns_8s_ease-in-out_infinite_alternate]' : ''}`}>
                  <Image
                    src={job.resultUrl}
                    alt={`Generated concept for ${activeRoom.hotspotLabel}`}
                    fill
                    sizes="600px"
                    className="object-cover"
                    unoptimized={job.resultUrl.startsWith('data:') || job.resultUrl.endsWith('.svg') || job.resultUrl.startsWith('/api/')}
                  />
                </div>
              )}
              {job.outputType === 'video' && !isPlayableVideo(job) && (
                <p className="mt-2 text-xs italic text-charcoal/50">
                  Demo mode simulates the cinematic move with a gentle pan over the approved still; a live Higgsfield job
                  returns an actual video clip here instead.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setApproved(true);
                    // Keep the approved image so a later refinement or cinematic
                    // clip is generated from it rather than the raw frame/placeholder —
                    // but only when it is a genuine generated image (job.provider !==
                    // 'mock'): otherwise, with Nano Banana in demo mode and Higgsfield
                    // live, this placeholder SVG would satisfy the live-video approval
                    // gate and let a real billed clip animate a fake concept.
                    if (job.outputType === 'image' && job.resultUrl && job.provider !== 'mock') {
                      setApprovedSource({ path: job.resultUrl, roomId });
                    }
                  }}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${approved ? 'bg-olive text-ivory' : 'border border-limestone/60 text-charcoal hover:bg-limestone/30'}`}
                >
                  {approved ? '✓ Approved' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJob(null);
                    setApproved(false);
                    // Only drop the approved baseline if we're rejecting that exact
                    // approved image; rejecting a later refinement or clip that was
                    // generated FROM it must not lose the still-good baseline.
                    if (approvedSource && approvedSource.path === job.resultUrl) {
                      setApprovedSource(null);
                    }
                  }}
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
