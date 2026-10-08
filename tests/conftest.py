import pathlib
import sys

# Run from any directory: contract paths in tests are relative to the repo root.
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import os

os.chdir(ROOT)
