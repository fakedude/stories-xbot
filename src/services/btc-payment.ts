// BTC payment functionality removed - all features are now free

import { IContextBot } from 'config/context-interface';
import type { Telegraf } from 'telegraf';

let botInstance: Telegraf<IContextBot> | null = null;

export function setBotInstance(b: Telegraf<IContextBot>): void {
  botInstance = b;
}

export interface PaymentCheckResult {
  invoice: null;
  unexpectedSenders?: string[];
}

// All BTC payment functions are now no-ops or return null

export async function getBtcPriceUsd(): Promise<number> {
  return 0;
}

export async function createInvoice(
  _userId: string,
  _expectedUsd: number
): Promise<null> {
  return null;
}

export async function checkPayment(
  _invoice: any,
  _checkStart = 0
): Promise<PaymentCheckResult> {
  return { invoice: null };
}

export async function verifyPaymentByTxid(_txid: string): Promise<null> {
  return null;
}

export function schedulePaymentCheck(_ctx: IContextBot): void {
  // No-op - payment checking removed
}

export function resumePendingChecks(): void {
  // No-op - payment checking removed
}
