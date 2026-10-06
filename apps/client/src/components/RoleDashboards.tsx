import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../lib/auth-api";
import {
  cancelAppointment,
  createAppointment,
  getAvailability,
  getMyAppointments,
  getServices,
  getSpecialistDashboard,
  getSpecialists,
  saveSpecialistSchedule,
  saveSpecialistProfile,
  saveSpecialistServiceSettings,
  type Appointment,
  type Service,
  type Specialist,
  type SpecialistDashboardData,
  type WorkInterval,
} from "../lib/scheduling-api";
import { showToast } from "../lib/toast";

type CommonProps = { token: string; user: AuthUser; locale: "uk" | "en"; onLogout: () => void };

const dateTime = (value: string, locale: "uk" | "en") => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Kyiv",
}).format(new Date(value));
const time = (value: string, locale: "uk" | "en") => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv",
}).format(new Date(value));

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const statusLabels = {
  uk: { PENDING: "Очікує", CONFIRMED: "Підтверджено", CANCELLED: "Скасовано", COMPLETED: "Завершено" },
  en: { PENDING: "Pending", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", COMPLETED: "Completed" },
} as const;

const AppointmentCard = ({ appointment, locale, actions }: {
  appointment: Appointment;
  locale: "uk" | "en";
  actions?: React.ReactNode;
}) => (
  <article className="booking-card">
    <div className="booking-card__time"><strong>{dateTime(appointment.startsAt, locale)}</strong><span>{time(appointment.startsAt, locale)}–{time(appointment.endsAt, locale)} · {Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60_000)} min</span></div>
    <div>
      <h4>{locale === "uk" ? appointment.service.nameUk : appointment.service.nameEn}</h4>
      <p>{appointment.specialist.user.firstName} {appointment.specialist.user.lastName}</p>
    </div>
    <span className={`status-badge status-badge--${appointment.status.toLowerCase()}`}>{statusLabels[locale][appointment.status]}</span>
    {actions && <div className="booking-card__actions">{actions}</div>}
  </article>
);

export const ClientDashboard = ({ token, user, locale, onLogout }: CommonProps) => {
  const uk = locale === "uk";
  const [services, setServices] = useState<Service[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Array<{ startsAt: string; endsAt: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadAppointments = useCallback(async () => {
    const result = await getMyAppointments(token);
    setAppointments(result.appointments);
  }, [token]);

  useEffect(() => {
    void Promise.all([getServices(), loadAppointments()])
      .then(([catalog]) => setServices(catalog.services))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Error"));
  }, [loadAppointments]);

  useEffect(() => {
    setSpecialistId(""); setSelectedSlot(""); setSlots([]);
    if (!serviceId) { setSpecialists([]); return; }
    void getSpecialists(serviceId).then((result) => setSpecialists(result.specialists)).catch((error) => setMessage(error.message));
  }, [serviceId]);

  useEffect(() => {
    setSelectedSlot("");
    if (!serviceId || !specialistId || !date) { setSlots([]); return; }
    setLoading(true);
    void getAvailability(specialistId, serviceId, date)
      .then((result) => setSlots(result.slots))
      .catch((error) => { setSlots([]); setMessage(error.message); })
      .finally(() => setLoading(false));
  }, [serviceId, specialistId, date]);

  const book = async () => {
    if (!selectedSlot) return;
    setLoading(true); setMessage("");
    try {
      await createAppointment(token, { specialistId, serviceId, startsAt: selectedSlot });
      setMessage(uk ? "Запис успішно створено." : "Appointment booked successfully.");
      setSelectedSlot("");
      const [availability] = await Promise.all([getAvailability(specialistId, serviceId, date), loadAppointments()]);
      setSlots(availability.slots);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setLoading(false); }
  };

  const cancel = async (id: string) => {
    setLoading(true); setMessage("");
    try { await cancelAppointment(token, id); await loadAppointments(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setLoading(false); }
  };

  const upcoming = appointments.filter((item) => item.status === "CONFIRMED" && new Date(item.startsAt) > new Date());
  const history = appointments.filter((item) => !upcoming.includes(item));

  return (
    <section className="portal-section" id="account">
      <div className="portal-heading">
        <div><p className="eyebrow">{uk ? "Особистий кабінет" : "My account"}</p><h2>{uk ? `${user.firstName}, оберіть зручний час` : `${user.firstName}, choose a convenient time`}</h2></div>
        <button className="button button--quiet" onClick={onLogout}>{uk ? "Вийти" : "Sign out"}</button>
      </div>

      <div className="booking-layout">
        <div className="booking-wizard">
          <h3>{uk ? "Новий запис" : "New appointment"}</h3>
          <label className="field"><span>1. {uk ? "Послуга" : "Service"}</span><select value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">{uk ? "Оберіть послугу" : "Choose a service"}</option>{services.map((service) => <option key={service.id} value={service.id}>{uk ? service.nameUk : service.nameEn} · {service.durationMin} min</option>)}</select></label>
          <label className="field"><span>2. {uk ? "Спеціаліст" : "Specialist"}</span><select value={specialistId} disabled={!serviceId} onChange={(event) => setSpecialistId(event.target.value)}><option value="">{uk ? "Оберіть спеціаліста" : "Choose a specialist"}</option>{specialists.map((specialist) => <option key={specialist.id} value={specialist.id}>{specialist.user.firstName} {specialist.user.lastName}</option>)}</select></label>
          <label className="field"><span>3. {uk ? "Дата" : "Date"}</span><input type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <div className="field"><span>4. {uk ? "Вільний час" : "Available time"}</span><div className="slot-grid">{loading ? <span>{uk ? "Завантаження…" : "Loading…"}</span> : slots.map((slot) => <button type="button" className={selectedSlot === slot.startsAt ? "slot-button is-selected" : "slot-button"} key={slot.startsAt} onClick={() => setSelectedSlot(slot.startsAt)}>{new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(new Date(slot.startsAt))}</button>)}{!loading && specialistId && slots.length === 0 && <span>{uk ? "На цю дату вільного часу немає." : "No available times on this date."}</span>}</div></div>
          <button className="button button--wide" disabled={!selectedSlot || loading} onClick={() => void book()}>{uk ? "Підтвердити запис" : "Confirm booking"}</button>
          {message && <p className="form-message booking-message" role="status">{message}</p>}
        </div>

        <div className="appointments-panel">
          <h3>{uk ? "Майбутні записи" : "Upcoming appointments"}</h3>
          {upcoming.length === 0 ? <p className="empty-state">{uk ? "У вас ще немає майбутніх записів." : "You have no upcoming appointments."}</p> : upcoming.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} locale={locale} actions={<button className="small-button" disabled={loading} onClick={() => void cancel(appointment.id)}>{uk ? "Скасувати" : "Cancel"}</button>} />)}
          {history.length > 0 && <><h3 className="history-heading">{uk ? "Історія" : "History"}</h3>{history.slice(0, 8).map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} locale={locale} />)}</>}
        </div>
      </div>
    </section>
  );
};

const minutesToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const timeToMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour! * 60 + minute!; };
type DayScheduleDraft = { active: boolean; start: string; end: string; breakStart: string; breakEnd: string };
const emptyDaySchedule = (): DayScheduleDraft => ({ active: false, start: "09:00", end: "17:00", breakStart: "", breakEnd: "" });
const scheduleToDayDrafts = (schedule: WorkInterval[]) => Array.from({ length: 7 }, (_, weekday) => {
  const intervals = schedule.filter((item) => item.weekday === weekday).sort((a, b) => a.startMinute - b.startMinute);
  if (!intervals.length) return emptyDaySchedule();
  const first = intervals[0]!;
  const last = intervals[intervals.length - 1]!;
  return {
    active: true,
    start: minutesToTime(first.startMinute),
    end: minutesToTime(last.endMinute),
    breakStart: intervals.length > 1 ? minutesToTime(first.endMinute) : "",
    breakEnd: intervals.length > 1 ? minutesToTime(intervals[1]!.startMinute) : "",
  };
});

export const SpecialistDashboard = ({ token, locale, view = "cabinet" }: CommonProps & { view?: "cabinet" | "profile-settings" }) => {
  const uk = locale === "uk";
  const days = uk ? ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П’ятниця", "Субота"] : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const [data, setData] = useState<SpecialistDashboardData | null>(null);
  const [daySchedules, setDaySchedules] = useState<DayScheduleDraft[]>(() => Array.from({ length: 7 }, emptyDaySchedule));
  const [selectedWeekday, setSelectedWeekday] = useState(1);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cabinetTab, setCabinetTab] = useState<"services" | "schedule">(() => {
    if (window.location.hash === "#schedule") return "schedule";
    return window.localStorage.getItem("consultation-specialist-cabinet-tab") === "schedule" ? "schedule" : "services";
  });

  const selectCabinetTab = (tab: "services" | "schedule") => {
    setCabinetTab(tab);
    window.localStorage.setItem("consultation-specialist-cabinet-tab", tab);
    window.history.replaceState(null, "", tab === "schedule" ? "#schedule" : "#services");
  };

  const load = useCallback(async () => { const result = await getSpecialistDashboard(token, view === "profile-settings"); setData(result); setDaySchedules(scheduleToDayDrafts(result.schedule)); }, [token, view]);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);

  const selectedDay = daySchedules[selectedWeekday] ?? emptyDaySchedule();
  const updateSelectedDay = (patch: Partial<DayScheduleDraft>) => setDaySchedules((current) => current.map((item, weekday) => weekday === selectedWeekday ? { ...item, ...patch } : item));

  const save = async () => {
    if (!data) return; setSaving(true);
    try {
      const intervals: WorkInterval[] = [];
      for (let weekday = 0; weekday < daySchedules.length; weekday += 1) {
        const day = daySchedules[weekday]!;
        if (!day.active) continue;
        const startMinute = timeToMinutes(day.start);
        const endMinute = timeToMinutes(day.end);
        if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) throw new Error(uk ? `Перевірте робочий час: ${days[weekday]}.` : `Check working hours: ${days[weekday]}.`);
        const hasBreakStart = Boolean(day.breakStart);
        const hasBreakEnd = Boolean(day.breakEnd);
        if (hasBreakStart !== hasBreakEnd) throw new Error(uk ? `Для перерви вкажіть початок і кінець: ${days[weekday]}.` : `Enter both break times: ${days[weekday]}.`);
        if (!hasBreakStart) {
          intervals.push({ weekday, startMinute, endMinute });
          continue;
        }
        const breakStartMinute = timeToMinutes(day.breakStart);
        const breakEndMinute = timeToMinutes(day.breakEnd);
        if (breakStartMinute <= startMinute || breakEndMinute <= breakStartMinute || breakEndMinute >= endMinute) {
          throw new Error(uk ? `Перерва має бути всередині робочого часу: ${days[weekday]}.` : `The break must be inside working hours: ${days[weekday]}.`);
        }
        intervals.push(
          { weekday, startMinute, endMinute: breakStartMinute },
          { weekday, startMinute: breakEndMinute, endMinute },
        );
      }
      await saveSpecialistSchedule(token, intervals, data.profile.slotStepMin); showToast(uk ? "Графік збережено." : "Schedule saved.", "success"); await load();
    }
    catch (error) { showToast(error instanceof Error ? error.message : "Error", "error"); }
    finally { setSaving(false); }
  };

  const saveServiceSettings = async (event: FormEvent<HTMLFormElement>, serviceId: string) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const price = Number(values.get("price"));
    const durationMin = Number(values.get("durationMin"));
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) return;
    setSaving(true);
    try {
      await saveSpecialistServiceSettings(token, serviceId, Math.round(price * 100), durationMin);
      showToast(uk ? "Ціну та тривалість збережено." : "Price and duration saved.", "success");
      await load();
    } catch (error) { showToast(error instanceof Error ? error.message : "Error", "error"); }
    finally { setSaving(false); }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const specialization = String(values.get("specialization") ?? "");
      const description = String(values.get("description") ?? "");
      await saveSpecialistProfile(token, {
        specializationUk: specialization, specializationEn: specialization,
        descriptionUk: description, descriptionEn: description,
        experienceStartYear: Number(values.get("experienceStartYear")),
        languages: String(values.get("languages") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      });
      showToast(uk ? "Профіль збережено." : "Profile saved.", "success"); await load();
    } catch (error) { showToast(error instanceof Error ? error.message : "Error", "error"); }
    finally { setSaving(false); }
  };

  if (!data) return <section className="portal-section" id="account"><p>{message || (uk ? "Завантаження…" : "Loading…")}</p></section>;

  return (
    <section className={`portal-section specialist-dashboard specialist-dashboard--${view}`} id="account">
      <div className="portal-heading"><div><p className="eyebrow">{view === "profile-settings" ? (uk ? "Налаштування" : "Settings") : (uk ? "Кабінет спеціаліста" : "Specialist dashboard")}</p><h2>{view === "profile-settings" ? (uk ? "Редагування профілю" : "Edit profile") : (uk ? "Графік і консультації" : "Schedule and consultations")}</h2></div></div>
      <div className="dashboard-stats"><span><strong>{data.stats.upcoming}</strong>{uk ? "Майбутніх" : "Upcoming"}</span><span><strong>{data.stats.total}</strong>{uk ? "Усього" : "Total"}</span><span><strong>{data.stats.bookedMinutes}</strong>{uk ? "Зайнятих хвилин" : "Booked minutes"}</span></div>
      <form className="specialist-profile-editor" onSubmit={saveProfile}><div className="profile-editor-heading"><div><p className="eyebrow">{uk ? "Професійні дані" : "Professional details"}</p><h3>{uk ? "Як вас бачать клієнти" : "How clients see you"}</h3><small>{uk ? "Заповніть профіль тією мовою, якою консультуєте." : "Write the profile in the language you use for consultations."}</small></div>{data.profile.photoUrl ? <img src={data.profile.photoUrl} alt="" /> : <span>{uk ? "Фото" : "Photo"}</span>}</div><div className="profile-editor-grid"><label className="profile-editor-wide"><span>{uk ? "Спеціалізація" : "Specialization"}</span><input name="specialization" defaultValue={data.profile.specializationUk || data.profile.specializationEn || ""} required minLength={2} /></label><label><span>{uk ? "Рік початку професійної діяльності" : "Professional career start year"}</span><input name="experienceStartYear" type="number" min="1950" max={new Date().getFullYear()} defaultValue={data.profile.experienceStartYear ?? new Date().getFullYear()} required /></label><label><span>{uk ? "Мови консультації через кому" : "Consultation languages, comma separated"}</span><input name="languages" defaultValue={data.profile.languages.join(", ")} placeholder={uk ? "Українська, English" : "English, Ukrainian"} required /></label><label className="profile-editor-wide"><span>{uk ? "Опис" : "Description"}</span><textarea name="description" defaultValue={data.profile.descriptionUk ?? data.profile.descriptionEn ?? ""} minLength={20} maxLength={2000} required /></label></div><button className="button" disabled={saving}>{uk ? "Зберегти професійні дані" : "Save professional details"}</button></form>
      {view === "cabinet" && <div className="specialist-cabinet-tabs" role="tablist" aria-label={uk ? "Розділи кабінету" : "Dashboard sections"}><button type="button" role="tab" aria-selected={cabinetTab === "services"} className={cabinetTab === "services" ? "is-active" : ""} onClick={() => selectCabinetTab("services")}>{uk ? "Мої послуги" : "My services"}</button><button type="button" role="tab" aria-selected={cabinetTab === "schedule"} className={cabinetTab === "schedule" ? "is-active" : ""} onClick={() => selectCabinetTab("schedule")}>{uk ? "Робочий графік" : "Work schedule"}</button></div>}
      {(view !== "cabinet" || cabinetTab === "services") && <div className="appointments-panel specialist-prices"><h3>{uk ? "Мої послуги" : "My services"}</h3><p className="empty-state">{uk ? "Клієнт побачить вашу ціну та точний час завершення консультації." : "Clients see your price and the exact consultation end time."}</p><div className="service-price-list">{data.profile.services.map((assignment) => <form key={assignment.service.id} onSubmit={(event) => void saveServiceSettings(event, assignment.service.id)}><strong>{uk ? assignment.service.nameUk : assignment.service.nameEn}</strong><label><span>{uk ? "Ціна" : "Price"}</span><input name="price" type="number" min="0" step="1" defaultValue={(assignment.priceCents ?? assignment.service.priceCents ?? 0) / 100} /><small>₴</small></label><label><span>{uk ? "Тривалість" : "Duration"}</span><select name="durationMin" defaultValue={assignment.durationMin ?? assignment.service.durationMin}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="50">50 min</option><option value="60">1 {uk ? "год" : "hour"}</option><option value="90">1.5 {uk ? "год" : "hours"}</option><option value="120">2 {uk ? "год" : "hours"}</option></select></label><button className="small-button" disabled={saving}>{uk ? "Зберегти" : "Save"}</button></form>)}</div></div>}
      {(view !== "cabinet" || cabinetTab === "schedule") && <div className="specialist-grid">
        <div className="schedule-editor weekly-schedule-editor">
          <div className="weekly-schedule-heading"><div><h3>{uk ? "Щотижневий графік" : "Weekly schedule"}</h3><p>{uk ? "Оберіть день і вкажіть робочий час." : "Choose a day and enter your working hours."}</p></div><span>{uk ? "Перерва необов’язкова" : "Break is optional"}</span></div>
          <div className="weekly-schedule-scroll"><div className="weekly-schedule-days" role="tablist" aria-label={uk ? "Дні тижня" : "Weekdays"}>{days.map((day, weekday) => { const item = daySchedules[weekday] ?? emptyDaySchedule(); return <button type="button" role="tab" aria-selected={selectedWeekday === weekday} className={`${item.active ? "is-working" : "is-off"}${selectedWeekday === weekday ? " is-selected" : ""}`} key={day} onClick={() => setSelectedWeekday(weekday)}><strong>{day}</strong><span>{item.active ? `${item.start}–${item.end}` : (uk ? "Вихідний" : "Day off")}</span>{item.active && item.breakStart && item.breakEnd && <small>{uk ? "Перерва" : "Break"} {item.breakStart}–{item.breakEnd}</small>}</button>; })}</div></div>
          <div className="selected-day-editor">
            <div className="selected-day-editor__heading"><div><small>{uk ? "Обраний день" : "Selected day"}</small><strong>{days[selectedWeekday]}</strong></div><label className="workday-toggle"><input type="checkbox" checked={selectedDay.active} onChange={(event) => updateSelectedDay({ active: event.target.checked })} /><span>{uk ? "Робочий день" : "Working day"}</span></label></div>
            {selectedDay.active ? <><div className="selected-day-editor__times"><label><span>{uk ? "Початок роботи" : "Work starts"}</span><input type="time" value={selectedDay.start} onChange={(event) => updateSelectedDay({ start: event.target.value })} /></label><span>—</span><label><span>{uk ? "Кінець роботи" : "Work ends"}</span><input type="time" value={selectedDay.end} onChange={(event) => updateSelectedDay({ end: event.target.value })} /></label></div><div className="break-time-editor"><div><strong>{uk ? "Перерва" : "Break"}</strong><small>{uk ? "Залиште обидва поля порожніми, якщо перерви немає." : "Leave both fields empty if there is no break."}</small></div><label><span>{uk ? "З" : "From"}</span><input type="time" value={selectedDay.breakStart} onChange={(event) => updateSelectedDay({ breakStart: event.target.value })} /></label><span>—</span><label><span>{uk ? "До" : "To"}</span><input type="time" value={selectedDay.breakEnd} onChange={(event) => updateSelectedDay({ breakEnd: event.target.value })} /></label><button type="button" className="clear-break-button" disabled={!selectedDay.breakStart && !selectedDay.breakEnd} onClick={() => updateSelectedDay({ breakStart: "", breakEnd: "" })}>{uk ? "Очистити" : "Clear"}</button></div></> : <p className="day-off-message">{uk ? "У цей день клієнти не побачать доступних слотів." : "Clients will not see available slots on this day."}</p>}
          </div>
          <button className="button" disabled={saving} onClick={() => void save()}>{uk ? "Зберегти графік" : "Save schedule"}</button>
        </div>
      </div>}
    </section>
  );
};
