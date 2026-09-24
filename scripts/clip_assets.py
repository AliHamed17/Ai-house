"""
Resolving the source file of an APPROVED micro-clip.

Stdlib only, on purpose — like clip_schedule.py, this guards real money.
Every approved clip is a paid Higgsfield generation that an operator has
deliberately signed off, so the one thing this must never do is quietly
decide to carry on without one: the compositor would publish a master that
drops the approved motion, and `npm run transformation:qa` would still pass,
because stage timing and the lighting arc — everything QA measures — are
unaffected by which source a stage was drawn from. The only trace would be a
line of log output from a command that exited 0.

So a listed-and-approved clip that cannot be found is a fatal input error,
and the operator is told both ways out of it.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Iterable


def assert_known_stage_id(stage_id: str, known_stage_ids: Iterable[str]) -> None:
    """
    Fails unless an approved clip names a stage the manifest actually has.

    A stale or mistyped `stageId` is the same silent loss as a missing file,
    one step further along: the clip loads and decodes fine, then nothing
    schedules it, because the scheduler is keyed by stage id and there is no
    such stage. Composition used to log that and exit 0, publishing a master
    without the approved motion.

    Caught here rather than at scheduling time so the message can say what is
    wrong — a name that matches no stage — instead of the downstream symptom,
    which looks identical to a stage whose window is genuinely too short.
    """
    known = list(known_stage_ids)
    if stage_id in known:
        return
    raise SystemExit(
        f"clip for stage {stage_id!r} is marked approved but no such stage exists in the transformation "
        f"manifest (stages: {', '.join(known)}). Fix the stageId in public/transformation/clips.json, "
        "or un-approve the clip, and compose again."
    )


def assert_clip_scheduled(stage_id: str, window: object) -> None:
    """
    Fails unless an approved clip actually got a window to play in.

    The third way a paid clip disappears without trace: it is listed,
    approved, found and decoded, its stage exists — and the scheduler still
    has no room for it before that stage's boundary. Composition used to log
    "NOT used" to stderr and exit 0, which in a script whose output is a
    published master is indistinguishable from success.
    """
    if window is not None:
        return
    raise SystemExit(
        f"approved clip for stage {stage_id} cannot be scheduled: there is no room for it before its "
        "stage boundary. Shorten the clip, move the stage boundary in the transformation manifest, or "
        "un-approve the clip, and compose again."
    )


def resolve_approved_clip_source(
    stage_id: str,
    file_field: str,
    exists: Callable[[Path], bool] = Path.exists,
) -> Path:
    """
    The on-disk path of an approved clip, raising SystemExit if there is none.

    `file_field` is as written in public/transformation/clips.json, which may
    be repository-relative or site-absolute ("/transformation/..."), so both
    the literal path and the same path under public/ are tried — the two
    shapes this file has been written in.

    `exists` is injected so the decision can be tested without a filesystem.
    """
    raw = str(file_field).lstrip("/")
    candidates = [Path(raw), Path("public") / raw] if raw else []
    for candidate in candidates:
        if exists(candidate):
            return candidate

    looked_in = " or ".join(str(c) for c in candidates) if candidates else "(no file recorded)"
    raise SystemExit(
        f"clip for stage {stage_id} is marked approved but its file is missing: looked in {looked_in}. "
        "Restore it, or un-approve the clip in public/transformation/clips.json, and compose again."
    )
