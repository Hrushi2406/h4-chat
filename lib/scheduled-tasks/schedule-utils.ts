const TIMEZONE_PREFIX = /^CRON_TZ=([^\s]+)\s+/;

export const DEFAULT_TASK_TIMEZONE = "Asia/Kolkata";

const TIMEZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
};

export const normalizeTaskTimezone = (timezone?: string) => {
  const trimmed = timezone?.trim() || DEFAULT_TASK_TIMEZONE;
  return TIMEZONE_ALIASES[trimmed] ?? trimmed;
};

export const withCronTimezone = (cron: string, timezone: string) => {
  const cleanCron = stripCronTimezone(cron).trim();
  return `CRON_TZ=${normalizeTaskTimezone(timezone)} ${cleanCron}`;
};

export const stripCronTimezone = (cron: string) =>
  cron.trim().replace(TIMEZONE_PREFIX, "");

export const extractCronTimezone = (cron: string) => {
  const match = cron.trim().match(TIMEZONE_PREFIX);
  return match?.[1];
};

// [min, max] for each of the 5 cron fields. Day-of-week allows 7 as Sunday.
const CRON_FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week
];

const isValidCronField = (field: string, min: number, max: number) => {
  if (!field) return false;

  return field.split(",").every((part) => {
    if (!part) return false;

    const [range, stepRaw, ...rest] = part.split("/");
    if (rest.length > 0) return false;

    if (stepRaw !== undefined) {
      const step = Number(stepRaw);
      if (!Number.isInteger(step) || step <= 0) return false;
    }

    if (range === "*") return true;
    if (!range) return false;

    const bounds = range.split("-");
    if (bounds.length > 2) return false;

    const nums = bounds.map((value) => Number(value));
    if (
      nums.some(
        (value) => !Number.isInteger(value) || value < min || value > max,
      )
    ) {
      return false;
    }

    if (nums.length === 2 && nums[0] > nums[1]) return false;

    return true;
  });
};

export const isValidCronExpression = (cron: string) => {
  const cleanCron = stripCronTimezone(cron);
  const parts = cleanCron.split(/\s+/);

  if (parts.length !== 5) {
    return false;
  }

  return parts.every((part, index) => {
    const [min, max] = CRON_FIELD_RANGES[index];
    return isValidCronField(part, min, max);
  });
};

export const normalizeTaskCron = ({
  cron,
  timezone,
}: {
  cron: string;
  timezone?: string;
}) => {
  const resolvedTimezone =
    normalizeTaskTimezone(timezone || extractCronTimezone(cron));
  const normalized = withCronTimezone(cron, resolvedTimezone);

  if (!isValidCronExpression(normalized)) {
    throw new Error("Enter a valid 5-field cron schedule");
  }

  return {
    cron: normalized,
    timezone: resolvedTimezone,
  };
};

export const buildDailyCron = ({
  hour,
  minute,
  timezone,
}: {
  hour: number;
  minute: number;
  timezone: string;
}) => withCronTimezone(`${minute} ${hour} * * *`, timezone);

export const buildWeeklyCron = ({
  dayOfWeek,
  hour,
  minute,
  timezone,
}: {
  dayOfWeek: number;
  hour: number;
  minute: number;
  timezone: string;
}) => withCronTimezone(`${minute} ${hour} * * ${dayOfWeek}`, timezone);

export const buildIntervalCron = ({
  everyHours,
  timezone,
}: {
  everyHours: number;
  timezone: string;
}) => withCronTimezone(`0 */${everyHours} * * *`, timezone);

export const getCronSummary = (cron: string, fallback?: string) => {
  const timezone = extractCronTimezone(cron);
  const cleanCron = stripCronTimezone(cron);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cleanCron.split(/\s+/);
  const suffix = timezone ? ` (${timezone})` : "";

  if (/^0 \*\/\d+ \* \* \*$/.test(cleanCron)) {
    return `Every ${cleanCron.split(" ")[1].replace("*/", "")} hours${suffix}`;
  }

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Every day at ${formatClock(hour, minute)}${suffix}`;
  }

  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    return `Every ${formatWeekday(dayOfWeek)} at ${formatClock(hour, minute)}${suffix}`;
  }

  return fallback || `${cleanCron}${suffix}`;
};

const formatClock = (hour: string, minute: string) => {
  const numericHour = Number(hour);
  const numericMinute = Number(minute);

  if (!Number.isFinite(numericHour) || !Number.isFinite(numericMinute)) {
    return `${hour}:${minute}`;
  }

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2024, 0, 1, numericHour, numericMinute));
};

const formatWeekday = (dayOfWeek: string) => {
  const day = Number(dayOfWeek);
  const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return labels[day] ?? `day ${dayOfWeek}`;
};
