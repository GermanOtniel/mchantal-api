const BUSINESS_TZ = 'America/Mexico_City'

export function formatDateInTz(date: Date, timeZone = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return formatDateInTz(d)
}

export function daysBetweenInclusive(from: string, to: string): string[] {
  const days: string[] = []
  let current = from
  while (current <= to) {
    days.push(current)
    current = addDays(current, 1)
  }
  return days
}

export function diffDays(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00`).getTime()
  const end = new Date(`${to}T12:00:00`).getTime()
  return Math.round((end - start) / (1000 * 60 * 60 * 24))
}

export function todayInTz(timeZone = BUSINESS_TZ): string {
  return formatDateInTz(new Date(), timeZone)
}

export function yesterdayInTz(timeZone = BUSINESS_TZ): string {
  return addDays(todayInTz(timeZone), -1)
}

export function startOfWeekMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return formatDateInTz(d)
}

export function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

/** [start, end) UTC instants for a calendar day in business timezone */
export function dayBoundsInTz(
  dateStr: string,
  timeZone = BUSINESS_TZ
): { start: Date; end: Date } {
  return {
    start: zonedLocalDateTimeToUtc(dateStr, 0, 0, 0, timeZone),
    end: zonedLocalDateTimeToUtc(addDays(dateStr, 1), 0, 0, 0, timeZone),
  }
}

function zonedLocalDateTimeToUtc(
  dateStr: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second)

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(utcMs))

    const read = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0)

    const deltaMinutes =
      (year - read('year')) * 525_600 +
      (month - read('month')) * 43_200 +
      (day - read('day')) * 1_440 +
      (hour - read('hour')) * 60 +
      minute - read('minute') +
      (second - read('second')) / 60

    if (deltaMinutes === 0) break
    utcMs -= deltaMinutes * 60_000
  }

  return new Date(utcMs)
}

/** Offset in minutes: local = UTC + offsetMinutes */
export function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date)

  const tzName = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0

  const sign = match[1] === '+' ? 1 : -1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? '0')
  return sign * (hours * 60 + minutes)
}

/** Inicio del día calendario en la zona horaria del negocio, como instante UTC. */
export function startOfDayUtc(dateStr: string, timeZone = BUSINESS_TZ): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, anchor)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMinutes * 60 * 1000)
}

/** Fin exclusivo del día calendario en la zona horaria del negocio. */
export function endOfDayUtcExclusive(dateStr: string, timeZone = BUSINESS_TZ): Date {
  return startOfDayUtc(addDays(dateStr, 1), timeZone)
}

export function dayBoundsUtc(
  dateStr: string,
  timeZone = BUSINESS_TZ
): { start: Date; end: Date } {
  return {
    start: startOfDayUtc(dateStr, timeZone),
    end: endOfDayUtcExclusive(dateStr, timeZone),
  }
}