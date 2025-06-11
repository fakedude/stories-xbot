import { Userbot } from 'config/userbot';
import { mapStories } from 'controllers/download-stories';
import { sendActiveStories } from 'controllers/send-active-stories';
import { Api } from 'telegram';
import { UserInfo } from 'types';

import {
  addMonitor,
  cleanupExpiredSentStories,
  countMonitors,
  findMonitor,
  getMonitor,
  listAllMonitors,
  listMonitors,
  listSentStoryIds,
  markStorySent,
  MonitorRow,
  removeMonitor,
  updateMonitorChecked,
} from '../db';

export const CHECK_INTERVAL_HOURS = 6;
// No more monitor limits - all users can monitor unlimited profiles

const monitorTimers = new Map<number, NodeJS.Timeout>();

export function addProfileMonitor(userId: string, username: string): void {
  const row = addMonitor(userId, username);
  scheduleMonitor(row);
}

export function removeProfileMonitor(userId: string, username: string): void {
  const row = findMonitor(userId, username);
  if (row && monitorTimers.has(row.id)) {
    clearTimeout(monitorTimers.get(row.id)!);
    monitorTimers.delete(row.id);
  }
  removeMonitor(userId, username);
}

export function userMonitorCount(userId: string): number {
  return countMonitors(userId);
}

export function listUserMonitors(userId: string): MonitorRow[] {
  return listMonitors(userId);
}

export function startMonitorLoop(): void {
  const all = listAllMonitors();
  for (const m of all) {
    scheduleMonitor(m);
  }
}

async function fetchActiveStories(username: string) {
  const client = await Userbot.getInstance();
  const entity = await client.getEntity(username);
  const activeResult = await client.invoke(
    new Api.stories.GetPeerStories({ peer: entity }),
  );
  return mapStories(activeResult.stories?.stories || []);
}

function scheduleMonitor(m: MonitorRow) {
  const last = m.last_checked ? m.last_checked * 1000 : 0;
  const next = last + CHECK_INTERVAL_HOURS * 3600 * 1000;
  const delay = Math.max(next - Date.now(), 0);
  const timer = setTimeout(() => checkSingleMonitor(m.id), delay);
  monitorTimers.set(m.id, timer);
}

async function checkSingleMonitor(id: number) {
  const m = getMonitor(id);
  if (!m) return; // might have been removed
  const task: UserInfo = {
    chatId: m.telegram_id,
    link: m.target_username,
    linkType: 'username',
    locale: '',
    initTime: Date.now(),
    isPremium: true, // All users have full access now
  };

  const mapped = await fetchActiveStories(task.link);
  cleanupExpiredSentStories();
  const sentIds = new Set(listSentStoryIds(m.id));
  const newStories = mapped.filter((s) => !sentIds.has(s.id));
  if (newStories.length > 0) {
    await sendActiveStories({ stories: newStories, task });
    for (const s of newStories) {
      const expiry = Math.floor(s.date.getTime() / 1000) + 24 * 3600;
      markStorySent(m.id, s.id, expiry);
    }
  }
  updateMonitorChecked(m.id);
  scheduleMonitor({ ...m, last_checked: Math.floor(Date.now() / 1000) });
}
