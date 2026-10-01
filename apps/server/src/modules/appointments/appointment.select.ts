export const appointmentInclude = {
  client: { select: { id: true, firstName: true, lastName: true, email: true } },
  specialist: {
    select: {
      id: true,
      specializationUk: true,
      specializationEn: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  service: {
    select: { id: true, nameUk: true, nameEn: true, durationMin: true, priceCents: true },
  },
} as const;
