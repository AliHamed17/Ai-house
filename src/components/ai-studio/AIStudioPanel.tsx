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

// Mirrors recoverableJobId/recoverableSubmission into localStorage so a paid
// (or possibly-paid) generation whose fate is still unknown is not silently
// forgotten if the visitor reloads or closes the tab mid-flight — in-memory
// React state alone does not survive that. Restored on mount into the exact
// same recoverableJobId/recoverableSubmission state and rendered by the
// existing "Resume checking status" / "Resume submission" banners, so
// resuming still requires the visitor's own click rather than silently
// firing a request on page load.
const RECOVERY_STORAGE_KEY = 'ai-studio:unresolved-generation';
// Ceilings mirror exactly what the server can actually still back up, so an
// entry is never offered for Resume past the point its server-side
// reservation (idempotency.server) could already be gone — at which point
// Resume wouldn't reconcile anything, it would silently start a genuinely
// new, separately billed submission.
//  - 'job' only ever drives a status POLL (a read), which is safe to retry
//    indefinitely — Higgsfield's own servers, not this server's in-memory
//    stores, are the source of truth for whether a live job is still
//    checkable, so a generous window here is never a billing risk.
//  - 'submission' resumes by POSTing again with the same idempotencyKey.
//    Its reservation's TTL depends on WHY it was recorded as recoverable in
//    the first place, and the two cases are not equivalent:
//      - ambiguous: true — the 504 submit-timeout case (isSubmitTimeout in
//        higgsfield.server / nanoBanana.server). The server explicitly
//        upgrades THIS reservation to AMBIGUOUS_TTL_MS (60 min) specifically
//        because it knows the outcome is unresolved.
//      - ambiguous: false — a network-level failure (the fetch itself
//        throwing). The client cannot tell from this alone whether the
//        request reached the server, and if it did, whether it went on to
//        succeed (kept at the ordinary TTL_MS, 10 min — success never
//        upgrades a reservation) or fail definitively (deleted entirely,
//        safe either way). The worst case that ISN'T "safe to retry" is
//        "succeeded, still cached" — bounded by the SHORT ordinary TTL_MS,
//        so that's the ceiling this case must assume.
//    Using the long (ambiguous) ceiling for BOTH would let a network-loss
//    recovery whose request actually succeeded outlive its real 10-minute
//    reservation and silently double-submit on Resume.
const RECOVERY_MAX_AGE_MS = {
  job: 24 * 60 * 60_000,
  // 5min margin under idempotency.server's AMBIGUOUS_TTL_MS (60 min) for
  // clock/network skew between writing this entry and the server's own
  // reservation window actually starting.
  submissionAmbiguous: 55 * 60_000,
  // Margin under idempotency.server's TTL_MS (10 min), same reasoning.
  submissionOrdinary: 9 * 60_000,
} as const;

type RecoveryEntry =
  | { kind: 'job'; jobId: string; roomId: RoomId; outputType: GenerationOutputType; createdAt: number }
  | {
      kind: 'submission';
      ambiguous: boolean;
      idempotencyKey: string;
      endpoint: string;
      body: Record<string, unknown>;
      roomId: RoomId;
      outputType: GenerationOutputType;
      createdAt: number;
    };

function recoveryMaxAgeMs(entry: RecoveryEntry): number {
  if (entry.kind === 'job') return RECOVERY_MAX_AGE_MS.job;
  return entry.ambiguous ? RECOVERY_MAX_AGE_MS.submissionAmbiguous : RECOVERY_MAX_AGE_MS.submissionOrdinary;
}

// Every entry is keyed by its own generation's stable identity — a job's
// jobId, or a submission's idempotencyKey — rather than all sharing one
// slot. Two tabs (genuinely different browser tabs, or two tabs of the same
// browser both open to this page) each tracking their own in-flight
// generation write to the SAME origin-wide localStorage; a single shared key
// meant either tab's write, or either tab's terminal-state clear, could
// silently overwrite or destroy the OTHER tab's still-active recovery record
// (regression) — after which a reload of that other tab would offer no
// recovery at all and silently permit a second, possibly duplicate-billed
// submission. Keying by identity means a write or clear only ever touches
// the one entry it actually owns.
function jobRecoveryId(jobId: string): string {
  return `job:${jobId}`;
}
function submissionRecoveryId(idempotencyKey: string): string {
  return `submission:${idempotencyKey}`;
}
function recoveryEntryId(entry: RecoveryEntry): string {
  return entry.kind === 'job' ? jobRecoveryId(entry.jobId) : submissionRecoveryId(entry.idempotencyKey);
}

function readAllRecoveryEntries(): Record<string, RecoveryEntry> {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, RecoveryEntry>;
  } catch {
    return {};
  }
}

function writeAllRecoveryEntries(all: Record<string, RecoveryEntry>): void {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(RECOVERY_STORAGE_KEY);
    else localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Best-effort (private browsing, storage disabled, quota) — the
    // in-memory state this mirrors still works for as long as the tab
    // stays open either way, so a write failure here is not fatal.
  }
}

// Restores the most recently written still-valid entry (a reasonable choice
// when more than one is present — see the multi-tab note above; this tab's
// own subsequent actions then track that ONE entry by its own identity, same
// as any other restore) and opportunistically prunes every expired entry so
// the store does not grow unboundedly across many abandoned tabs over time.
function readRecoveryEntry(): RecoveryEntry | null {
  const all = readAllRecoveryEntries();
  let newest: RecoveryEntry | null = null;
  let changed = false;
  for (const [id, entry] of Object.entries(all)) {
    if (Date.now() - entry.createdAt > recoveryMaxAgeMs(entry)) {
      delete all[id];
      changed = true;
      continue;
    }
    if (!newest || entry.createdAt > newest.createdAt) newest = entry;
  }
  if (changed) writeAllRecoveryEntries(all);
  return newest;
}

function writeRecoveryEntry(entry: RecoveryEntry): void {
  const all = readAllRecoveryEntries();
  all[recoveryEntryId(entry)] = entry;
  writeAllRecoveryEntries(all);
}

function clearRecoveryEntry(id: string): void {
  const all = readAllRecoveryEntries();
  if (!(id in all)) return;
  delete all[id];
  writeAllRecoveryEntries(all);
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

  // Restores a paid-job recovery point left behind by a previous page load,
  // OR by a genuinely different tab sharing this origin's localStorage that
  // has since written its own entry (see writeRecoveryEntry) — into the same
  // recoverableJobId/recoverableSubmission state a same-session outage would
  // have produced, reusing the existing "Resume checking status" / "Resume
  // submission" banners rather than silently resuming anything itself. Only
  // adopts an entry while THIS tab has none of its own tracked yet — never
  // overrides an in-flight local one with a different tab's, which could
  // otherwise strand this tab's own submission mid-flight with no way to
  // reconcile it. roomId/outputType are restored alongside it so the locked
  // selectors reflect the room the outstanding job actually belongs to, not
  // whatever this tab happened to have selected.
  function adoptRecoveryEntry() {
    const entry = readRecoveryEntry();
    if (!entry) return;
    setRoomId(entry.roomId);
    setOutputType(entry.outputType);
    if (entry.kind === 'job') {
      setRecoverableJobId(entry.jobId);
    } else {
      setRecoverableSubmission({ endpoint: entry.endpoint, body: entry.body });
    }
  }

  useEffect(() => {
    // Restoring from an external system (localStorage) on mount, not
    // deriving from other React state — see MobileControls.tsx for the same
    // sanctioned pattern and rule exception.
    /* eslint-disable react-hooks/set-state-in-effect */
    adoptRecoveryEntry();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // The mount effect above only ever runs once, so a tab that was ALREADY
  // open before a genuinely different tab started its own generation would
  // otherwise never learn that one now exists — hasUnresolvedJob would stay
  // stuck at false, letting this tab start a second, separately billed
  // submission for the same default room (regression). The browser's own
  // `storage` event fires in every OTHER tab (never the one that made the
  // write) whenever localStorage changes, which is exactly the live signal
  // needed to catch up.
  useEffect(() => {
    function handleStorageEvent(event: StorageEvent) {
      if (event.key !== null && event.key !== RECOVERY_STORAGE_KEY) return;
      if (recoverableJobId !== null || recoverableSubmission !== null) return;
      adoptRecoveryEntry();
    }
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, [recoverableJobId, recoverableSubmission]);

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
    // Written up front — not only once retries are exhausted — so a reload
    // during an otherwise-healthy poll still leaves a recovery breadcrumb;
    // right now that case loses the job with no trace at all.
    writeRecoveryEntry({ kind: 'job', jobId, roomId, outputType, createdAt: Date.now() });
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
          clearRecoveryEntry(jobRecoveryId(jobId));
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

  // A job can become PERMANENTLY uncheckable (e.g. the provider credentials
  // it needs are removed after submission) — every status attempt then
  // exhausts its retries the same way forever, "Resume checking status"
  // never succeeds, and the 24h recovery ceiling is only evaluated at mount,
  // so a tab that is never reloaded would otherwise stay locked out of
  // Generate indefinitely with no way out (regression). This gives the
  // visitor an explicit, deliberate way to stop tracking it locally instead.
  function handleAbandonJob() {
    if (!recoverableJobId) return;
    // A newer token means any already-scheduled retry timeout from the
    // abandoned poll loop drops its result instead of acting on it — the
    // same guard startPolling's own responses already rely on.
    ++pollTokenRef.current;
    clearRecoveryEntry(jobRecoveryId(recoverableJobId));
    setRecoverableJobId(null);
    setError(null);
  }

  // Same reasoning as handleAbandonJob, for a submission whose outcome is
  // ambiguous rather than a job that is merely uncheckable.
  function handleAbandonSubmission() {
    if (!recoverableSubmission) return;
    ++pollTokenRef.current;
    clearRecoveryEntry(submissionRecoveryId(recoverableSubmission.body.idempotencyKey as string));
    setRecoverableSubmission(null);
    setError(null);
  }

  // Submits one generation request. On a definite failure (a non-OK HTTP
  // response the server has already conclusively resolved) it just reports
  // the error. Two cases are NOT definite, and both keep the exact request
  // (endpoint, body, and its idempotencyKey) as recoverableSubmission so a
  // retry reuses the same key — the server recognizes it and returns the
  // job it already created (or, for the second case, the same ambiguous
  // outcome — see idempotency.server's isAmbiguousFailure) rather than
  // starting and billing a second one:
  //  - a network-level failure (the fetch itself throwing), where we
  //    cannot tell "never reached the server" apart from "reached the
  //    server, which ran and billed it, but the response never came back";
  //  - a 504 from either generate route, its explicit signal that the
  //    submission timed out in a way that may still have been accepted and
  //    billed (see isSubmitTimeout in higgsfield.server / nanoBanana.server)
  //    — this DID reach the client as a normal response, but is exactly as
  //    ambiguous as a dropped connection would have been.
  // A 410 (from either route) is a third, definite case that still gets
  // special handling: the approved source it named expired from the
  // server's cache before this request used it (see SOURCE_EXPIRED_MESSAGE).
  // Nothing was billed, so it isn't kept as recoverableSubmission — instead
  // approvedSource is cleared so the next Generate uses a fresh source
  // rather than retrying this exact request and failing the same way again.
  // A 429 is a fourth case, but the opposite kind of "not definite": it means
  // this specific attempt never even reached the idempotency/provider logic
  // (the rate limiter runs first), so it says NOTHING about whether an
  // earlier ambiguous submission this is resuming succeeded or failed —
  // isResume (true only from handleResumeSubmission) is what makes that
  // existing recoverableSubmission survive it, rather than being silently
  // discarded by a throttle that has nothing to do with the original request.
  // Shared between a fresh submission (handleGenerate) and resuming one
  // (handleResumeSubmission).
  async function submitOnce(endpoint: string, body: Record<string, unknown>, token: number, isResume = false): Promise<string | null> {
    // Written before fetch() is even called, not only once it settles — a
    // tab closing or crashing while THIS exact POST is still in flight
    // otherwise leaves no trace anywhere (not persisted, not even in
    // memory) that a possibly-billed submission happened at all, even
    // though the server may have already accepted (and is running, or has
    // already run) it. ambiguous: false is the same safe assumption used
    // for a network-level failure below: we don't yet know the outcome, so
    // assume the shorter, ordinary-TTL ceiling rather than the longer one.
    // Skipped for a resume: the entry it's resuming already exists (that's
    // why Resume is being offered) and already covers this same case: if
    // this attempt is also interrupted, that untouched original entry is
    // what a later reload falls back to.
    const createdAt = Date.now();
    const idempotencyKey = body.idempotencyKey as string;
    if (!isResume) {
      writeRecoveryEntry({ kind: 'submission', ambiguous: false, idempotencyKey, endpoint, body, roomId, outputType, createdAt });
    }
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (token !== pollTokenRef.current) return null; // a newer run superseded this one
      if (!res.ok) {
        setSubmitting(false);
        if (res.status === 429) {
          const retryAfterSeconds = res.headers.get('Retry-After');
          setError(
            retryAfterSeconds
              ? `Too many attempts — please wait ${retryAfterSeconds}s and try again.`
              : (data.error ?? 'Too many attempts. Please wait a moment and try again.'),
          );
          if (isResume) {
            // Deliberately does NOT clearRecoveryEntry(): this was never a
            // conclusive outcome for the original submission, only a local
            // throttle on THIS attempt. handleResumeSubmission already
            // optimistically cleared the in-memory state before calling
            // this, so it's restored here — the persisted entry (predating
            // this resume attempt, and never touched by the pre-fetch write
            // above since that's skipped for a resume) is still exactly as
            // it was.
            setRecoverableSubmission({ endpoint, body });
          } else {
            // Nothing reached the provider — the rate limiter rejected this
            // fresh attempt before it got anywhere near reserveIdempotentSubmission.
            // The pre-fetch entry above was only ever a speculative just-in-case
            // write and can be discarded now that the outcome is known.
            clearRecoveryEntry(submissionRecoveryId(idempotencyKey));
          }
          return null;
        }
        setError(data.error ?? 'Generation request failed.');
        // Cleared unconditionally first: a stale entry from an earlier
        // ambiguous attempt on this same request (see handleResumeSubmission)
        // must not survive a now-definite outcome, whichever way it resolved.
        clearRecoveryEntry(submissionRecoveryId(idempotencyKey));
        if (res.status === 504) {
          setRecoverableSubmission({ endpoint, body });
          // ambiguous: true, with a FRESH timestamp — mirrors isSubmitTimeout
          // server-side (the only way either generate route returns a 504),
          // which is exactly when idempotency.server refreshes createdAt and
          // upgrades to the longer AMBIGUOUS_TTL_MS for this same reservation.
          writeRecoveryEntry({ kind: 'submission', ambiguous: true, idempotencyKey, endpoint, body, roomId, outputType, createdAt: Date.now() });
        }
        // A definite, pre-billing failure — the approved source this request
        // named fell out of the server's cache. Nothing to resume: clear it
        // so the next Generate falls back to a fresh source instead of
        // retrying the same request and failing the same way forever.
        if (res.status === 410) setApprovedSource(null);
        return null;
      }
      return data.jobId as string;
    } catch {
      if (token !== pollTokenRef.current) return null;
      setError('Could not reach the generation service. If it was already submitted, Resume below reuses the exact same request instead of starting a new one.');
      setSubmitting(false);
      setRecoverableSubmission({ endpoint, body });
      // ambiguous: false, keeping the ORIGINAL pre-fetch createdAt (not a
      // fresh Date.now() here) — a network-level failure never upgrades a
      // server-side reservation, so if the request reached the server and
      // succeeded, that reservation's own clock started at (approximately)
      // when the request arrived, not when this client-side catch fired.
      writeRecoveryEntry({ kind: 'submission', ambiguous: false, idempotencyKey, endpoint, body, roomId, outputType, createdAt });
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
      const jobId = await submitOnce(endpoint, body, token, true);
      if (jobId) {
        // The submission's own entry is now superseded by the job entry
        // startPolling writes below — clear it explicitly so it doesn't
        // linger in storage until it eventually ages out on its own.
        clearRecoveryEntry(submissionRecoveryId(body.idempotencyKey as string));
        startPolling(jobId, token);
      }
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
    // (handleGenerateClick already returns early while hasUnresolvedJob is
    // true, so recoverableJobId/recoverableSubmission are already guaranteed
    // null here — there is nothing of THIS tab's own left to clear from
    // storage, and blindly clearing "whatever's there" could only ever hit a
    // DIFFERENT tab's still-active entry now that entries are keyed per
    // generation rather than sharing one slot.)
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
    if (jobId) {
      // The submission's own entry is now superseded by the job entry
      // startPolling writes below — clear it explicitly so it doesn't linger
      // in storage until it eventually ages out on its own.
      clearRecoveryEntry(submissionRecoveryId(body.idempotencyKey));
      startPolling(jobId, token);
    }
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
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleResumeStatusCheck}
              className="rounded-full bg-bronze px-4 py-2 text-xs font-semibold text-ivory shadow"
            >
              Resume checking status
            </button>
            <button
              type="button"
              onClick={handleAbandonJob}
              className="rounded-full border border-limestone/60 px-4 py-2 text-xs font-semibold text-charcoal hover:bg-limestone/30"
            >
              Abandon and start over
            </button>
          </div>
          <p className="mt-2 text-xs text-charcoal/60">
            Abandoning only stops checking locally — if this is genuinely stuck (e.g. provider credentials changed
            after it was submitted), it&apos;s the only way to unlock a new generation.
          </p>
        </div>
      )}
      {recoverableSubmission && (
        <div className="mt-4 rounded-xl border border-bronze/40 bg-bronze/10 px-4 py-3">
          <p className="text-sm font-semibold text-charcoal">
            The outcome of this generation is unclear (a lost connection, or a provider timeout) — it may have
            already been received and billed. Resuming reuses the exact same request rather than starting a new,
            possibly duplicate one.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleResumeSubmission}
              className="rounded-full bg-bronze px-4 py-2 text-xs font-semibold text-ivory shadow"
            >
              Resume submission
            </button>
            <button
              type="button"
              onClick={handleAbandonSubmission}
              className="rounded-full border border-limestone/60 px-4 py-2 text-xs font-semibold text-charcoal hover:bg-limestone/30"
            >
              Abandon and start over
            </button>
          </div>
          <p className="mt-2 text-xs text-charcoal/60">
            Abandoning only stops checking locally — if this is genuinely stuck, it&apos;s the only way to unlock a
            new generation.
          </p>
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
