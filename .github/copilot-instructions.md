# GitHub Copilot Instructions for Telegram Stories Viewer Bot

## Project Overview

This is a **Telegram Stories Viewer Bot** that allows users to view Telegram stories anonymously using both a bot (Telegraf) and userbot (GramJS). The bot supports premium features, Bitcoin payments, profile monitoring, and story downloading with a sophisticated queue system.

## Architecture & Key Technologies

- **Framework**: Node.js with TypeScript
- **Bot Framework**: Telegraf.js for Telegram Bot API
- **Userbot**: GramJS for Telegram Client API (MTProto)
- **State Management**: Effector for business logic and effects
- **Database**: Better-SQLite3 for local data persistence
- **Payment**: Bitcoin integration with blockchain verification
- **Queue System**: Custom job queue with timeout handling
- **Internationalization**: Multi-language support (13 languages)
- **Testing**: Jest with comprehensive test coverage
- **Deployment**: Docker with PM2 process management

## Code Organization

### Directory Structure

```
src/
├── config/           # Configuration and setup
├── controllers/      # Business logic controllers
├── db/              # Database operations and effects
├── lib/             # Utility functions and helpers
├── locales/         # Translation files
├── repositories/    # Data access layer
├── services/        # Core business services
├── types/           # TypeScript type definitions
└── index.ts         # Main application entry point
```

### Key Patterns

#### 1. Effector Effects Pattern

Use `createEffect` for all async operations:

```typescript
export const getAllStoriesFx = createEffect(async (task: UserInfo) => {
  // Implementation
});
```

#### 2. Database Effects Layer

All database operations go through effects in `db/effects.ts`:

```typescript
export const enqueueDownloadFx = createEffect(
  async (params: {
    telegram_id: string;
    target_username: string;
    task_details: UserInfo;
  }): Promise<number> => {
    return db.enqueueDownload(
      params.telegram_id,
      params.target_username,
      params.task_details,
    );
  },
);
```

#### 3. Type Safety

Always use the centralized types from `types.ts`:

- `UserInfo` - Task information passed through the queue
- `DownloadQueueItem` - Queue item structure
- `MappedStoryItem` - Internal story representation
- `SendStoriesFxParams` - Parameters for story sending

#### 4. Error Handling

- Use try-catch blocks in effects
- Call `notifyAdmin()` for errors that need admin attention
- Use `sendTemporaryMessage()` for user-facing messages that auto-delete

#### 5. Internationalization

Always use the `t()` function for user-facing messages:

```typescript
import { t } from 'lib/i18n';
const locale = ctx.from.language_code || 'en';
await ctx.reply(t(locale, 'error.generic'));
```

## Core Components

### 1. Bot Commands Structure

- **Base Commands**: Available to all users (start, help, premium, etc.)
- **Premium Commands**: Monitor/unmonitor functionality
- **Admin Commands**: User management, statistics, system control

### 2. Queue System (`services/queue-manager.ts`)

- Handles story download requests with priority and rate limiting
- Implements timeout protection (10 minutes for regular, 5 for paginated)
- Supports cooldown periods (12h free, 2h premium, 0h admin)
- Uses database-backed persistence

### 3. Story Processing Pipeline

1. `get-stories.ts` - Fetch stories from Telegram
2. `download-stories.ts` - Download media content
3. `send-stories.ts` - Orchestrate sending to users
4. `send-{active,pinned,particular,paginated}-stories.ts` - Specialized senders

### 4. Premium System

- Free trial system
- Bitcoin payment verification
- Profile monitoring (5 profiles for premium, unlimited for admin)
- Reduced cooldowns and priority queue access

### 5. Userbot Integration

- Singleton pattern in `config/userbot.ts`
- Session management with automatic reconnection
- Error handling for auth issues

## Development Guidelines

### Command Implementation

When adding new commands:

1. Add to appropriate command list (`getBaseCommands`, `getPremiumCommands`, `getAdminCommands`)
2. Implement handler with proper authorization checks
3. Add internationalization keys to all locale files
4. Update command descriptions and help text

### Database Operations

1. Always use effects layer (`db/effects.ts`)
2. Create parameterized queries for safety
3. Handle database errors gracefully
4. Use transactions for multi-step operations

### Story Processing

1. Always check media availability before downloading
2. Respect Telegram's file size limits (50MB)
3. Implement proper pagination for large story sets
4. Use chunking for media groups (max 10 items)

### Error Handling Best Practices

```typescript
try {
  // Operation
} catch (error: any) {
  console.error('[Component] Error description:', error);
  notifyAdmin({ status: 'error', errorInfo: { cause: error }, task });
  await ctx.reply(t(locale, 'error.generic'));
  throw error; // Re-throw for queue management
}
```

### Testing Patterns

- Mock heavy dependencies (database, Telegram clients)
- Use in-memory SQLite for database tests
- Test error conditions and edge cases
- Mock external API calls

## Environment Configuration

Essential environment variables:

- `BOT_TOKEN` - Telegram bot token
- `USERBOT_API_ID`, `USERBOT_API_HASH` - Telegram API credentials
- `USERBOT_PHONE_NUMBER` - Phone number for userbot
- `BOT_ADMIN_ID` - Admin user Telegram ID
- Bitcoin wallet configuration (one of: `BTC_WALLET_ADDRESS`, `BTC_XPUB`, `BTC_YPUB`, `BTC_ZPUB`)

## Performance Considerations

- Use `sendTemporaryMessage()` to avoid chat spam
- Implement proper rate limiting for API calls
- Use database indexing for frequently queried fields
- Chunk large operations to avoid blocking

## Security Guidelines

- Validate all user inputs
- Use parameterized database queries
- Implement rate limiting and spam protection
- Block bot users automatically
- Sanitize file operations

## Common Patterns to Follow

### User Context Handling

```typescript
const locale = ctx.from?.language_code || 'en';
const userId = String(ctx.from.id);
const isAdmin = ctx.from.id === BOT_ADMIN_ID;
const isPremium = isUserPremium(userId);
```

### Database Effect Usage

```typescript
const result = await someEffectFx({ param1: value1, param2: value2 });
```

### Message Sending with Cleanup

```typescript
await sendTemporaryMessage(bot, chatId, message, options, delayMs);
```

### Admin Notifications

```typescript
notifyAdmin({
  status: 'info' | 'error' | 'start',
  task: currentTask,
  baseInfo: 'Description of event',
  errorInfo: { cause: error },
});
```

## When Implementing New Features

1. Follow the existing architectural patterns
2. Add appropriate TypeScript types
3. Implement proper error handling
4. Add internationalization support
5. Write tests for critical paths
6. Update documentation
7. Consider premium vs free user implications
8. Implement proper logging and monitoring

## Build & Deployment

- Build: `yarn build` (TypeScript compilation + alias resolution)
- Lint: `yarn lint` (ESLint with custom rules)
- Test: `yarn test` (Jest with path mapping)
- Production: Docker container with PM2 process management
