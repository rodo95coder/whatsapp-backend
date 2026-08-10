import os from "node:os";
import fs from "node:fs/promises";

import config from "../config/env.js";
import logger from "../utils/logger.js";
import store from "./session-store.js";

const MB = 1024 * 1024;

async function readLinuxProcessTreeRss(pid) {
  if (process.platform !== "linux" || !pid) return { rssMb: 0, processes: 0 };

  const pending = [pid];
  const visited = new Set();
  let rssKb = 0;

  while (pending.length) {
    const currentPid = pending.pop();
    if (visited.has(currentPid)) continue;
    visited.add(currentPid);

    try {
      const [status, children] = await Promise.all([
        fs.readFile(`/proc/${currentPid}/status`, "utf8"),
        fs.readFile(`/proc/${currentPid}/task/${currentPid}/children`, "utf8"),
      ]);
      const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
      rssKb += Number(match?.[1] || 0);
      for (const child of children.trim().split(/\s+/).filter(Boolean)) pending.push(Number(child));
    } catch {
      // A Chrome child may exit between listing and reading /proc.
    }
  }

  return { rssMb: Math.round(rssKb / 1024), processes: visited.size };
}

async function getBrowserMemory(runtimes) {
  const usage = await Promise.all(runtimes.map((runtime) => readLinuxProcessTreeRss(runtime.browserPid)));
  return usage.reduce((total, current) => ({
    rssMb: total.rssMb + current.rssMb,
    processes: total.processes + current.processes,
  }), { rssMb: 0, processes: 0 });
}

export function startSessionCapacityMonitor() {
  let lastWarningAt = 0;
  let running = false;

  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
    const freeMemoryMb = Math.round(os.freemem() / MB);
    const processRssMb = Math.round(process.memoryUsage().rss / MB);
    const runtimes = store.getAllRuntimes();
    const browserMemory = await getBrowserMemory(runtimes);
    const connected = runtimes.filter((runtime) => runtime.state === "CONNECTED").length;
    const connecting = runtimes.filter((runtime) => runtime.creating || runtime.state === "CONNECTING" || runtime.state === "QR_REQUIRED").length;
    const pressured = freeMemoryMb <= config.sessionCapacityWarnFreeMemoryMb
      || processRssMb >= config.sessionCapacityWarnProcessRssMb;

    if (!pressured || Date.now() - lastWarningAt < config.sessionCapacityWarnCooldownMs) return;

    lastWarningAt = Date.now();
    logger.warn(
      `session.capacity.warning total=${runtimes.length} connected=${connected} connecting=${connecting} processRssMb=${processRssMb} browserRssMb=${browserMemory.rssMb} browserProcesses=${browserMemory.processes} freeSystemMemoryMb=${freeMemoryMb}`,
    );
    } finally {
      running = false;
    }
  }, config.sessionWatchdogIntervalMs);

  timer.unref?.();
  return () => clearInterval(timer);
}
