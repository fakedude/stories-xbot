import { Userbot } from 'config/userbot';
import { notifyAdmin } from 'controllers/send-message';
import { bot } from 'index';
import { chunkArray, sendTemporaryMessage } from 'lib';
import { User } from 'telegraf/typings/core/types/typegram';
import { Api } from 'telegram';
// No need for the private _downloadPhoto helper; use downloadMedia instead

/**
 * Download and send profile photos and videos for a given username or phone number.
 * Sends up to LIMIT items as a media group.
 *
 * @param chatId - ID of the chat to send media to
 * @param input - Username or phone number to look up
 * @param user - Telegram user requesting the media (for admin audit)
 * @param limit - Optional limit on number of items to fetch
 */
export async function sendProfileMedia(
  chatId: number | string,
  input: string,
  user?: User,
  limit?: number
) {
  try {
    const client = await Userbot.getInstance();
    const entity = await client.getEntity(input);

    const photos: Api.Photo[] = [];
    let offset = 0;
    const requestLimit = 100;
    while (true) {
      const batchLimit =
        limit !== undefined
          ? Math.min(requestLimit, limit - photos.length)
          : requestLimit;
      if (batchLimit <= 0) break;
      const result = (await client.invoke(
        new Api.photos.GetUserPhotos({
          userId: entity,
          offset,
          limit: batchLimit,
        })
      )) as Api.photos.Photos;
      const batch = 'photos' in result ? result.photos : [];
      photos.push(
        ...batch.filter((p): p is Api.Photo => p instanceof Api.Photo)
      );
      if (batch.length < batchLimit) break;
      offset += batch.length;
      if (limit !== undefined && photos.length >= limit) break;
    }
    if (photos.length === 0) {
      await bot.telegram.sendMessage(chatId, 'No profile media found.');
      return;
    }

    const sendAlbum = [] as {
      media: { source: Buffer };
      type: 'photo' | 'video';
    }[];
    for (const photo of photos.slice(0, limit ?? photos.length)) {
      if (!(photo instanceof Api.Photo)) continue;
      try {
        const buffer = (await client.downloadMedia(photo as any)) as Buffer;
        if (Buffer.isBuffer(buffer)) {
          const isVideo =
            'videoSizes' in photo &&
            Array.isArray((photo as any).videoSizes) &&
            (photo as any).videoSizes.length > 0;
          sendAlbum.push({
            media: { source: buffer },
            type: isVideo ? 'video' : 'photo',
          });
        }
      } catch (error) {
        console.error('[sendProfileMedia] Error downloading media:', error);
      }
    }

    if (sendAlbum.length > 0) {
      const albums = chunkArray(sendAlbum, 10);
      for (const album of albums) {
        await bot.telegram.sendMediaGroup(chatId, album);
      }
      await sendTemporaryMessage(
        bot,
        chatId,
        `📸 Sent ${sendAlbum.length} profile media item(s) of ${input}`
      );
      notifyAdmin({
        status: 'info',
        baseInfo: `📸 Sent ${sendAlbum.length} profile media item(s) of ${input}`,
        task: { chatId: String(chatId), user } as any,
      });
    } else {
      await bot.telegram.sendMessage(
        chatId,
        'Failed to download profile media.'
      );
    }
  } catch (error) {
    console.error('[sendProfileMedia] Error:', error);
    notifyAdmin({ status: 'error', errorInfo: { cause: error } });
    await bot.telegram.sendMessage(chatId, 'Error retrieving profile media.');
  }
}

export default sendProfileMedia;
