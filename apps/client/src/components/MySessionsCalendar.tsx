import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "../lib/auth-api";
import { cancelAppointment, getMyAppointments, updateSpecialistAppointment, type Appointment } from "../lib/scheduling-api";

type Props = { token: string; user: AuthUser; locale: "uk" | "en" };
type Filter = "all" | "attending" | "hosting";
type View = "day" | "week" | "month";
const isCalendarView = (value: string | null): value is View => value === "day" || value === "week" || value === "month";
const dateKey = (value: string | Date) => { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(typeof value === "string" ? new Date(value) : value).map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
const atNoon = (value = new Date()) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
const addDays = (value: Date, amount: number) => { const result = new Date(value); result.setDate(result.getDate() + amount); return atNoon(result); };
const startOfWeek = (value: Date) => { const result = atNoon(value); result.setDate(result.getDate() - ((result.getDay() || 7) - 1)); return result; };

export const MySessionsCalendar = ({ token, user, locale }: Props) => {
  const uk = locale === "uk";
  const canHost = user.role === "SPECIALIST";
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cursor, setCursor] = useState(() => atNoon());
  const [view, setView] = useState<View>(() => {
    const savedView = localStorage.getItem(`consultation-calendar-view:${user.id}`);
    return isCalendarView(savedView) ? savedView : "day";
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const dayViewRef = useRef<HTMLDivElement>(null);
  const t = uk ? {
    title: "Особистий календар", specialistCopy: "Ваші записи та консультації, які ви проводите.", clientCopy: "Усі консультації, на які ви записані.", all: "Усі", attending: "Я записаний", hosting: "Я проводжу", day: "День", week: "Тиждень", month: "Місяць", today: "Сьогодні", previous: "Назад", next: "Далі", empty: "На цей період сеансів немає.", details: "Деталі сеансу", date: "Дата", duration: "Тривалість", specialist: "Спеціаліст", client: "Клієнт", status: "Статус", price: "Вартість", cancel: "Скасувати", complete: "Завершити", close: "Закрити", attend: "Я записаний", host: "Я проводжу", more: "ще", choose: "Оберіть сеанс, щоб переглянути деталі", daySessions: "Сеанси на цей день",
  } : {
    title: "Personal calendar", specialistCopy: "Appointments you attend and consultations you provide.", clientCopy: "Every consultation you are booked to attend.", all: "All", attending: "I attend", hosting: "I provide", day: "Day", week: "Week", month: "Month", today: "Today", previous: "Previous", next: "Next", empty: "There are no sessions in this period.", details: "Session details", date: "Date", duration: "Duration", specialist: "Specialist", client: "Client", status: "Status", price: "Price", cancel: "Cancel", complete: "Complete", close: "Close", attend: "I attend", host: "I provide", more: "more", choose: "Choose a session to view details", daySessions: "Sessions on this day",
  };
  const localeCode = uk ? "uk-UA" : "en-GB";
  const isHosting = (item: Appointment) => item.specialist.user.id === user.id;
  const time = (value: string) => new Intl.DateTimeFormat(localeCode, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(new Date(value));
  const startHour = (item: Appointment) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Kyiv" }).format(new Date(item.startsAt)));
  const range = (item: Appointment) => `${time(item.startsAt)}–${time(item.endsAt)}`;
  const duration = (item: Appointment) => Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000);
  const statusText = (item: Appointment) => item.status === "PENDING"
    ? isHosting(item)
      ? (uk ? "Очікується ваше підтвердження" : "Awaiting your confirmation")
      : (uk ? "Очікується підтвердження спеціаліста" : "Awaiting specialist confirmation")
    : ({ CONFIRMED: uk ? "Підтверджено" : "Confirmed", CANCELLED: uk ? "Скасовано" : "Cancelled", COMPLETED: uk ? "Завершено" : "Completed" } as const)[item.status];
  const load = useCallback(async () => { setLoading(true); try { const data = await getMyAppointments(token); setAppointments(data.appointments); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Error"); } finally { setLoading(false); } }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { localStorage.setItem(`consultation-calendar-view:${user.id}`, view); }, [user.id, view]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("appointmentId"); if (!id || !appointments.length) return; const item = appointments.find((appointment) => appointment.id === id); if (item) { setSelected(item); setCursor(atNoon(new Date(item.startsAt))); } }, [appointments]);
  const visible = useMemo(() => appointments.filter((item) => item.status !== "CANCELLED").filter((item) => filter === "hosting" ? isHosting(item) : filter === "attending" ? item.client.id === user.id : true).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)), [appointments, filter, user.id]);
  const grouped = useMemo(() => { const map = new Map<string, Appointment[]>(); visible.forEach((item) => map.set(dateKey(item.startsAt), [...(map.get(dateKey(item.startsAt)) ?? []), item])); return map; }, [visible]);
  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const monthGridStart = startOfWeek(monthStart);
  const monthOffset = Math.round((monthStart.getTime() - monthGridStart.getTime()) / 86400000);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const monthWeekCount = Math.ceil((monthOffset + daysInMonth) / 7);
  const monthDays = Array.from({ length: monthWeekCount * 7 }, (_, index) => addDays(monthGridStart, index));
  const monthEventLimit = 1;
  const dayItems = grouped.get(dateKey(cursor)) ?? [];
  const kyivTimeParts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((part) => [part.type, part.value]));
  const currentHour = Number(kyivTimeParts.hour);
  const currentMinute = Number(kyivTimeParts.minute);
  const isCursorToday = dateKey(cursor) === dateKey(now);
  useEffect(() => {
    const updateNow = () => setNow(new Date());
    const delay = 60000 - (Date.now() % 60000);
    let intervalId = 0;
    const timeoutId = window.setTimeout(() => {
      updateNow();
      intervalId = window.setInterval(updateNow, 60000);
    }, delay);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);
  useEffect(() => {
    if (view !== "day") return;
    const firstFrame = window.requestAnimationFrame(() => {
      const container = dayViewRef.current;
      if (!container) return;
      const targetHour = isCursorToday ? currentHour : dayItems[0] ? startHour(dayItems[0]) : 7;
      const target = isCursorToday
        ? container.querySelector<HTMLElement>(".current-time-line")
        : container.querySelector<HTMLElement>(`[data-hour="${targetHour}"]`);
      if (target) {
        const targetTop = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        container.scrollTo({ top: Math.max(0, targetTop - container.clientHeight * 0.35), behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [cursor, dayItems, loading, view, isCursorToday, currentHour]);
  const title = view === "day" ? new Intl.DateTimeFormat(localeCode, { dateStyle: "long" }).format(cursor) : view === "week" ? `${new Intl.DateTimeFormat(localeCode, { day: "numeric", month: "short" }).format(weekDays[0])} — ${new Intl.DateTimeFormat(localeCode, { day: "numeric", month: "short", year: "numeric" }).format(weekDays[6])}` : new Intl.DateTimeFormat(localeCode, { month: "long", year: "numeric" }).format(cursor);
  const move = (direction: number) => setCursor((current) => view === "day" ? addDays(current, direction) : view === "week" ? addDays(current, direction * 7) : new Date(current.getFullYear(), current.getMonth() + direction, 1, 12));
  const kind = (item: Appointment) => item.status === "PENDING" ? "pending" : item.status === "COMPLETED" ? "completed" : isHosting(item) ? "hosting" : "attending";
  const name = (item: Appointment) => isHosting(item) ? `${item.client.firstName} ${item.client.lastName}` : `${item.specialist.user.firstName} ${item.specialist.user.lastName}`;
  const avatar = (item: Appointment) => isHosting(item) ? item.client.avatarUrl : (item.specialist.user.avatarUrl ?? item.specialist.photoUrl);
  const initials = (item: Appointment) => name(item).split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const eventButton = (item: Appointment, compact = false) => <button type="button" className={`calendar-event calendar-event--${kind(item)}`} key={item.id} onClick={() => setSelected(item)}><span className="calendar-event__time">{range(item)}</span><strong>{uk ? item.service.nameUk : item.service.nameEn}</strong>{!compact && <span className="calendar-event__person"><i>{avatar(item) ? <img src={avatar(item)!} alt="" /> : initials(item)}</i>{name(item)}</span>}<span className="calendar-event__role">{statusText(item)}</span></button>;
  const monthEventButton = (item: Appointment) => <button type="button" className={`month-event month-event--${kind(item)}`} key={item.id} onClick={() => setSelected(item)} title={`${range(item)} · ${uk ? item.service.nameUk : item.service.nameEn}`}><span>{time(item.startsAt)}</span><strong>{uk ? item.service.nameUk : item.service.nameEn}</strong></button>;
  const changeStatus = async (item: Appointment, action: "cancel" | "complete") => { setLoading(true); setMessage(""); try { if (isHosting(item)) await updateSpecialistAppointment(token, item.id, action === "complete" ? "COMPLETED" : "CANCELLED"); else await cancelAppointment(token, item.id); setSelected(null); await load(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Error"); setLoading(false); } };

  return <section className="sessions-page">
    <header className="sessions-heading"><div><h1>{t.title}</h1>{!canHost && <p>{t.clientCopy}</p>}</div>{canHost && <div className="sessions-filters">{(["all", "attending", "hosting"] as Filter[]).map((item) => <button type="button" className={filter === item ? "is-selected" : ""} onClick={() => setFilter(item)} key={item}>{t[item]}</button>)}</div>}</header>
    <div className="calendar-legend"><span><i className="is-attending" />{t.attend}</span>{canHost && <span><i className="is-hosting" />{t.host}</span>}<span><i className="is-pending" />{uk ? "Очікує підтвердження" : "Awaiting confirmation"}</span><span><i className="is-completed" />{uk ? "Завершено" : "Completed"}</span></div>
    <div className="sessions-calendar-shell"><div className="sessions-calendar-main">
      <div className="sessions-toolbar"><div><button aria-label={t.previous} onClick={() => move(-1)}>←</button><button onClick={() => setCursor(atNoon())}>{t.today}</button><button aria-label={t.next} onClick={() => move(1)}>→</button></div><h2>{title}</h2><label className="calendar-view-select"><span className="sr-only">View</span><select value={view} onChange={(event) => setView(event.target.value as View)}><option value="day">{t.day}</option><option value="week">{t.week}</option><option value="month">{t.month}</option></select></label></div>
      {message && <p className="booking-feedback">{message}</p>}
      {view === "day" && <div ref={dayViewRef} className="day-view" aria-label={uk ? "Розклад на день" : "Daily schedule"}>{Array.from({ length: 24 }, (_, hour) => { const hourItems = dayItems.filter((item) => startHour(item) === hour); return <div data-hour={hour} className={hourItems.length ? "day-hour day-hour--has-events" : "day-hour"} key={hour}><time>{String(hour).padStart(2, "0")}:00</time><div className="day-hour__content">{isCursorToday && hour === currentHour && <div className="current-time-line" style={{ "--current-minute": `${currentMinute / 60 * 100}%` } as React.CSSProperties}><span>{String(currentHour).padStart(2, "0")}:{String(currentMinute).padStart(2, "0")}</span></div>}{loading && hour === 0 && <span className="day-hour__loading">{uk ? "Завантаження…" : "Loading…"}</span>}{hourItems.map((item) => eventButton(item))}</div></div>; })}</div>}
      {view === "week" && <><div className="week-view">{weekDays.map((day) => { const items = grouped.get(dateKey(day)) ?? []; return <div className={dateKey(day) === dateKey(new Date()) ? "week-column is-today" : "week-column"} key={dateKey(day)}><button className="week-column__head" onClick={() => { setCursor(day); setView("day"); }}><span>{new Intl.DateTimeFormat(localeCode, { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong></button><div>{items.map((item) => eventButton(item, true))}</div></div>; })}</div><div className="week-mobile">{weekDays.map((day) => <button key={dateKey(day)} className={dateKey(cursor) === dateKey(day) ? "is-selected" : ""} onClick={() => setCursor(day)}><span>{new Intl.DateTimeFormat(localeCode, { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong></button>)}<div>{(grouped.get(dateKey(cursor)) ?? []).map((item) => eventButton(item))}{!(grouped.get(dateKey(cursor)) ?? []).length && <p className="calendar-empty">{t.empty}</p>}</div></div></>}
      {view === "month" && <div className="month-calendar" style={{ "--month-weeks": monthWeekCount } as React.CSSProperties}><div className="month-weekdays">{weekDays.map((day) => <span key={dateKey(day)}>{new Intl.DateTimeFormat(localeCode, { weekday: "short" }).format(day)}</span>)}</div><div className="month-days">{monthDays.map((day) => { const items = grouped.get(dateKey(day)) ?? []; const hiddenCount = items.length - monthEventLimit; return <div className={`${day.getMonth() === cursor.getMonth() ? "month-day" : "month-day is-outside"}${dateKey(day) === dateKey(now) ? " is-today" : ""}`} key={dateKey(day)}><button className="month-day__number" onClick={() => { setCursor(day); setView("day"); }}>{day.getDate()}</button><div className={hiddenCount > 0 ? "month-events has-more" : "month-events"}>{items.slice(0, monthEventLimit).map(monthEventButton)}{hiddenCount > 0 && <button className="month-events__more" aria-label={`+${hiddenCount} ${t.more}`} title={`+${hiddenCount} ${t.more}`} onClick={() => setOpenDayKey(dateKey(day))}>+{hiddenCount}</button>}</div></div>; })}</div></div>}
    </div><aside className={selected ? "session-details" : "session-details is-empty"}>{!selected ? <div className="session-details__empty"><span>○</span><h3>{t.details}</h3><p>{t.choose}</p></div> : <><div className="session-details__heading"><div><p className="eyebrow">{t.details}</p><h3>{uk ? selected.service.nameUk : selected.service.nameEn}</h3></div><button aria-label={t.close} onClick={() => setSelected(null)}>×</button></div><div className="session-participant"><span>{avatar(selected) ? <img src={avatar(selected)!} alt="" /> : initials(selected)}</span><div><small>{isHosting(selected) ? t.client : t.specialist}</small><strong>{name(selected)}</strong></div></div><dl><div><dt>{t.date}</dt><dd>{new Intl.DateTimeFormat(localeCode, { dateStyle: "long", timeZone: "Europe/Kyiv" }).format(new Date(selected.startsAt))}</dd></div><div><dt>{t.duration}</dt><dd>{range(selected)} · {duration(selected)} {uk ? "хв" : "min"}</dd></div><div><dt>{t.price}</dt><dd>{selected.priceCents == null ? "—" : `${(selected.priceCents / 100).toFixed(0)} ₴`}</dd></div><div><dt>{t.status}</dt><dd>{statusText(selected)}</dd></div></dl>{selected.status === "CONFIRMED" && <div className="session-detail-actions">{isHosting(selected) && <button className="button" disabled={loading} onClick={() => void changeStatus(selected, "complete")}>{t.complete}</button>}<button className="button button--quiet" disabled={loading} onClick={() => void changeStatus(selected, "cancel")}>{t.cancel}</button></div>}</>}</aside></div>
    {openDayKey && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenDayKey(null); }}><section className="day-sessions-dialog" role="dialog" aria-modal="true"><header><div><p className="eyebrow">{t.daySessions}</p><h2>{new Intl.DateTimeFormat(localeCode, { dateStyle: "long" }).format(new Date(`${openDayKey}T12:00:00`))}</h2></div><button onClick={() => setOpenDayKey(null)}>×</button></header><div className="day-modal-list">{(grouped.get(openDayKey) ?? []).map((item) => <div key={item.id}>{eventButton(item)}<button className="text-button" onClick={() => { setSelected(item); setOpenDayKey(null); }}>{t.details}</button></div>)}</div></section></div>}
  </section>;
};
