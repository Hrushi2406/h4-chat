import { BILLING_TIMEZONE } from "@/lib/billing/config";

const indiaFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BILLING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const getParts = (date: Date) => {
  const values = Object.fromEntries(
    indiaFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
};

const atIndiaMidnight = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));

const shiftMonth = (year: number, month: number, offset: number) => {
  const monthIndex = year * 12 + month - 1 + offset;
  return {
    year: Math.floor(monthIndex / 12),
    month: (monthIndex % 12) + 1,
  };
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const anniversaryInMonth = (
  year: number,
  month: number,
  anchorDay: number,
) =>
  atIndiaMidnight(
    year,
    month,
    Math.min(anchorDay, daysInMonth(year, month)),
  );

export const getBillingDateKeys = (date = new Date()) => {
  const { year, month, day } = getParts(date);
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return {
    documentId: `${dd}-${mm}-${yyyy}`,
    dateKey: `${yyyy}-${mm}-${dd}`,
    monthKey: `${yyyy}-${mm}`,
  };
};

export const getFirstDayLedgerKeys = (date = new Date()) => {
  const { year, month } = getParts(date);
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");

  return {
    documentId: `01-${mm}-${yyyy}`,
    dateKey: `${yyyy}-${mm}-01`,
    monthKey: `${yyyy}-${mm}`,
  };
};

// India has a fixed UTC+05:30 offset and does not observe daylight saving time.
export const getNextMonthStartInIndia = (date = new Date()) => {
  const { year, month } = getParts(date);
  return new Date(Date.UTC(year, month, 1, -5, -30, 0, 0));
};

export const getCurrentMonthStartInIndia = (date = new Date()) => {
  const { year, month } = getParts(date);
  return new Date(Date.UTC(year, month - 1, 1, -5, -30, 0, 0));
};

export const getMonthlyCreditCycleInIndia = ({
  date = new Date(),
  anchor,
}: {
  date?: Date;
  anchor: Date | number;
}) => {
  const current = getParts(date);
  const anchorDay = typeof anchor === "number" ? anchor : getParts(anchor).day;
  let cycleMonth = {
    year: current.year,
    month: current.month,
  };
  let periodStart = anniversaryInMonth(
    cycleMonth.year,
    cycleMonth.month,
    anchorDay,
  );

  if (periodStart.getTime() > date.getTime()) {
    cycleMonth = shiftMonth(cycleMonth.year, cycleMonth.month, -1);
    periodStart = anniversaryInMonth(
      cycleMonth.year,
      cycleMonth.month,
      anchorDay,
    );
  }

  const nextMonth = shiftMonth(cycleMonth.year, cycleMonth.month, 1);
  return {
    periodStart,
    nextRefreshAt: anniversaryInMonth(
      nextMonth.year,
      nextMonth.month,
      anchorDay,
    ),
  };
};

export const addOneCalendarMonthInIndia = (date: Date) => {
  const current = getParts(date);
  const nextMonth = shiftMonth(current.year, current.month, 1);
  return anniversaryInMonth(nextMonth.year, nextMonth.month, current.day);
};

export const getMonthlyAnniversaryOnOrAfterInIndia = ({
  date,
  anchor,
}: {
  date: Date;
  anchor: Date | number;
}) => {
  const current = getParts(date);
  const anchorDay = typeof anchor === "number" ? anchor : getParts(anchor).day;
  const candidate = anniversaryInMonth(
    current.year,
    current.month,
    anchorDay,
  );
  if (candidate.getTime() >= date.getTime()) return candidate;

  const nextMonth = shiftMonth(current.year, current.month, 1);
  return anniversaryInMonth(nextMonth.year, nextMonth.month, anchorDay);
};

export const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate(): Date }).toDate();
  }
  return null;
};
