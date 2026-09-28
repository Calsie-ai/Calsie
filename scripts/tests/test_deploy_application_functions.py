import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "deployment", Path(__file__).resolve().parents[1] / "deploy_application_functions.py"
)
DEPLOYMENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOYMENT)


class DeploymentBoundaries(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "supabase/functions").mkdir(parents=True)
        self.env = {
            "SUPABASE_PROJECT_REF": DEPLOYMENT.PROJECT_REF,
            "SUPABASE_ACCESS_TOKEN": "test-placeholder",
        }

    def manifest(self, text, functions=()):
        (self.root / "supabase/application-functions.txt").write_text(text)
        for name in functions:
            folder = self.root / "supabase/functions" / name
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "index.ts").write_text("// fixture")

    def test_empty_list_checks_but_cannot_deploy(self):
        self.manifest("# Nothing approved\n")
        self.assertEqual(DEPLOYMENT.application_functions(self.root), [])
        with patch.object(DEPLOYMENT.subprocess, "run") as run:
            with self.assertRaises(ValueError):
                DEPLOYMENT.deploy(self.root, self.env)
            run.assert_not_called()

    def test_invalid_lists_never_start_a_partial_deployment(self):
        for invalid in ("apify-jobs-v2", "applix-apify-campaign-matcher",
                        "../outside", "--all", "profile-read --debug",
                        "missing-function", "profile-read"):
            with self.subTest(invalid=invalid):
                self.manifest("profile-read\n" + invalid, ["profile-read"])
                with patch.object(DEPLOYMENT.subprocess, "run") as run:
                    with self.assertRaises(ValueError):
                        DEPLOYMENT.deploy(self.root, self.env)
                    run.assert_not_called()

    def test_old_or_missing_project_and_missing_token_are_rejected(self):
        self.manifest("profile-read", ["profile-read"])
        for changes in ({"SUPABASE_PROJECT_REF": "old-project"},
                        {"SUPABASE_PROJECT_REF": ""},
                        {"SUPABASE_ACCESS_TOKEN": ""}):
            with self.subTest(changes=changes):
                with patch.object(DEPLOYMENT.subprocess, "run") as run:
                    with self.assertRaises(ValueError):
                        DEPLOYMENT.deploy(self.root, self.env | changes)
                    run.assert_not_called()

    def test_only_listed_functions_are_deployed_by_name(self):
        self.manifest("profile-read\n", ["profile-read", "apify-jobs-v2", "legacy-other"])
        with patch.object(DEPLOYMENT.subprocess, "run") as run:
            DEPLOYMENT.deploy(self.root, self.env)
            run.assert_called_once_with(
                ["supabase", "functions", "deploy", "profile-read",
                 "--project-ref", DEPLOYMENT.PROJECT_REF, "--use-api"],
                cwd=self.root, env=self.env, check=True,
            )

    def test_cli_failure_stops_remaining_functions(self):
        self.manifest("profile-read\nprofile-update", ["profile-read", "profile-update"])
        with patch.object(DEPLOYMENT.subprocess, "run",
                          side_effect=subprocess.CalledProcessError(1, "supabase")) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                DEPLOYMENT.deploy(self.root, self.env)
            self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
