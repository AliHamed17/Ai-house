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

from clip_assets import resolve_approved_clip_source  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
