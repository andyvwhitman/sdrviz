"""Warm the audio cache.

python -m app.audio.build --all          # every transmission of the day (about 1265 clips)
python -m app.audio.build tx-001 sim-0456
"""

import argparse
import logging
from concurrent.futures import ThreadPoolExecutor

from ..config import Settings
from ..db import make_engine
from ..sim.data import load_sim_data
from .cache import AudioStore, job_for
from .synth import missing_tools


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("ids", nargs="*", help="transmission ids to render")
    parser.add_argument("--all", action="store_true", help="render the whole day")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if missing := missing_tools():
        parser.error(f"missing tools: {', '.join(missing)}")

    settings = Settings()
    store = AudioStore(settings.audio_path)
    rows = load_sim_data(make_engine(settings.database_file), settings).day.rows
    wanted = rows if args.all else [tx for tx in rows if tx.id in set(args.ids)]
    todo = [tx for tx in wanted if not store.is_ready(tx.id)]
    print(f"{len(todo)} of {len(wanted)} clips to render into {settings.audio_path}")
    logging.basicConfig(level=logging.WARNING)
    with ThreadPoolExecutor(args.workers) as pool:
        for done, _ in enumerate(pool.map(lambda tx: store.ensure(job_for(tx)), todo), start=1):
            if done % 100 == 0:
                print(f"  {done}/{len(todo)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
