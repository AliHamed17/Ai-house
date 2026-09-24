"""
Unit tests for approved micro-clip source resolution.

Run with: npm run test:compositor  (python3 -m unittest discover)

Stdlib only, on purpose — these guard real money. An approved clip is a paid
Higgsfield generation an operator signed off; dropping one produces a master
that silently omits the motion and still passes QA, since stage timing and
the lighting arc are unaffected by which source a stage was drawn from.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from clip_assets import (  # noqa: E402
    assert_clip_scheduled,
    assert_known_stage_id,
    resolve_approved_clip_source,
)

STAGE_IDS = ["empty", "upper-cabinets", "island", "stools"]


def only(*present: str):
    """An `exists` predicate that answers True for exactly these paths."""
    allowed = {Path(p) for p in present}
    return lambda path: path in allowed


class TestResolveApprovedClipSource(unittest.TestCase):
    def test_a_repository_relative_path_resolves(self):
        src = resolve_approved_clip_source(
            "island", "public/transformation/clips/island.mp4", only("public/transformation/clips/island.mp4")
        )
        self.assertEqual(src, Path("public/transformation/clips/island.mp4"))

    def test_a_site_absolute_path_resolves_under_public(self):
        src = resolve_approved_clip_source(
            "island", "/transformation/clips/island.mp4", only("public/transformation/clips/island.mp4")
        )
        self.assertEqual(src, Path("public/transformation/clips/island.mp4"))

    def test_the_literal_path_wins_when_both_exist(self):
        src = resolve_approved_clip_source(
            "island",
            "transformation/clips/island.mp4",
            only("transformation/clips/island.mp4", "public/transformation/clips/island.mp4"),
        )
        self.assertEqual(src, Path("transformation/clips/island.mp4"))

    # The finding this file exists for: skipping a missing approved clip
    # published a master without it, from a command that exited 0.
    def test_a_missing_file_is_fatal(self):
        with self.assertRaises(SystemExit) as caught:
            resolve_approved_clip_source("island", "/transformation/clips/island.mp4", only())
        self.assertIn("island", str(caught.exception))

    def test_the_failure_names_both_ways_out(self):
        with self.assertRaises(SystemExit) as caught:
            resolve_approved_clip_source("stools", "/transformation/clips/stools.mp4", only())
        message = str(caught.exception)
        self.assertIn("Restore it", message)
        self.assertIn("un-approve", message)

    def test_the_failure_names_where_it_looked(self):
        with self.assertRaises(SystemExit) as caught:
            resolve_approved_clip_source("stools", "/transformation/clips/stools.mp4", only())
        message = str(caught.exception)
        self.assertIn("transformation/clips/stools.mp4", message)
        self.assertIn("public/transformation/clips/stools.mp4", message)

    def test_an_empty_file_field_is_fatal_rather_than_resolving_to_public(self):
        # Without this, an empty field became Path("public"), a directory that
        # exists — so a clip with no file at all would have "resolved".
        with self.assertRaises(SystemExit):
            resolve_approved_clip_source("decor", "", only("public"))


class TestAssertKnownStageId(unittest.TestCase):
    def test_a_stage_in_the_manifest_passes(self):
        assert_known_stage_id("island", STAGE_IDS)

    # A stale or mistyped stageId loads and decodes fine and is then simply
    # never scheduled, because the scheduler is keyed by stage id.
    def test_a_stage_the_manifest_does_not_have_is_fatal(self):
        with self.assertRaises(SystemExit) as caught:
            assert_known_stage_id("islnad", STAGE_IDS)
        message = str(caught.exception)
        self.assertIn("islnad", message)
        self.assertIn("no such stage", message)

    def test_the_failure_lists_the_stages_that_do_exist(self):
        with self.assertRaises(SystemExit) as caught:
            assert_known_stage_id("islnad", STAGE_IDS)
        for stage_id in STAGE_IDS:
            self.assertIn(stage_id, str(caught.exception))

    def test_the_failure_names_both_ways_out(self):
        with self.assertRaises(SystemExit) as caught:
            assert_known_stage_id("islnad", STAGE_IDS)
        message = str(caught.exception)
        self.assertIn("clips.json", message)
        self.assertIn("un-approve", message)

    def test_an_empty_stage_id_is_fatal(self):
        with self.assertRaises(SystemExit):
            assert_known_stage_id("", STAGE_IDS)

    def test_it_does_not_consume_a_one_shot_iterable_before_reporting(self):
        # A generator would be exhausted by the membership test, leaving the
        # error message with no stages to list.
        with self.assertRaises(SystemExit) as caught:
            assert_known_stage_id("islnad", (s for s in STAGE_IDS))
        self.assertIn("island", str(caught.exception))


class TestAssertClipScheduled(unittest.TestCase):
    def test_a_clip_with_a_window_passes(self):
        assert_clip_scheduled("island", (10, 40))

    # The third way a paid clip vanishes: listed, approved, found, decoded,
    # its stage real — and still no room before the stage boundary.
    def test_a_clip_with_no_window_is_fatal(self):
        with self.assertRaises(SystemExit) as caught:
            assert_clip_scheduled("island", None)
        message = str(caught.exception)
        self.assertIn("island", message)
        self.assertIn("cannot be scheduled", message)

    def test_the_failure_names_every_way_out(self):
        with self.assertRaises(SystemExit) as caught:
            assert_clip_scheduled("island", None)
        message = str(caught.exception)
        self.assertIn("Shorten the clip", message)
        self.assertIn("stage boundary", message)
        self.assertIn("un-approve", message)

    def test_an_empty_window_tuple_still_counts_as_scheduled(self):
        # (0, 0) is a real scheduling answer — a zero-length window is the
        # resampling case handled downstream, not an absent one.
        assert_clip_scheduled("island", (0, 0))


if __name__ == "__main__":
    unittest.main()
