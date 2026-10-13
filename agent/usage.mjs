import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const LIMITS = Object.freeze({ hourly: 6, daily: 20, jobUSD: 1, dailyUSD: 5, outputTokens: 12000, apiMs: 120000, jobMs: 150000 });
// Standard text pricing verified 2026-10-11. Unknown models fail closed.
export function usageCost(usage) {
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens) || usage.input_tokens < 0 || usage.output_tokens < 0) return null;
  return Math.ceil(usage.input_tokens * 0.4 + usage.output_tokens * 1.6); // micro USD, cached input charged conservatively
}

export function createUsageStore(path) {
  let entries = [];
  if (path) {
    mkdirSync(dirname(path), { recursive: true });
    try {
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.jobs) || !saved.jobs.every(j => typeof j.id === 'string' && Number.isFinite(j.startedAt) && Number.isSafeInteger(j.costMicroUSD) && j.costMicroUSD >= 0 && ['running','completed','failed'].includes(j.status))) throw new Error('Invalid usage ledger');
      entries = saved.jobs;
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('Usage ledger cannot be read safely'); }
  }
  const save = () => {
    if (!path) return;
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, jobs: entries }), { mode: 0o600 });
    renameSync(temporary, path);
  };
  return {
    reserve(id, time) {
      entries = entries.filter(j => time - j.startedAt < 86400000);
      if (entries.some(j => j.startedAt > time)) throw new Error('Clock moved backwards');
      if (entries.length >= LIMITS.daily || entries.filter(j => time - j.startedAt < 3600000).length >= LIMITS.hourly) return 'Your generation limit has been reached. Please try again later.';
      if (entries.reduce((sum, j) => sum + j.costMicroUSD, 0) + LIMITS.jobUSD * 1000000 > LIMITS.dailyUSD * 1000000) return 'Your daily API spending limit has been reached. Please try again later.';
      entries.push({ id, startedAt: time, status: 'running', costMicroUSD: LIMITS.jobUSD * 1000000 });
      save(); // Commit the full $1 reservation before any paid API call.
      return null;
    },
    settle(id, status, usage) {
      const job = entries.find(j => j.id === id);
      if (!job) throw new Error('Unknown job');
      const actual = usageCost(usage);
      job.status = status;
      // Missing usage, timeouts and crashes keep the full reservation.
      if (actual !== null) { job.costMicroUSD = actual; job.inputTokens = usage.input_tokens; job.outputTokens = usage.output_tokens; }
      save();
    },
  };
}
