export interface UserRow {
  telegram_id?: string;
  username?: string;
  is_bot?: number;
  created_at?: string;
}

/**
 * All users now have access to all features - no premium restrictions
 * @param _telegramId Telegram user ID as a string (unused since all users have access).
 * @returns always true since all features are now free
 */
export const isUserPremium = (_telegramId: string): boolean => {
  return true; // All users have "premium" features now
};

/**
 * No-op function - premium features removed
 * @param _telegramId Telegram user ID (unused).
 * @param _username Optional username (unused).
 * @param _days Optional days (unused).
 */
export const addPremiumUser = (
  _telegramId: string,
  _username?: string,
  _days?: number
): void => {
  // No-op - all users have access to all features
};

/**
 * No-op function - premium features removed
 * @param _telegramId Telegram user ID (unused).
 */
export const removePremiumUser = (_telegramId: string): void => {
  // No-op - all users have access to all features
};

/**
 * No-op function - premium features removed
 * @param _telegramId Telegram user ID (unused).
 * @param _days Days to extend (unused).
 */
export const extendPremium = (_telegramId: string, _days: number): void => {
  // No-op - all users have access to all features
};

/**
 * Always returns Infinity since premium features are removed
 * @param _telegramId Telegram user ID (unused).
 * @returns Infinity since all users have unlimited access
 */
export const getPremiumDaysLeft = (_telegramId: string): number => {
  return Infinity; // All users have unlimited access
};

/**
 * Always returns true since free trial concept is removed
 * @param _telegramId Telegram user ID (unused).
 * @returns true since the concept of trials is removed
 */
export const hasUsedFreeTrial = (_telegramId: string): boolean => {
  return true; // No more trial system
};

/**
 * No-op function - free trial removed
 * @param _telegramId Telegram user ID (unused).
 */
export const grantFreeTrial = (_telegramId: string): void => {
  // No-op - all users have access to all features
};
