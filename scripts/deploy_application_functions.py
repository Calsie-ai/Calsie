"""Deploy only explicitly reviewed application functions; never deploy all."""

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys


PROJECT_REF = "ibgmpamvkvjzdxirzxzr"
ROOT = Path(__file__).resolve().parents[1]


def application_functions(root):
    functions = []
    manifest = root / "supabase/application-functions.txt"
    for number, raw in enumerate(manifest.read_text().splitlines(), 1):
        name = raw.strip()
        if not name or name.startswith("#"):
            continue
        if not re.fullmatch(r"[a-z][a-z0-9-]*", name):
            raise ValueError(f"Invalid function slug on line {number}")
        if "apify" in name:
            raise ValueError(f"Ingestion function is excluded: {name}")
        if name in functions:
            raise ValueError(f"Duplicate function: {name}")
        if not (root / "supabase/functions" / name / "index.ts").is_file():
            raise ValueError(f"Missing index.ts for {name}")
        functions.append(name)
    return functions


def deploy(root, env):
    # Validate the entire manifest and target before any external command.
    functions = application_functions(root)
    if not functions:
        raise ValueError("No application functions approved; deployment refused")
    if env.get("SUPABASE_PROJECT_REF") != PROJECT_REF:
        raise ValueError("SUPABASE_PROJECT_REF must match the reviewed Calsie project")
    if not env.get("SUPABASE_ACCESS_TOKEN", "").strip():
        raise ValueError("SUPABASE_ACCESS_TOKEN is required")
    for name in functions:
        print(f"Deploying application function: {name}", flush=True)
        subprocess.run(
            ["supabase", "functions", "deploy", name,
             "--project-ref", PROJECT_REF, "--use-api"],
            cwd=root, env=env, check=True,
        )
        print(f"Deployment confirmed by CLI: {name}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--deploy", action="store_true")
    args = parser.parse_args()
    try:
        if args.check:
            names = application_functions(ROOT)
            print(f"Approved application functions: {', '.join(names) or '(none; deployment disabled)'}")
        else:
            deploy(ROOT, dict(os.environ))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Application deployment stopped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
