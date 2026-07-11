export interface BusyInterval { start: string; end: string }

export interface RecurringPersonalEvent {
  day: number;
  startTime: string | null;
  endTime: string | null;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function timeParts(value: string | null): [number, number] | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? [hour, minute] : null;
}

export function recurringBusy(
  events: RecurringPersonalEvent[],
  from: Date,
  to: Date,
): BusyInterval[] {
  const shifted = new Date(from.getTime() + JST_OFFSET_MS);
  let dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - JST_OFFSET_MS;
  const result: BusyInterval[] = [];
  while (dayStart < to.getTime()) {
    const jstDate = new Date(dayStart + JST_OFFSET_MS);
    const weekday = (jstDate.getUTCDay() + 6) % 7;
    for (const event of events.filter((candidate) => candidate.day === weekday)) {
      const startParts = timeParts(event.startTime);
      const endParts = timeParts(event.endTime);
      if (!startParts || !endParts) continue;
      const start = dayStart + startParts[0] * 3600000 + startParts[1] * 60000;
      const end = dayStart + endParts[0] * 3600000 + endParts[1] * 60000;
      if (start < to.getTime() && end > from.getTime()) {
        result.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
    dayStart += DAY_MS;
  }
  return result;
}

export function mergeBusy(intervals: BusyInterval[]): BusyInterval[] {
  const sorted = intervals
    .map((item) => ({ start: new Date(item.start), end: new Date(item.end) }))
    .filter((item) => Number.isFinite(item.start.getTime()) && item.end > item.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Array<{ start: Date; end: Date }> = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push(interval);
    else if (interval.end > previous.end) previous.end = interval.end;
  }
  return merged.map((item) => ({ start: item.start.toISOString(), end: item.end.toISOString() }));
}
