import type { DailyNoteEntry } from './workspace-types';

function padDatePart(value: number) {
  return value.toString().padStart(2, '0');
}

export function formatDailyDate(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

export function formatDailyMonth(date: Date) {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1)].join('-');
}

export function createDateFromDailyDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(year, month - 1, day);
}

export function createMonthFromDailyMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);

  return new Date(year, monthNumber - 1, 1);
}

export function getDailyContentDates(entries: DailyNoteEntry[]) {
  return new Set(
    entries
      .filter((entry) => entry.hasContent)
      .map((entry) => entry.date),
  );
}
