/**
 * Push notification scaffold.
 *
 * This is a placeholder module. Real delivery will be wired up later once
 * the app is packaged as an .ipa (Apple Push Notifications) and once the
 * email provider is configured server-side.
 *
 * Contract:
 *   - registerPushToken(): call once after user opts in. On web this is a
 *     no-op; on iOS/Capacitor it will register with APNs and return a token.
 *   - scheduleExpenseReminders(): pure planner. Given active expenses with
 *     a due_day and notify_enabled, returns the upcoming reminders. The
 *     server-side cron / email sender will use the same shape.
 */

import type { Expense } from "./finance";

export type ScheduledReminder = {
  expenseId: string;
  name: string;
  amount: number;
  dueDate: Date;
  notifyOn: Date;
  leadDays: number;
};

export async function registerPushToken(): Promise<string | null> {
  // Web: nothing to register yet — service workers / push subscription can
  // be added here later. Native iOS build will replace this with a real
  // APNs registration call.
  if (typeof window === "undefined") return null;
  return null;
}

export function nextDueDate(dueDay: number, from: Date = new Date()): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const daysInThisMonth = new Date(y, m + 1, 0).getDate();
  const dayThis = Math.min(dueDay, daysInThisMonth);
  const thisMonth = new Date(y, m, dayThis);
  if (thisMonth >= new Date(y, m, from.getDate())) return thisMonth;
  const daysInNext = new Date(y, m + 2, 0).getDate();
  return new Date(y, m + 1, Math.min(dueDay, daysInNext));
}

export function scheduleExpenseReminders(expenses: Expense[], from: Date = new Date()): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  for (const e of expenses) {
    if (!e.notify_enabled || !e.due_day) continue;
    const dueDate = nextDueDate(e.due_day, from);
    const lead = e.notify_lead_days ?? 3;
    const notifyOn = new Date(dueDate);
    notifyOn.setDate(notifyOn.getDate() - lead);
    out.push({
      expenseId: e.id,
      name: e.name,
      amount: e.amount,
      dueDate,
      notifyOn,
      leadDays: lead,
    });
  }
  return out.sort((a, b) => a.notifyOn.getTime() - b.notifyOn.getTime());
}
