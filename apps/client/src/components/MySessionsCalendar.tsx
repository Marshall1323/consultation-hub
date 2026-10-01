import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../lib/auth-api";
import { cancelAppointment, getMyAppointments, updateSpecialistAppointment, type Appointment } from "../lib/scheduling-api";

type Props = { token: string; user: AuthUser; locale: "uk" | "en" };
type Filter = "all" | "attending" | "hosting";

const kyivDateKey = (value: string | Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);

export const MySessionsCalendar = ({ token, user, locale }: Props) => {
  const uk = locale === "uk";
  const canHost = user.role === "SPECIALIST";
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [selectedDayAppointment, setSelectedDayAppointment] = useState<Appointment | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const text = uk ? {
    eyebrow: "Особистий календар", title: "Мої сеанси", subtitle: "Усі сеанси, на які ви записані або які проводите.", clientSubtitle: "Усі консультації, на які ви записані.",
    all: "Усі", attending: "Я записаний", hosting: "Я проводжу", previous: "Попередній місяць", next: "Наступний місяць", today: "Сьогодні",
    empty: "У цьому місяці сеансів немає.", details: "Деталі сеансу", service: "Послуга", date: "Дата", specialist: "Спеціаліст", client: "Клієнт", status: "Статус", price: "Вартість",
    cancel: "Скасувати", complete: "Завершити", close: "Закрити", youHost: "Ви проводите", youAttend: "Ви записані", more: "ще",
    daySessions: "Сеанси на цей день", chooseSession: "Оберіть сеанс, щоб переглянути деталі", duration: "Тривалість",
  } : {
    eyebrow: "Personal calendar", title: "My sessions", subtitle: "Every session you attend or provide.", clientSubtitle: "Every consultation you are booked to attend.",
    all: "All", attending: "I attend", hosting: "I provide", previous: "Previous month", next: "Next month", today: "Today",
    empty: "There are no sessions this month.", details: "Session details", service: "Service", date: "Date", specialist: "Specialist", client: "Client", status: "Status", price: "Price",
    cancel: "Cancel", complete: "Complete", close: "Close", youHost: "You provide", youAttend: "You attend", more: "more",
    daySessions: "Sessions on this day", chooseSession: "Choose a session to view its details", duration: "Duration",
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await getMyAppointments(token); setAppointments(result.appointments); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const isHosting = (appointment: Appointment) => appointment.specialist.user.id === user.id;
  const filtered = useMemo(() => appointments.filter((item) => {
    if (filter === "hosting") return isHosting(item);
    if (filter === "attending") return item.client.id === user.id;
    return true;
  }), [appointments, filter, user.id]);

  const firstGridDate = useMemo(() => {
    const first = new Date(month);
    const weekday = first.getDay() || 7;
    first.setDate(first.getDate() - weekday + 1);
    return first;
  }, [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDate); date.setDate(date.getDate() + index); return date;
  }), [firstGridDate]);
  const monthAppointments = filtered.filter((item) => {
    return kyivDateKey(item.startsAt).slice(0, 7) === `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const appointmentsByDay = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    for (const appointment of filtered) {
      const key = kyivDateKey(appointment.startsAt);
      const items = grouped.get(key) ?? [];
      items.push(appointment);
      grouped.set(key, items);
    }
    for (const items of grouped.values()) items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return grouped;
  }, [filtered]);

  const changeStatus = async (appointment: Appointment, action: "cancel" | "complete") => {
    setLoading(true); setMessage("");
    try {
      if (isHosting(appointment)) await updateSpecialistAppointment(token, appointment.id, action === "complete" ? "COMPLETED" : "CANCELLED");
      else await cancelAppointment(token, appointment.id);
      setSelected(null); setSelectedDayAppointment(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); setLoading(false); }
  };

  const monthTitle = new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { month: "long", year: "numeric" }).format(month);
  const weekdayNames = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { weekday: "short" }).format(new Date(2026, 8, 28 + index)));
  const dateTime = (value: string) => new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Kyiv" }).format(new Date(value));
  const dateOnly = (value: string) => new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "long", timeZone: "Europe/Kyiv" }).format(new Date(value));
  const time = (value: string) => new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(new Date(value));
  const timeRange = (appointment: Appointment) => `${time(appointment.startsAt)}–${time(appointment.endsAt)}`;
  const duration = (appointment: Appointment) => Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60_000);
  const dayAppointments = openDayKey ? appointmentsByDay.get(openDayKey) ?? [] : [];
  const openDay = (key: string) => { setOpenDayKey(key); setSelectedDayAppointment(null); };
  const closeDay = () => { setOpenDayKey(null); setSelectedDayAppointment(null); };
  const status = { PENDING: uk ? "Очікує" : "Pending", CONFIRMED: uk ? "Підтверджено" : "Confirmed", CANCELLED: uk ? "Скасовано" : "Cancelled", COMPLETED: uk ? "Завершено" : "Completed" } as const;

  useEffect(() => {
    if (!openDayKey) return;
    document.body.classList.add("modal-open");
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDay(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.classList.remove("modal-open"); window.removeEventListener("keydown", closeOnEscape); };
  }, [openDayKey]);

  return <section className="sessions-page">
    <header className="sessions-heading"><div><h1 className="sessions-title-compact">{text.eyebrow}</h1><p className="sessions-title-copy">{canHost ? text.subtitle : text.clientSubtitle}</p></div>{canHost && <div className="sessions-filters">{(["all", "attending", "hosting"] as Filter[]).map((item) => <button type="button" className={filter === item ? "is-selected" : ""} key={item} onClick={() => setFilter(item)}>{text[item]}</button>)}</div>}</header>
    <div className="sessions-calendar-shell">
      <div className="sessions-calendar-main">
        <div className="sessions-toolbar"><h2>{monthTitle}</h2><div><button aria-label={text.previous} onClick={() => setMonth((current) => addMonths(current, -1))}>←</button><button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12))}>{text.today}</button><button aria-label={text.next} onClick={() => setMonth((current) => addMonths(current, 1))}>→</button></div></div>
        {message && <p className="booking-feedback">{message}</p>}
        <div className="month-calendar"><div className="month-weekdays">{weekdayNames.map((day) => <span key={day}>{day}</span>)}</div><div className="month-days">{days.map((date) => { const key = kyivDateKey(date); const events = appointmentsByDay.get(key) ?? []; const inMonth = date.getMonth() === month.getMonth(); const isToday = key === kyivDateKey(new Date()); return <div className={`${inMonth ? "month-day" : "month-day is-outside"}${isToday ? " is-today" : ""}`} key={key}><span className="month-day__number">{date.getDate()}</span><div className="month-events">{events.slice(0, 3).map((item) => <button type="button" key={item.id} onClick={() => setSelected(item)}><strong>{timeRange(item)}</strong><span>{uk ? item.service.nameUk : item.service.nameEn}</span></button>)}{events.length > 3 && <button type="button" className="month-events__more" onClick={() => openDay(key)}>+{events.length - 3} {text.more}</button>}</div></div>; })}</div></div>
        <div className="sessions-agenda">{loading ? <p>Loading…</p> : monthAppointments.length === 0 ? <p>{text.empty}</p> : monthAppointments.map((item) => <button type="button" key={item.id} onClick={() => setSelected(item)}><span><strong>{Number(kyivDateKey(item.startsAt).slice(-2))}</strong>{new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { month: "short", timeZone: "Europe/Kyiv" }).format(new Date(item.startsAt))}</span><div><strong>{uk ? item.service.nameUk : item.service.nameEn}</strong><small>{dateTime(item.startsAt)} · {timeRange(item)} · {isHosting(item) ? text.youHost : text.youAttend}</small></div></button>)}</div>
      </div>
      <aside className={selected ? "session-details" : "session-details is-empty"}>
        {!selected ? <div className="session-details__empty"><span>○</span><h3>{text.details}</h3><p>{uk ? "Натисніть на сеанс у календарі." : "Select a session in the calendar."}</p></div> : <><div className="session-details__heading"><div><p className="eyebrow">{isHosting(selected) ? text.youHost : text.youAttend}</p><h3>{uk ? selected.service.nameUk : selected.service.nameEn}</h3></div><button aria-label={text.close} onClick={() => setSelected(null)}>×</button></div><dl><div><dt>{text.date}</dt><dd>{dateOnly(selected.startsAt)}</dd></div><div><dt>{text.duration}</dt><dd>{timeRange(selected)} · {duration(selected)} min</dd></div><div><dt>{isHosting(selected) ? text.client : text.specialist}</dt><dd>{isHosting(selected) ? `${selected.client.firstName} ${selected.client.lastName}` : `${selected.specialist.user.firstName} ${selected.specialist.user.lastName}`}</dd></div><div><dt>{text.price}</dt><dd>{selected.priceCents == null ? "—" : `${(selected.priceCents / 100).toFixed(0)} ₴`}</dd></div><div><dt>{text.status}</dt><dd>{status[selected.status]}</dd></div></dl>{selected.status === "CONFIRMED" && <div className="session-detail-actions">{isHosting(selected) && <button className="button" disabled={loading} onClick={() => void changeStatus(selected, "complete")}>{text.complete}</button>}<button className="button button--quiet" disabled={loading} onClick={() => void changeStatus(selected, "cancel")}>{text.cancel}</button></div>}</>}
      </aside>
    </div>
    {openDayKey && <div className="modal-backdrop day-sessions-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDay(); }}><section className="day-sessions-dialog" role="dialog" aria-modal="true" aria-labelledby="day-sessions-title"><header><div><p className="eyebrow">{text.daySessions}</p><h2 id="day-sessions-title">{new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "long", timeZone: "Europe/Kyiv" }).format(new Date(`${openDayKey}T12:00:00`))}</h2></div><button type="button" aria-label={text.close} onClick={closeDay}>×</button></header><div className="day-sessions-layout"><div className="day-sessions-list">{dayAppointments.map((item) => <button type="button" className={selectedDayAppointment?.id === item.id ? "is-selected" : ""} key={item.id} onClick={() => setSelectedDayAppointment(item)}><span>{timeRange(item)}</span><strong>{uk ? item.service.nameUk : item.service.nameEn}</strong><small>{isHosting(item) ? text.youHost : text.youAttend}</small></button>)}</div><div className="day-session-preview">{!selectedDayAppointment ? <div className="day-session-preview__empty"><span>↗</span><p>{text.chooseSession}</p></div> : <><p className="eyebrow">{isHosting(selectedDayAppointment) ? text.youHost : text.youAttend}</p><h3>{uk ? selectedDayAppointment.service.nameUk : selectedDayAppointment.service.nameEn}</h3><dl><div><dt>{text.date}</dt><dd>{dateOnly(selectedDayAppointment.startsAt)}</dd></div><div><dt>{text.duration}</dt><dd>{timeRange(selectedDayAppointment)} · {duration(selectedDayAppointment)} min</dd></div><div><dt>{isHosting(selectedDayAppointment) ? text.client : text.specialist}</dt><dd>{isHosting(selectedDayAppointment) ? `${selectedDayAppointment.client.firstName} ${selectedDayAppointment.client.lastName}` : `${selectedDayAppointment.specialist.user.firstName} ${selectedDayAppointment.specialist.user.lastName}`}</dd></div><div><dt>{text.price}</dt><dd>{selectedDayAppointment.priceCents == null ? "—" : `${(selectedDayAppointment.priceCents / 100).toFixed(0)} ₴`}</dd></div><div><dt>{text.status}</dt><dd>{status[selectedDayAppointment.status]}</dd></div></dl>{selectedDayAppointment.status === "CONFIRMED" && <div className="session-detail-actions">{isHosting(selectedDayAppointment) && <button className="button" disabled={loading} onClick={() => void changeStatus(selectedDayAppointment, "complete")}>{text.complete}</button>}<button className="button button--quiet" disabled={loading} onClick={() => void changeStatus(selectedDayAppointment, "cancel")}>{text.cancel}</button></div>}</>}</div></div></section></div>}
  </section>;
};
