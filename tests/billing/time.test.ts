import { describe, expect, it } from "vitest";
import {
  addOneCalendarMonthInIndia,
  getBillingDateKeys,
  getFirstDayLedgerKeys,
  getMonthlyAnniversaryOnOrAfterInIndia,
  getMonthlyCreditCycleInIndia,
  getNextMonthStartInIndia,
} from "@/lib/billing/time";

describe("billing calendar", () => {
  it("uses DD-MM-YYYY document IDs in Asia/Kolkata", () => {
    const keys = getBillingDateKeys(
      new Date("2026-07-27T10:00:00.000Z"),
    );

    expect(keys).toEqual({
      documentId: "27-07-2026",
      dateKey: "2026-07-27",
      monthKey: "2026-07",
    });
  });

  it("moves to the next day at India midnight", () => {
    expect(
      getBillingDateKeys(new Date("2026-07-31T18:29:59.000Z")).documentId,
    ).toBe("31-07-2026");
    expect(
      getBillingDateKeys(new Date("2026-07-31T18:30:00.000Z")).documentId,
    ).toBe("01-08-2026");
  });

  it("uses the first-day ledger for a monthly refresh", () => {
    expect(
      getFirstDayLedgerKeys(new Date("2026-08-17T10:00:00.000Z")),
    ).toEqual({
      documentId: "01-08-2026",
      dateKey: "2026-08-01",
      monthKey: "2026-08",
    });
  });

  it("calculates the next month start at 12 AM IST", () => {
    expect(
      getNextMonthStartInIndia(
        new Date("2026-07-27T10:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-07-31T18:30:00.000Z");
  });

  it("uses the subscription day for monthly credit cycles", () => {
    const cycle = getMonthlyCreditCycleInIndia({
      date: new Date("2026-07-30T10:00:00.000Z"),
      anchor: new Date("2027-07-30T10:00:00.000Z"),
    });

    expect(cycle.periodStart.toISOString()).toBe(
      "2026-07-29T18:30:00.000Z",
    );
    expect(cycle.nextRefreshAt.toISOString()).toBe(
      "2026-08-29T18:30:00.000Z",
    );
  });

  it("preserves a month-end anchor after February", () => {
    const february = getMonthlyCreditCycleInIndia({
      date: new Date("2027-02-28T10:00:00.000Z"),
      anchor: new Date("2027-01-31T10:00:00.000Z"),
    });
    const march = getMonthlyCreditCycleInIndia({
      date: new Date("2027-03-31T10:00:00.000Z"),
      anchor: 31,
    });

    expect(february.periodStart.toISOString()).toBe(
      "2027-02-27T18:30:00.000Z",
    );
    expect(february.nextRefreshAt.toISOString()).toBe(
      "2027-03-30T18:30:00.000Z",
    );
    expect(march.periodStart.toISOString()).toBe(
      "2027-03-30T18:30:00.000Z",
    );
  });

  it("finds the first anniversary on or after a migration boundary", () => {
    const minimum = addOneCalendarMonthInIndia(
      new Date("2026-07-31T18:30:00.000Z"),
    );
    const nextRefresh = getMonthlyAnniversaryOnOrAfterInIndia({
      date: minimum,
      anchor: new Date("2027-07-15T10:00:00.000Z"),
    });

    expect(minimum.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(nextRefresh.toISOString()).toBe("2026-09-14T18:30:00.000Z");
  });
});
