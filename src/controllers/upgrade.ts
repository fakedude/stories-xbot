import { IContextBot } from 'config/context-interface';
import { bot } from 'index';
import { sendTemporaryMessage } from 'lib';

/**
 * Handle the `/upgrade` command.
 * Premium features are now available to all users for free.
 */
export async function handleUpgrade(ctx: IContextBot): Promise<void> {
  await sendTemporaryMessage(
    bot,
    ctx.chat!.id,
    '🎉 Good news! Premium features are now free for everyone!\n\n' +
      'You no longer need to upgrade. All premium features including:\n' +
      '✅ Unlimited story downloads\n' +
      '✅ Profile monitoring\n' +
      '✅ No cooldowns\n\n' +
      'Are now available to all users at no cost. Just start using them!'
  );
}
