export const appointmentInclude = {
  client: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
  specialist: {
    select: {
      id: true,
      specializationUk: true,
      specializationEn: true,
      photoUrl: true,
      user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  },
  service: {
    select: { id: true, nameUk: true, nameEn: true, durationMin: true, priceCents: true },
  },
} as const;
