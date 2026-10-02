import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../lib/auth-api";
import {
  cancelAppointment,
  createAppointment,
  createScheduleException,
  deleteScheduleException,
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

export const SpecialistDashboard = ({ token, locale, onLogout, view = "cabinet" }: CommonProps & { view?: "cabinet" | "profile-settings" }) => {
  const uk = locale === "uk";
  const days = uk ? ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П’ятниця", "Субота"] : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const [data, setData] = useState<SpecialistDashboardData | null>(null);
  const [schedule, setSchedule] = useState<WorkInterval[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { const result = await getSpecialistDashboard(token); setData(result); setSchedule(result.schedule); }, [token]);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);

  const setDay = (weekday: number, active: boolean) => setSchedule((current) => active
    ? [...current.filter((item) => item.weekday !== weekday), { weekday, startMinute: 9 * 60, endMinute: 17 * 60 }].sort((a, b) => a.weekday - b.weekday)
    : current.filter((item) => item.weekday !== weekday));
  const updateDay = (weekday: number, field: "startMinute" | "endMinute", value: number) => setSchedule((current) => current.map((item) => item.weekday === weekday ? { ...item, [field]: value } : item));

  const save = async () => {
    if (!data) return; setSaving(true); setMessage("");
    try { await saveSpecialistSchedule(token, schedule.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })), data.profile.slotStepMin); setMessage(uk ? "Графік збережено." : "Schedule saved."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setSaving(false); }
  };

  const addException = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setSaving(true); setMessage("");
    try {
      await createScheduleException(token, { startsAt: new Date(String(values.get("startsAt"))).toISOString(), endsAt: new Date(String(values.get("endsAt"))).toISOString(), isAvailable: values.get("isAvailable") === "true", note: String(values.get("note")) || undefined });
      form.reset(); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setSaving(false); }
  };

  const saveServiceSettings = async (event: FormEvent<HTMLFormElement>, serviceId: string) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const price = Number(values.get("price"));
    const durationMin = Number(values.get("durationMin"));
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) return;
    setSaving(true); setMessage("");
    try {
      await saveSpecialistServiceSettings(token, serviceId, Math.round(price * 100), durationMin);
      setMessage(uk ? "Ціну та тривалість збережено." : "Price and duration saved.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setSaving(false); }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true); setMessage("");
    try {
      const specialization = String(values.get("specialization") ?? "");
      const description = String(values.get("description") ?? "");
      await saveSpecialistProfile(token, {
        specializationUk: specialization, specializationEn: specialization,
        descriptionUk: description, descriptionEn: description,
        experienceStartYear: Number(values.get("experienceStartYear")),
        languages: String(values.get("languages") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      });
      setMessage(uk ? "Профіль збережено." : "Profile saved."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setSaving(false); }
  };

  if (!data) return <section className="portal-section" id="account"><p>{message || (uk ? "Завантаження…" : "Loading…")}</p></section>;

  return (
    <section className={`portal-section specialist-dashboard specialist-dashboard--${view}`} id="account">
      <div className="portal-heading"><div><p className="eyebrow">{view === "profile-settings" ? (uk ? "Налаштування" : "Settings") : (uk ? "Кабінет спеціаліста" : "Specialist dashboard")}</p><h2>{view === "profile-settings" ? (uk ? "Редагування профілю" : "Edit profile") : (uk ? "Графік і консультації" : "Schedule and consultations")}</h2></div><button className="button button--quiet" onClick={onLogout}>{uk ? "Вийти" : "Sign out"}</button></div>
      <div className="dashboard-stats"><span><strong>{data.stats.upcoming}</strong>{uk ? "Майбутніх" : "Upcoming"}</span><span><strong>{data.stats.total}</strong>{uk ? "Усього" : "Total"}</span><span><strong>{data.stats.bookedMinutes}</strong>{uk ? "Зайнятих хвилин" : "Booked minutes"}</span></div>
      {message && <p className="admin-message">{message}</p>}
      <form className="specialist-profile-editor" onSubmit={saveProfile}><div className="profile-editor-heading"><div><p className="eyebrow">{uk ? "Професійні дані" : "Professional details"}</p><h3>{uk ? "Як вас бачать клієнти" : "How clients see you"}</h3><small>{uk ? "Заповніть профіль тією мовою, якою консультуєте." : "Write the profile in the language you use for consultations."}</small></div>{data.profile.photoUrl ? <img src={data.profile.photoUrl} alt="" /> : <span>{uk ? "Фото" : "Photo"}</span>}</div><div className="profile-editor-grid"><label className="profile-editor-wide"><span>{uk ? "Спеціалізація" : "Specialization"}</span><input name="specialization" defaultValue={data.profile.specializationUk || data.profile.specializationEn || ""} required minLength={2} /></label><label><span>{uk ? "Рік початку професійної діяльності" : "Professional career start year"}</span><input name="experienceStartYear" type="number" min="1950" max={new Date().getFullYear()} defaultValue={data.profile.experienceStartYear ?? new Date().getFullYear()} required /></label><label><span>{uk ? "Мови консультації через кому" : "Consultation languages, comma separated"}</span><input name="languages" defaultValue={data.profile.languages.join(", ")} placeholder={uk ? "Українська, English" : "English, Ukrainian"} required /></label><label className="profile-editor-wide"><span>{uk ? "Опис" : "Description"}</span><textarea name="description" defaultValue={data.profile.descriptionUk ?? data.profile.descriptionEn ?? ""} minLength={20} maxLength={2000} required /></label></div><button className="button" disabled={saving}>{uk ? "Зберегти професійні дані" : "Save professional details"}</button></form>
      <div className="appointments-panel specialist-prices"><h3>{uk ? "Мої послуги" : "My services"}</h3><p className="empty-state">{uk ? "Клієнт побачить вашу ціну та точний час завершення консультації." : "Clients see your price and the exact consultation end time."}</p><div className="service-price-list">{data.profile.services.map((assignment) => <form key={assignment.service.id} onSubmit={(event) => void saveServiceSettings(event, assignment.service.id)}><strong>{uk ? assignment.service.nameUk : assignment.service.nameEn}</strong><label><span>{uk ? "Ціна" : "Price"}</span><input name="price" type="number" min="0" step="1" defaultValue={(assignment.priceCents ?? assignment.service.priceCents ?? 0) / 100} /><small>₴</small></label><label><span>{uk ? "Тривалість" : "Duration"}</span><select name="durationMin" defaultValue={assignment.durationMin ?? assignment.service.durationMin}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="50">50 min</option><option value="60">1 {uk ? "год" : "hour"}</option><option value="90">1.5 {uk ? "год" : "hours"}</option><option value="120">2 {uk ? "год" : "hours"}</option></select></label><button className="small-button" disabled={saving}>{uk ? "Зберегти" : "Save"}</button></form>)}</div></div>
      <div className="specialist-grid">
        <div className="schedule-editor"><h3>{uk ? "Щотижневий графік" : "Weekly schedule"}</h3>{days.map((day, weekday) => { const interval = schedule.find((item) => item.weekday === weekday); return <div className="schedule-row" key={day}><label><input type="checkbox" checked={Boolean(interval)} onChange={(event) => setDay(weekday, event.target.checked)} /> {day}</label><input type="time" disabled={!interval} value={interval ? minutesToTime(interval.startMinute) : "09:00"} onChange={(event) => updateDay(weekday, "startMinute", timeToMinutes(event.target.value))} /><span>—</span><input type="time" disabled={!interval} value={interval ? minutesToTime(interval.endMinute) : "17:00"} onChange={(event) => updateDay(weekday, "endMinute", timeToMinutes(event.target.value))} /></div>; })}<button className="button" disabled={saving} onClick={() => void save()}>{uk ? "Зберегти графік" : "Save schedule"}</button></div>
        <div className="exceptions-panel"><form className="admin-form" onSubmit={addException}><h3>{uk ? "Виняток або перерва" : "Exception or break"}</h3><label className="field"><span>{uk ? "Початок" : "Start"}</span><input name="startsAt" type="datetime-local" required /></label><label className="field"><span>{uk ? "Кінець" : "End"}</span><input name="endsAt" type="datetime-local" required /></label><label className="field"><span>{uk ? "Тип" : "Type"}</span><select name="isAvailable" defaultValue="false"><option value="false">{uk ? "Недоступний час" : "Unavailable"}</option><option value="true">{uk ? "Додатковий робочий час" : "Additional availability"}</option></select></label><label className="field"><span>{uk ? "Примітка" : "Note"}</span><input name="note" /></label><button className="button" disabled={saving}>{uk ? "Додати" : "Add"}</button></form><div className="exception-list">{data.exceptions.map((item) => <article key={item.id}><div><strong>{dateTime(item.startsAt, locale)}</strong><span> — {dateTime(item.endsAt, locale)}</span></div><p>{item.note || (item.isAvailable ? (uk ? "Додатковий час" : "Additional time") : (uk ? "Недоступно" : "Unavailable"))}</p><button className="small-button" onClick={() => void deleteScheduleException(token, item.id).then(load)}>{uk ? "Видалити" : "Delete"}</button></article>)}</div></div>
      </div>
    </section>
  );
};
