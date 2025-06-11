// src/index.ts

// Global error handlers must be at the absolute top.
// Redirect console output to a debug log file for easier troubleshooting
import './config/setup-logs';

import { IContextBot } from 'config/context-interface';
import { BOT_ADMIN_ID, BOT_TOKEN, LOG_FILE } from 'config/env-config';
import { initUserbot } from 'config/userbot';
import { notifyAdmin } from 'controllers/send-message';
import { sendProfileMedia } from 'controllers/send-profile-media';
import fs from 'fs';
import { isValidStoryLink, sendTemporaryMessage } from 'lib';
import path from 'path';
import { session, Telegraf } from 'telegraf';
import { UserInfo } from 'types';

import {
  blockUser,
  db,
  getSuspensionRemaining,
  isUserBlocked,
  isUserTemporarilySuspended,
  listBlockedUsers,
  recordInvalidLink,
  resetStuckJobs,
  suspendUserTemp,
  unblockUser,
} from './db';
import {
  addBugReportFx,
  countBugReportsLastDayFx,
  getEarliestBugReportTimeLastDayFx,
  getProfileRequestCooldownRemainingFx,
  getRecentHistoryFx,
  listBugReportsFx,
  recordProfileRequestFx,
  wasProfileRequestedRecentlyFx,
} from './db/effects';
import { t } from './lib/i18n';
import { saveUser } from './repositories/user-repository';
import { getStatusText } from './services/admin-stats';
import { scheduleDatabaseBackups } from './services/backup-service';
import {
  addProfileMonitor,
  CHECK_INTERVAL_HOURS,
  listUserMonitors,
  removeProfileMonitor,
  startMonitorLoop,
  userMonitorCount,
} from './services/monitor-service';
import {
  getQueueStatusForUser,
  handleNewTask,
  processQueue,
} from './services/queue-manager';

process.on('unhandledRejection', (reason, promise) => {
  console.error(
    'CRITICAL_ERROR: Unhandled Rejection at:',
    promise,
    'reason:',
    reason
  );
});
process.on('uncaughtException', (error, origin) => {
  console.error(
    'CRITICAL_ERROR: Uncaught Exception:',
    error,
    'origin:',
    origin
  );
});
console.log('Global error handlers have been attached.');

export const bot = new Telegraf<IContextBot>(BOT_TOKEN!);
const RESTART_COMMAND = 'restart';
const extraOptions: any = { link_preview_options: { is_disabled: true } };

// =============================
// Command definitions
// =============================
function getBaseCommands(locale: string) {
  return [
    { command: 'start', description: t(locale, 'cmd.start') },
    { command: 'help', description: t(locale, 'cmd.help') },
    { command: 'queue', description: t(locale, 'cmd.queue') },
    { command: 'profile', description: t(locale, 'cmd.profile') },
    { command: 'monitor', description: t(locale, 'cmd.monitor') },
    { command: 'unmonitor', description: t(locale, 'cmd.unmonitor') },
    { command: 'bugs', description: t(locale, 'cmd.bugs') },
  ];
}

function getAdminCommands(locale: string) {
  return [
    { command: 'users', description: t(locale, 'cmd.users') },
    { command: 'history', description: t(locale, 'cmd.history') },
    { command: 'block', description: t(locale, 'cmd.block') },
    { command: 'unblock', description: t(locale, 'cmd.unblock') },
    { command: 'blocklist', description: t(locale, 'cmd.blocklist') },
    { command: 'status', description: t(locale, 'cmd.status') },
    { command: 'restart', description: t(locale, 'cmd.restart') },
    { command: 'bugreport', description: t(locale, 'cmd.listbugs') },
    { command: 'bugs', description: t(locale, 'cmd.bugs') },
  ];
}

async function updateUserCommands(ctx: IContextBot, isAdmin: boolean) {
  const locale = ctx.from?.language_code || 'en';
  const commands = [...getBaseCommands(locale)];
  if (isAdmin) {
    commands.push(...getAdminCommands(locale));
  }
  await ctx.telegram.setMyCommands(commands, {
    scope: { type: 'chat', chat_id: ctx.chat!.id },
  });
}

const logPath = LOG_FILE;
const logDir = path.dirname(logPath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

bot.use(session());
bot.use(async (ctx, next) => {
  if (ctx.from?.is_bot) {
    if (ctx.from.id && ctx.from.id !== bot.botInfo?.id) {
      blockUser(String(ctx.from.id), true);
    }
    return;
  }
  if (ctx.from && isUserBlocked(String(ctx.from.id))) {
    return;
  }
  if (
    ctx.from &&
    ctx.from.id !== BOT_ADMIN_ID &&
    isUserTemporarilySuspended(String(ctx.from.id))
  ) {
    const remaining = getSuspensionRemaining(String(ctx.from.id));
    const m = Math.ceil(remaining / 60);
    try {
      await ctx.reply(
        `🚫 You are temporarily suspended for ${m} minute${m === 1 ? '' : 's'}.`
      );
    } catch {}
    return;
  }
  await next();
});
bot.use(async (ctx, next) => {
  const text =
    'message' in ctx && ctx.message && 'text' in ctx.message
      ? ctx.message.text
      : '';
  console.log(
    `[Update] from ${ctx.from?.id} type=${ctx.updateType} text=${text}`
  );
  await next();
});
bot.catch((error, ctx) => {
  console.error(`A global error occurred for chat ${ctx.chat?.id}:`, error);
  const logEntry =
    `[${new Date().toISOString()}] chat:${ctx.chat?.id} ` +
    (error instanceof Error ? error.stack || error.message : String(error)) +
    '\n';
  try {
    fs.appendFileSync(logPath, logEntry);
  } catch (error_) {
    console.error('Failed to write to log file', error_);
  }
  const locale = ctx.from?.language_code || 'en';
  ctx.reply(t(locale, 'error.unexpected')).catch(() => {});
});

function isActivated(userId: number): boolean {
  try {
    const user = db
      .prepare('SELECT 1 FROM users WHERE telegram_id = ?')
      .get(String(userId));
    return Boolean(user);
  } catch (error) {
    console.error(
      `[isActivated] Database check failed for user ${userId}:`,
      error
    );
    return false;
  }
}

// =========================================================================
//  COMMAND & EVENT HANDLERS
// =========================================================================

bot.start(async (ctx) => {
  await saveUser(ctx.from);
  const isAdmin = ctx.from.id === BOT_ADMIN_ID;
  const locale = ctx.from.language_code || 'en';
  const msg = t(locale, 'start.instructions');
  await ctx.reply(msg, { ...extraOptions, parse_mode: 'Markdown' });
  await updateUserCommands(ctx, isAdmin);
});

bot.command('help', async (ctx) => {
  const locale = ctx.from.language_code || 'en';
  let finalHelpText = t(locale, 'help.header') + '\n\n';
  finalHelpText += t(locale, 'help.general', {
    cmdStart: t(locale, 'cmd.start'),
    cmdHelp: t(locale, 'cmd.help'),
    cmdQueue: t(locale, 'cmd.queue'),
    cmdProfile: t(locale, 'cmd.profile'),
    cmdMonitor: t(locale, 'cmd.monitor'),
    cmdUnmonitor: t(locale, 'cmd.unmonitor'),
    cmdBugs: t(locale, 'cmd.bugs'),
  });

  const isAdmin = ctx.from.id === BOT_ADMIN_ID;

  if (isAdmin) {
    finalHelpText +=
      '\n' +
      t(locale, 'help.admin', {
        cmdUsers: t(locale, 'cmd.users'),
        cmdHistory: t(locale, 'cmd.history'),
        cmdBlock: t(locale, 'cmd.block'),
        cmdUnblock: t(locale, 'cmd.unblock'),
        cmdBlocklist: t(locale, 'cmd.blocklist'),
        cmdRestart: t(locale, 'cmd.restart'),
        cmdListbugs: t(locale, 'cmd.listbugs'),
      });
  }
  await ctx.reply(finalHelpText, { parse_mode: 'Markdown' });
  await updateUserCommands(ctx, isAdmin);
});

bot.command('queue', async (ctx) => {
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  const msg = await getQueueStatusForUser(String(ctx.from.id));
  await sendTemporaryMessage(bot, ctx.chat!.id, msg);
});

bot.command('profile', async (ctx) => {
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    return ctx.reply(t(locale, 'profile.usage'));
  }
  const input = args[0];
  const userId = String(ctx.from.id);
  const isAdmin = ctx.from.id === BOT_ADMIN_ID;
  const cooldown = isAdmin ? 0 : 2;

  if (
    await wasProfileRequestedRecentlyFx({
      telegram_id: userId,
      target_username: input,
      hours: cooldown,
    })
  ) {
    const remaining = await getProfileRequestCooldownRemainingFx({
      telegram_id: userId,
      target_username: input,
      hours: cooldown,
    });
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    return sendTemporaryMessage(
      bot,
      ctx.chat!.id,
      t(locale, 'profile.cooldown', {
        user: input,
        hours: cooldown,
        h,
        m,
      })
    );
  }

  await recordProfileRequestFx({ telegram_id: userId, target_username: input });
  await sendProfileMedia(ctx.chat!.id, input, ctx.from);
});

bot.command('monitor', async (ctx) => {
  const locale = ctx.from.language_code || 'en';
  const userId = String(ctx.from.id);
  const isAdmin = ctx.from.id === BOT_ADMIN_ID;
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    const list = listUserMonitors(userId);
    if (list.length === 0) {
      const limitMsg = t(locale, 'monitor.unlimited') + ' ';
      return ctx.reply(
        t(locale, 'monitor.usage', {
          limitMsg,
          hours: CHECK_INTERVAL_HOURS,
        })
      );
    }
    const msg = t(locale, 'monitor.list', {
      count: list.length,
      limit: '∞',
      list: list.map((m, i) => `${i + 1}. @${m.target_username}`).join('\n'),
      hours: CHECK_INTERVAL_HOURS,
    });
    return ctx.reply(msg);
  }
  const input = args[0];
  const username = input.replace(/^@/, '');
  // All users can now monitor unlimited profiles
  addProfileMonitor(userId, username);
  const remainingText = t(locale, 'monitor.unlimited');
  await ctx.reply(
    t(locale, 'monitor.started', { user: input, remaining: remainingText })
  );
});

bot.command('unmonitor', async (ctx) => {
  const locale = ctx.from.language_code || 'en';
  const userId = String(ctx.from.id);
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    const list = listUserMonitors(userId);
    if (list.length === 0) {
      return ctx.reply(t(locale, 'monitor.none'));
    }
    const msg = t(locale, 'monitor.current', {
      list: list.map((m, i) => `${i + 1}. @${m.target_username}`).join('\n'),
    });
    return ctx.reply(msg);
  }
  const inputUn = args[0];
  const username = inputUn.replace(/^@/, '');
  removeProfileMonitor(userId, username);
  await ctx.reply(t(locale, 'monitor.stopped', { user: inputUn }));
});

// --- Admin Commands ---

bot.command('status', async (ctx) => {
  if (ctx.from.id != BOT_ADMIN_ID) return;
  const text = getStatusText();
  await ctx.reply(text);
});

bot.command('restart', async (ctx) => {
  if (ctx.from.id != BOT_ADMIN_ID) return;
  const locale = ctx.from.language_code || 'en';
  await ctx.reply(t(locale, 'admin.confirmRestart'), {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t(locale, 'admin.restartButton'),
            callback_data: RESTART_COMMAND,
          },
        ],
      ],
    },
  });
});

// FIX: Restored full implementation for all admin commands.
bot.command('block', async (ctx) => {
  if (ctx.from.id != BOT_ADMIN_ID) return;
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  try {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) return ctx.reply(t(locale, 'admin.blockUsage'));
    let telegramId: string | undefined;
    if (args[0].startsWith('@')) {
      const row = db
        .prepare('SELECT telegram_id FROM users WHERE username = ?')
        .get(args[0].replace('@', '')) as { telegram_id?: string };
      if (!row?.telegram_id) return ctx.reply(t(locale, 'user.notFound'));
      telegramId = row.telegram_id;
    } else if (/^\d+$/.test(args[0])) {
      telegramId = args[0];
    } else {
      return ctx.reply(t(locale, 'argument.invalid'));
    }
    const row = db
      .prepare('SELECT is_bot FROM users WHERE telegram_id = ?')
      .get(telegramId!) as { is_bot?: number } | undefined;
    blockUser(telegramId!, row?.is_bot === 1);
    await ctx.reply(t(locale, 'block.success', { user: telegramId }));
  } catch (error) {
    console.error('Error in /block:', error);
    await ctx.reply(t(locale, 'error.generic'));
  }
});

bot.command('unblock', async (ctx) => {
  if (ctx.from.id != BOT_ADMIN_ID) return;
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  try {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) return ctx.reply(t(locale, 'admin.unblockUsage'));
    let telegramId: string | undefined;
    if (args[0].startsWith('@')) {
      const row = db
        .prepare('SELECT telegram_id FROM users WHERE username = ?')
        .get(args[0].replace('@', '')) as { telegram_id?: string };
      if (!row?.telegram_id) return ctx.reply(t(locale, 'user.notFound'));
      telegramId = row.telegram_id;
    } else if (/^\d+$/.test(args[0])) {
      telegramId = args[0];
    } else {
      return ctx.reply(t(locale, 'argument.invalid'));
    }
    unblockUser(telegramId!);
    await ctx.reply(t(locale, 'unblock.success', { user: telegramId }));
  } catch (error) {
    console.error('Error in /unblock:', error);
    await ctx.reply(t(locale, 'error.generic'));
  }
});

bot.command('blocklist', async (ctx) => {
  if (ctx.from.id != BOT_ADMIN_ID) return;
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  try {
    const rows = listBlockedUsers();
    if (rows.length === 0) return ctx.reply(t(locale, 'blocked.none'));
    let msg = t(locale, 'blocked.usersHeader', { count: rows.length }) + '\n';
    rows.forEach((u, i) => {
      const type = u.is_bot ? t(locale, 'label.bot') : t(locale, 'label.user');
      msg += `${i + 1}. ${u.telegram_id} [${type}] at ${new Date(
        u.blocked_at * 1000
      ).toLocaleDateString()}\n`;
    });
    await ctx.reply(msg);
  } catch (error) {
    console.error('Error in /blocklist:', error);
    await ctx.reply(t(locale, 'error.generic'));
  }
});

bot.command('users', async (ctx) => {
  if (ctx.from.id != BOT_ADMIN_ID) return;
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  try {
    const rows = db
      .prepare('SELECT telegram_id, username, is_premium, is_bot FROM users')
      .all() as any[];
    if (rows.length === 0) return ctx.reply(t(locale, 'users.none'));
    let msg = t(locale, 'users.listHeader', { count: rows.length }) + '\n';
    rows.forEach((u, i) => {
      const premiumLabel = u.is_premium
        ? t(locale, 'label.premium')
        : t(locale, 'label.free');
      const type = u.is_bot ? t(locale, 'label.bot') : t(locale, 'label.user');
      msg += `${i + 1}. ${
        u.username ? '@' + u.username : u.telegram_id
      } [${premiumLabel}, ${type}]`;
      msg += '\n';
    });
    await ctx.reply(msg);
  } catch (error) {
    console.error('Error in /users:', error);
    await ctx.reply(t(locale, 'error.generic'));
  }
});

bot.command('history', async (ctx) => {
  if (ctx.from.id != BOT_ADMIN_ID) return;
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  try {
    const rows = await getRecentHistoryFx(50);
    if (rows.length === 0) return ctx.reply(t(locale, 'history.none'));
    let msg = t(locale, 'history.listHeader') + '\n';
    rows.forEach((r: any, i: number) => {
      const date = new Date(r.enqueued_ts * 1000).toLocaleDateString();
      const user = r.username ? `@${r.username}` : r.telegram_id;
      const type = r.is_bot ? t(locale, 'label.bot') : t(locale, 'label.user');
      msg += `${i + 1}. ${user} [${type}] -> ${r.target_username} [${
        r.status
      }] ${date}\n`;
    });
    await ctx.reply(msg, { link_preview_options: { is_disabled: true } });
  } catch (error) {
    console.error('Error in /history:', error);
    await ctx.reply(t(locale, 'error.generic'));
  }
});

bot.command('bugreport', async (ctx) => {
  if (ctx.from.id !== BOT_ADMIN_ID) return;
  const locale = ctx.from.language_code || 'en';
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  try {
    const rows = await listBugReportsFx();
    if (rows.length === 0) return ctx.reply(t(locale, 'bugs.none'));
    let msg = t(locale, 'bugs.listHeader') + '\n';
    rows.forEach((b: any, i: number) => {
      const date = new Date(b.created_at * 1000).toLocaleDateString();
      const user = b.username ? `@${b.username}` : b.telegram_id;
      msg += `${i + 1}. ${user} - ${b.description} (${date})\n`;
    });
    await ctx.reply(msg);
  } catch (error) {
    console.error('Error in /bugreport:', error);
    await ctx.reply(t(locale, 'error.generic'));
  }
});

bot.command('bugs', async (ctx) => {
  const locale = ctx.from.language_code || 'en';
  const userId = String(ctx.from.id);
  const isAdmin = ctx.from.id === BOT_ADMIN_ID;
  if (!isActivated(ctx.from.id)) return ctx.reply(t(locale, 'msg.startFirst'));
  const args = ctx.message.text.split(' ').slice(1);

  if (args.length === 0) {
    return ctx.reply(t(locale, 'bug.usage'));
  }

  try {
    if (!isAdmin) {
      const limit = 3;
      const count = await countBugReportsLastDayFx(userId);
      if (count >= limit) {
        const earliest = await getEarliestBugReportTimeLastDayFx(userId);
        if (earliest) {
          const now = Math.floor(Date.now() / 1000);
          const remaining = earliest + 86400 - now;
          if (remaining > 0) {
            const h = Math.floor(remaining / 3600);
            const m = Math.floor((remaining % 3600) / 60);
            return sendTemporaryMessage(
              bot,
              ctx.chat!.id,
              t(locale, 'bug.cooldown', { h, m })
            );
          }
        }
      }
    }
    await addBugReportFx({
      telegram_id: userId,
      username: ctx.from.username,
      description: args.join(' '),
    });
    await ctx.reply(t(locale, 'bug.reported'));
  } catch (error) {
    console.error('Error in /bugs:', error);
    await ctx.reply(t(locale, 'error.generic'));
  }
});

// --- Handle button presses ---
export async function handleCallbackQuery(ctx: IContextBot) {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
  const data = ctx.callbackQuery.data;

  if (data === RESTART_COMMAND && ctx.from?.id == BOT_ADMIN_ID) {
    const locale = ctx.from?.language_code || 'en';
    await ctx.answerCbQuery(t(locale, 'admin.restarting'));
    try {
      await ctx.deleteMessage();
    } catch {}
    await ctx.telegram.sendMessage(BOT_ADMIN_ID, t(locale, 'admin.restarting'));
    process.exit();
  }

  if (data.includes('&')) {
    const [username, nextStoriesIds] = data.split('&');
    const user = ctx.from!;
    const task: UserInfo = {
      chatId: String(user.id),
      link: username,
      linkType: 'username',
      nextStoriesIds: nextStoriesIds ? JSON.parse(nextStoriesIds) : undefined,
      locale: user.language_code || '',
      user,
      initTime: Date.now(),
      isPremium: true, // All users are now treated as premium
      storyRequestType: 'paginated',
      isPaginated: true,
    };
    handleNewTask(task);
    try {
      const message = ctx.callbackQuery.message as any;
      const markup = message?.reply_markup?.inline_keyboard;
      if (markup) {
        const newKeyboard = markup
          .map((row: any[]) =>
            row.filter((btn: any) => btn.callback_data !== data)
          )
          .filter((row: any[]) => row.length > 0);
        await ctx.editMessageReplyMarkup(
          newKeyboard.length > 0 ? { inline_keyboard: newKeyboard } : undefined
        );
        if (newKeyboard.length === 0) {
          try {
            await ctx.deleteMessage();
          } catch {
            /* ignore */
          }
        }
      } else {
        await ctx.editMessageReplyMarkup(undefined);
      }
    } catch (error) {
      console.error('Failed to update inline keyboard:', error);
    }
    await ctx.answerCbQuery();
  }
}

bot.on('callback_query', handleCallbackQuery);

// --- Handle all other text messages ---
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  const locale = ctx.from.language_code || 'en';

  if (!isActivated(userId)) {
    const locale = ctx.from.language_code || 'en';
    return ctx.reply(t(locale, 'msg.botStart'));
  }

  if (userId == BOT_ADMIN_ID && text === RESTART_COMMAND) {
    return ctx.reply(t(locale, 'admin.confirmRestart'), {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: t(locale, 'admin.restartButton'),
              callback_data: RESTART_COMMAND,
            },
          ],
        ],
      },
    });
  }

  const isStoryLink = isValidStoryLink(text);
  const isUsername = text.startsWith('@') || text.startsWith('+');
  const looksLikeLink = /^https?:\/\//i.test(text) || text.includes('t.me/');

  if (isUsername || isStoryLink) {
    const user = ctx.from;
    const task: UserInfo = {
      chatId: String(ctx.chat.id),
      link: text,
      linkType: isStoryLink ? 'link' : 'username',
      locale: user.language_code || '',
      user,
      initTime: Date.now(),
      isPremium: true, // All users are now treated as premium
    };
    handleNewTask(task);
    return;
  }

  if (looksLikeLink && userId !== BOT_ADMIN_ID) {
    const count = recordInvalidLink(String(userId));
    if (count >= 5) {
      suspendUserTemp(String(userId), 3600);
      await ctx.reply(t(locale, 'invalidLink.suspended'));
    } else {
      const left = 5 - count;
      await ctx.reply(t(locale, 'invalidLink.warning', { count: left }));
    }
    return;
  }

  await ctx.reply(t(locale, 'msg.invalidInput'), extraOptions);
});

// =============================
// BOT LAUNCH & QUEUE STARTUP
// =============================

async function startApp() {
  console.log('[App] Initializing...');
  resetStuckJobs();
  await initUserbot();
  // FIX: Clarified the log message for consistency.
  console.log('[App] Kicking off initial queue processing...');
  processQueue();
  startMonitorLoop();
  scheduleDatabaseBackups();
  await bot.telegram.setMyCommands(getBaseCommands('en'));
  await bot.telegram.setMyCommands(
    [...getBaseCommands('en'), ...getAdminCommands('en')],
    { scope: { type: 'chat', chat_id: BOT_ADMIN_ID } }
  );
  bot.launch({ dropPendingUpdates: true }).then(() => {
    console.log(
      '✅ Telegram bot started successfully and is ready for commands.'
    );
  });
}

if (process.env.NODE_ENV !== 'test') {
  startApp();
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
