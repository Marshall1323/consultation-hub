export const schedulingConfig = {
  timeZone: process.env.SYSTEM_TIME_ZONE ?? "Europe/Kyiv",
  minimumLeadMinutes: Number(process.env.BOOKING_LEAD_MINUTES ?? 60),
  bookingHorizonDays: Number(process.env.BOOKING_HORIZON_DAYS ?? 60),
  cancellationLeadMinutes: Number(process.env.CANCELLATION_LEAD_MINUTES ?? 120),
} as const;
