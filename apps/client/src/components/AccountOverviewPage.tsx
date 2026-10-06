import { type CSSProperties, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../lib/auth-api";
import { getMyAppointments, type Appointment } from "../lib/scheduling-api";

type Locale = "uk" | "en";

type Props = {
  token: string;
  user: AuthUser;
  locale: Locale;
  onNavigate: (page: "home" | "dashboard" | "specialists" | "booking" | "sessions" | "settings", search?: string) => void;
};

const monthFormatter = (locale: Locale) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { month: "long" });
const dateFormatter = (locale: Locale) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "long" });
const timeFormatter = (locale: Locale) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { hour: "2-digit", minute: "2-digit" });

export const AccountOverviewPage = ({ token, user, locale, onNavigate }: Props) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMyAppointments(token)
      .then(({ appointments: loaded }) => { if (active) setAppointments(loaded); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const now = useMemo(() => new Date(), []);
  const upcoming = useMemo(() => appointments
    .filter((item) => item.status !== "CANCELLED" && item.status !== "COMPLETED" && new Date(item.endsAt) > now)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)), [appointments, now]);
  const next = upcoming[0] ?? null;
  const monthItems = appointments.filter((item) => {
    const date = new Date(item.startsAt);
    return item.status !== "CANCELLED" && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const completed = monthItems.filter((item) => item.status === "COMPLETED" || new Date(item.endsAt) < now).length;
  const pending = monthItems.filter((item) => item.status === "PENDING" && new Date(item.endsAt) > now).length;
  const progress = monthItems.length ? Math.round((completed / monthItems.length) * 100) : 0;

  const openAppointment = (id: string) => onNavigate("sessions", `?appointmentId=${encodeURIComponent(id)}`);
  const copy = locale === "uk" ? {
    greeting: `Добрий день, ${user.firstName}`,
    subtitle: "Ось що заплановано на найближчий час",
    settings: "Налаштування",
    next: "Наступна зустріч", details: "Деталі зустрічі", join: "Приєднатися", noMeeting: "Найближчих сеансів немає",
    noMeetingText: "Оберіть спеціаліста та зручний час — запис з’явиться тут.", book: "Новий запис",
    thisMonth: "Цього місяця", meetings: "зустрічей", done: "завершено", waiting: "очікують",
    myBookings: "Найближчі записи", viewAll: "Переглянути всі", empty: "Запланованих сеансів поки немає.",
    quick: "Швидкі дії", calendar: "Календар", support: "Підтримка", unavailable: "Буде доступно згодом",
    pending: "Очікує підтвердження", confirmed: "Підтверджено", loadError: "Не вдалося завантажити записи.", retry: "Спробувати ще раз",
  } : {
    greeting: `Good afternoon, ${user.firstName}`,
    subtitle: "Here is what is planned for the near future",
    settings: "Settings",
    next: "Next appointment", details: "Appointment details", join: "Join", noMeeting: "No upcoming sessions",
    noMeetingText: "Choose a specialist and a convenient time — the booking will appear here.", book: "New booking",
    thisMonth: "This month", meetings: "appointments", done: "completed", waiting: "pending",
    myBookings: "Upcoming bookings", viewAll: "View all", empty: "There are no scheduled sessions yet.",
    quick: "Quick actions", calendar: "Calendar", support: "Support", unavailable: "Coming soon",
    pending: "Awaiting confirmation", confirmed: "Confirmed", loadError: "Could not load appointments.", retry: "Try again",
  };

  return <main className="overview-shell overview-shell--standalone" id="top">
    <section className="overview-main">
      <header className="overview-topbar">
        <div><h1>{copy.greeting}</h1><p>{copy.subtitle}</p></div>
      </header>

      {error && <div className="overview-error" role="alert">{copy.loadError}<button type="button" onClick={() => window.location.reload()}>{copy.retry}</button></div>}
      <div className="overview-grid">
        <section className="next-session-card">
          {loading ? <div className="overview-skeleton" /> : next ? <>
            <div className="next-session-card__meta"><span>{copy.next}</span><small>{dateFormatter(locale).format(new Date(next.startsAt))}</small></div>
            <div className="next-session-card__body">
              <div>
                <time>{dateFormatter(locale).format(new Date(next.startsAt))} · {timeFormatter(locale).format(new Date(next.startsAt))}</time>
                <h2>{locale === "uk" ? next.service.nameUk : next.service.nameEn}</h2>
                <p>{next.specialist.user.firstName} {next.specialist.user.lastName} · {locale === "uk" ? next.specialist.specializationUk : next.specialist.specializationEn}</p>
              </div>
              <div className="next-session-card__time"><strong>{timeFormatter(locale).format(new Date(next.startsAt))}</strong><span>{next.service.durationMin} {locale === "uk" ? "хвилин" : "minutes"}</span></div>
            </div>
            <div className="next-session-card__actions">
              <button className="overview-button overview-button--accent" type="button" title={copy.unavailable}>{copy.join}</button>
              <button className="overview-button overview-button--ghost" type="button" onClick={() => openAppointment(next.id)}>{copy.details}</button>
              <span className={next.status === "PENDING" ? "overview-status is-pending" : "overview-status"}>{next.status === "PENDING" ? copy.pending : copy.confirmed}</span>
            </div>
          </> : <div className="next-session-card__empty"><span>○</span><h2>{copy.noMeeting}</h2><p>{copy.noMeetingText}</p><button className="overview-button overview-button--accent" type="button" onClick={() => onNavigate("booking")}>{copy.book}</button></div>}
        </section>

        <section className="month-summary">
          <div className="month-summary__title"><strong>{monthFormatter(locale).format(now)}</strong><span aria-hidden="true">□</span></div>
          <div className="month-ring" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}><div><strong>{monthItems.length}</strong><span>{copy.meetings}</span></div></div>
          <div className="month-summary__stats"><p><strong>{completed}</strong><span>{copy.done}</span></p><p><strong>{pending}</strong><span>{copy.waiting}</span></p></div>
        </section>

        <section className="overview-list-card">
          <div className="overview-section-head"><h2>{copy.myBookings}</h2><button type="button" onClick={() => onNavigate("sessions")}>{copy.viewAll} →</button></div>
          {loading ? <><div className="overview-row-skeleton" /><div className="overview-row-skeleton" /></> : upcoming.length ? upcoming.slice(0, 3).map((item) => {
            const date = new Date(item.startsAt);
            return <button className="overview-appointment" type="button" key={item.id} onClick={() => openAppointment(item.id)}>
              <span className="overview-date"><strong>{date.getDate()}</strong><small>{monthFormatter(locale).format(date).slice(0, 3)}</small></span>
              <span className="overview-appointment__copy"><strong>{locale === "uk" ? item.service.nameUk : item.service.nameEn}</strong><small>{item.specialist.user.firstName} {item.specialist.user.lastName}</small></span>
              <time>{timeFormatter(locale).format(date)}</time><span aria-hidden="true">→</span>
            </button>;
          }) : <div className="overview-empty-list"><p>{copy.empty}</p><button type="button" onClick={() => onNavigate("booking")}>{copy.book}</button></div>}
        </section>

        <section className="quick-actions-card">
          <h2>{copy.quick}</h2>
          <div>
            <button className="is-accent" type="button" onClick={() => onNavigate("booking")}><span>＋</span>{copy.book}</button>
            <button type="button" onClick={() => onNavigate("sessions")}><span>▦</span>{copy.calendar}</button>
            <button type="button" title={copy.unavailable}><span>?</span>{copy.support}</button>
          </div>
        </section>
      </div>
    </section>
  </main>;
};
