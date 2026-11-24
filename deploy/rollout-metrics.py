"""Record host CPU, available memory and disk space in the deployment log."""
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path


def cpu_ticks():
    # guest and guest_nice are already included in user and nice.
    ticks = [int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:9]]
    return sum(ticks), ticks[3] + ticks[4]


previous_total, previous_idle = cpu_ticks()
while True:
    time.sleep(2)
    total, idle = cpu_ticks()
    elapsed = total - previous_total
    if elapsed <= 0:
        continue
    busy = 100 * (1 - (idle - previous_idle) / elapsed)
    available = next(line.split()[1] for line in Path("/proc/meminfo").read_text().splitlines()
                     if line.startswith("MemAvailable:"))
    free = shutil.disk_usage(".").free
    print(f"{datetime.now(timezone.utc).isoformat()} rollout host_cpu={busy:.1f}% "
          f"mem_available_mib={int(available)//1024} disk_free_mib={free//2**20}", flush=True)
    previous_total, previous_idle = total, idle
    time.sleep(8)
