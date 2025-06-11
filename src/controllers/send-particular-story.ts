// src/controllers/send-particular-story.ts

// Corrected import path for downloadStories and mapStories
import { downloadStories, mapStories } from 'controllers/download-stories'; // <--- Corrected import path
import { notifyAdmin } from 'controllers/send-message'; // <--- Corrected import path
import { bot } from 'index'; // Corrected path to use tsconfig alias
import { sendTemporaryMessage } from 'lib';
import { Api } from 'telegram';
// CORRECTED: Import types from your central types.ts file
import {
  MappedStoryItem,
  NotifyAdminParams,
  SendParticularStoryArgs,
  UserInfo,
} from 'types'; // <--- Corrected import path & added MappedStoryItem, NotifyAdminParams

/**
 * Sends a particular story to the user.
 * @param story - The story item to send.
 * @param task  - The user/task information.
 */
export async function sendParticularStory({
  story,
  task,
}: SendParticularStoryArgs) {
  // <--- Using the imported SendParticularStoryArgs
  // `mapStories` expects an array, so pass the single story in an array.
  const mapped: MappedStoryItem[] = mapStories([story]); // <--- Explicitly typed mapped to MappedStoryItem[]

  try {
    // Notify user that download is starting
    await sendTemporaryMessage(bot, task.chatId, '⏳ Downloading...').catch(
      (error) => {
        console.error(
          `[sendParticularStory] Failed to send 'Downloading' message to ${task.chatId}:`,
          error
        );
      }
    );

    // Actually download the story (media file to buffer)
    await downloadStories(mapped, 'active'); // 'active' is a string literal, ok.

    const singleStory: MappedStoryItem = mapped[0]; // <--- Explicitly typed singleStory

    if (singleStory?.buffer) {
      // <--- Added check for singleStory existence
      // Notify user that upload is starting
      await sendTemporaryMessage(
        bot,
        task.chatId,
        '⏳ Uploading to Telegram...'
      ).catch((error) => {
        console.error(
          `[sendParticularStory] Failed to send 'Uploading' message to ${task.chatId}:`,
          error
        );
      });

      // Send the media group (single file as an array)
      await bot.telegram.sendMediaGroup(task.chatId, [
        {
          media: { source: singleStory.buffer },
          type: singleStory.mediaType, // `mediaType` is already 'photo' | 'video' from MappedStoryItem
          caption:
            `${singleStory.caption ? `${singleStory.caption}\n` : ''}` +
            `\n📅 Post date: ${singleStory.date.toUTCString()}`,
        },
      ]);
    } else {
      // Notify user if download failed
      await bot.telegram
        .sendMessage(task.chatId, '❌ Could not retrieve the requested story.')
        .catch((error) => {
          console.error(
            `[sendParticularStory] Failed to notify ${task.chatId} about retrieval error:`,
            error
          );
        });
    }

    // Notify admin for monitoring
    notifyAdmin({
      status: 'info',
      baseInfo: `📥 Particular story uploaded to user!`,
    } as NotifyAdminParams); // <--- Added type assertion for notifyAdmin params
  } catch (error) {
    // <--- Error can be 'unknown' or 'any' if not specified
    notifyAdmin({
      status: 'error',
      task,
      errorInfo: { cause: error },
    } as NotifyAdminParams); // <--- Added type assertion for notifyAdmin params
    console.error(
      '[sendParticularStory] Error occurred while sending story:',
      error
    );
    try {
      await bot.telegram
        .sendMessage(
          task.chatId,
          'An error occurred while sending this story. The admin has been notified.'
        )
        .catch((error_) => {
          console.error(
            `[sendParticularStory] Failed to notify ${task.chatId} about general error:`,
            error_
          );
        });
    } catch (_) {
      /* ignore */
    }
    throw error; // Essential for Effector's .fail to trigger
  }
  // No more Effector event triggers, just let queue logic handle cleanup!
}
