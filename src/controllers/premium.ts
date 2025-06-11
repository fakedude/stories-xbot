import { IContextBot } from 'config/context-interface';
import { bot } from 'index';
import { sendTemporaryMessage } from 'lib';

/**
 * Handle the `/premium` command.
 * Premium features are now available to all users for free.
 */
export async function handlePremium(ctx: IContextBot): Promise<void> {
  await sendTemporaryMessage(
    bot,
    ctx.chat!.id,
    '🎉 Great news! All premium features are now available to everyone for free!\n\n' +
      '✅ Unlimited story downloads\n' +
      '✅ Monitor user profiles\n' +
      '✅ No cooldowns or waiting in queues\n\n' +
      'Just start using the bot - no upgrade needed!'
  );
}
