"""
Unit tests for the transformation QA command's pass/fail rules.

Run with: npm run test:compositor

The invariant under test is that `npm run transformation:qa` fails whenever the
published video no longer reproduces the reference's lighting arc — and that
the report it leaves behind is always parseable JSON, including in the failure
cases where it is the only evidence anyone has.
"""

from __future__ import annotations

import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qa_report import (  # noqa: E402
    MIN_LIGHTING_ARC_CORRELATION,
    MIN_LIGHTING_ARC_SAMPLES,
    json_number,
    lighting_arc_problems,
)

# The value the committed report actually carries, so the tests below fail if
# the real result ever drifts close to the floor rather than only when it has
# already crossed it.
MEASURED_CORRELATION = 0.9969
MEASURED_SAMPLES = 3


class TestJsonNumber(unittest.TestCase):
    def test_a_real_number_is_rounded_for_the_report(self):
        self.assertEqual(json_number(0.99691234), 0.9969)
        self.assertEqual(json_number(-0.5), -0.5)

    def test_nan_and_infinities_become_null(self):
        self.assertIsNone(json_number(float("nan")))
        self.assertIsNone(json_number(float("inf")))
        self.assertIsNone(json_number(float("-inf")))

    def test_the_report_stays_parseable_json_when_a_measurement_is_missing(self):
        # Regression: the report wrote round(float('nan'), 4) straight into
        # json.dumps, which emits a bare `NaN` token. That is not valid JSON —
        # and the run that produces it is exactly the run whose report someone
        # needs to read.
        raw = json.dumps({"lightingArcCorrelation": json_number(float("nan"))})
        self.assertEqual(json.loads(raw)["lightingArcCorrelation"], None)

    def test_the_old_behaviour_really_did_produce_invalid_json(self):
        # Guards the premise: if json.dumps ever started refusing or escaping
        # this on its own, the test above would be proving nothing.
        raw = json.dumps({"x": round(float("nan"), 4)})
        self.assertIn("NaN", raw)
        with self.assertRaises(json.JSONDecodeError):
            json.loads(raw, parse_constant=_reject_constant)


def _reject_constant(token: str):
    raise json.JSONDecodeError(f"non-standard JSON token {token!r}", token, 0)


class TestLightingArcProblems(unittest.TestCase):
    def test_the_measured_arc_passes(self):
        self.assertEqual(lighting_arc_problems(MEASURED_CORRELATION, MEASURED_SAMPLES), [])

    def test_a_flat_or_black_render_fails_instead_of_passing_silently(self):
        # np.corrcoef returns nan when either luminance series is constant,
        # which is precisely what a frozen, flat or fully black render gives.
        # The old exit predicate ignored this value entirely, so that video
        # shipped with a green QA run.
        problems = lighting_arc_problems(float("nan"), MEASURED_SAMPLES)
        self.assertEqual(len(problems), 1)
        self.assertIn("not a number", problems[0])

    def test_a_backwards_arc_fails(self):
        # Dusk brighter than daylight and warm-evening darker than dusk: the
        # arc runs the wrong way, and correlation goes strongly negative.
        problems = lighting_arc_problems(-0.98, MEASURED_SAMPLES)
        self.assertEqual(len(problems), 1)
        self.assertIn("below the required", problems[0])

    def test_an_arc_that_merely_drifts_still_passes(self):
        # The floor is a floor, not a target — a result that differs a little
        # in shape must not fail a QA command people are expected to run.
        self.assertEqual(lighting_arc_problems(0.95, MEASURED_SAMPLES), [])

    def test_the_boundary_is_inclusive(self):
        self.assertEqual(
            lighting_arc_problems(MIN_LIGHTING_ARC_CORRELATION, MEASURED_SAMPLES), []
        )
        self.assertEqual(
            len(lighting_arc_problems(MIN_LIGHTING_ARC_CORRELATION - 1e-9, MEASURED_SAMPLES)), 1
        )

    def test_too_few_lighting_stages_is_reported_as_measuring_nothing(self):
        # Two points always correlate perfectly and fewer than two produce no
        # number at all, so a shrunken reference analysis would otherwise turn
        # this audit into a guaranteed pass that measures nothing.
        for count in range(MIN_LIGHTING_ARC_SAMPLES):
            problems = lighting_arc_problems(1.0, count)
            self.assertEqual(len(problems), 1, f"{count} sample(s)")
            self.assertIn("lighting arc at all", problems[0])

    def test_the_sample_shortfall_is_reported_ahead_of_the_nan_it_causes(self):
        # Fewer than two samples make the correlation nan by construction;
        # saying "the render is flat" there would be actively misleading.
        problems = lighting_arc_problems(float("nan"), 1)
        self.assertEqual(len(problems), 1)
        self.assertIn("lighting arc at all", problems[0])

    def test_the_measured_value_is_not_sitting_on_the_floor(self):
        # If the real arc ever drifts down toward the floor, that is a finding
        # in itself — this should start failing well before the command does.
        self.assertGreater(MEASURED_CORRELATION, MIN_LIGHTING_ARC_CORRELATION + 0.05)


class TestCommittedReport(unittest.TestCase):
    """The rules above, checked against the report actually in the repo."""

    def setUp(self):
        path = Path(__file__).resolve().parents[2] / "analysis" / "transformation-qa.json"
        if not path.exists():
            self.skipTest(f"no committed report at {path}")
        # json.loads rejects the bare NaN token by default only via
        # parse_constant; ask for that explicitly so an invalid report cannot
        # pass this test just because Python is lenient about its own output.
        self.report = json.loads(path.read_text(), parse_constant=_reject_constant)

    def test_the_committed_report_is_strictly_valid_json(self):
        # setUp does the asserting; reaching here at all is the assertion.
        self.assertIn("lightingArcCorrelation", self.report)

    def test_the_committed_report_passes_its_own_lighting_rule(self):
        correlation = self.report["lightingArcCorrelation"]
        samples = sum(1 for s in self.report["stages"] if s["referenceLighting"] != "daylight")
        self.assertIsNotNone(correlation, "a published report must carry a real measurement")
        self.assertEqual(lighting_arc_problems(float(correlation), samples), [])

    def test_the_committed_report_records_the_verdict_it_was_judged_by(self):
        self.assertTrue(self.report["lightingArcAcceptable"])
        self.assertEqual(self.report["lightingArcProblems"], [])
        self.assertEqual(self.report["minLightingArcCorrelation"], MIN_LIGHTING_ARC_CORRELATION)

    def test_no_measurement_in_the_committed_report_is_a_non_finite_float(self):
        for key in ("lightingArcCorrelation", "allStageLuminanceCorrelation"):
            value = self.report[key]
            if value is not None:
                self.assertTrue(math.isfinite(float(value)), key)


if __name__ == "__main__":
    unittest.main()
