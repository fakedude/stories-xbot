import { IContextBot } from 'config/context-interface';
import { bot } from 'index';
import { sendTemporaryMessage } from 'lib';
import { MAX_MONITORS_PER_USER } from 'services/monitor-service';
import { isUserPremium } from 'services/premium-service';

/**
 * Handle the `/premium` command.
 * Shows upgrade info or notifies existing premium users.
 */
export async function handlePremium(ctx: IContextBot): Promise<void> {
  const userId = String(ctx.from!.id);
  if (isUserPremium(userId)) {
    await sendTemporaryMessage(
      bot,
      ctx.chat!.id,
      '✅ You already have Premium access.'
    );
    return;
  }
  await ctx.reply(
    '🌟 *Premium Access*\n\n' +
      'Premium users get:\n' +
      '✅ Unlimited story downloads\n' +
      `✅ Monitor up to ${MAX_MONITORS_PER_USER} users' active stories\n` +
      '✅ No cooldowns or waiting in queues\n\n' +
      'Run `/upgrade` to unlock Premium features.\n' +
      'You will receive a unique payment address. Invoices expire after one hour.',
    { parse_mode: 'Markdown' }
  );
}
