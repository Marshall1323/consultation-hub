import { useCallback, useEffect, useState } from "react";
import { getAdminAppointments, getAdminSchedule, saveAdminSchedule, updateAdminAppointment, type AdminSpecialist } from "../lib/admin-api";
import type { Appointment, WorkInterval } from "../lib/scheduling-api";

const minutesToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const timeToMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour! * 60 + minute!; };

export const AdminAppointmentsPanel = ({ token, locale }: { token: string; locale: "uk" | "en" }) => {
  const uk = locale === "uk";
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState({ total: 0, upcoming: 0, bookedMinutes: 0 });
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { const result = await getAdminAppointments(token); setAppointments(result.appointments); setStats(result.stats); }, [token]);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  const change = async (id: string, status: "CANCELLED" | "COMPLETED") => { try { await updateAdminAppointment(token, id, status); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); } };
  return <div className="admin-bookings"><div className="dashboard-stats"><span><strong>{stats.total}</strong>{uk ? "Усього" : "Total"}</span><span><strong>{stats.upcoming}</strong>{uk ? "Майбутніх" : "Upcoming"}</span><span><strong>{stats.bookedMinutes}</strong>{uk ? "Хвилин" : "Minutes"}</span></div>{message && <p className="admin-message">{message}</p>}<div className="admin-list">{appointments.length === 0 ? <p>{uk ? "Записів поки немає." : "No appointments yet."}</p> : appointments.map((item) => <article className="admin-booking-row" key={item.id}><div><strong>{uk ? item.service.nameUk : item.service.nameEn}</strong><span>{new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.startsAt))}</span></div><div><strong>{item.client.firstName} {item.client.lastName}</strong><span>{item.specialist.user.firstName} {item.specialist.user.lastName}</span></div><span className={`status-badge status-badge--${item.status.toLowerCase()}`}>{item.status}</span>{item.status === "CONFIRMED" && <div className="inline-actions"><button className="small-button" onClick={() => void change(item.id, "COMPLETED")}>{uk ? "Завершити" : "Complete"}</button><button className="small-button" onClick={() => void change(item.id, "CANCELLED")}>{uk ? "Скасувати" : "Cancel"}</button></div>}</article>)}</div></div>;
};

export const AdminSchedulePanel = ({ token, locale, specialists }: { token: string; locale: "uk" | "en"; specialists: AdminSpecialist[] }) => {
  const uk = locale === "uk";
  const days = uk ? ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [specialistId, setSpecialistId] = useState("");
  const [schedule, setSchedule] = useState<WorkInterval[]>([]);
  const [slotStepMin, setSlotStepMin] = useState(15);
  const [message, setMessage] = useState("");
  useEffect(() => { if (!specialistId) { setSchedule([]); return; } void getAdminSchedule(token, specialistId).then((result) => { setSchedule(result.schedule); setSlotStepMin(result.slotStepMin); }).catch((error) => setMessage(error.message)); }, [specialistId, token]);
  const setDay = (weekday: number, active: boolean) => setSchedule((current) => active ? [...current.filter((item) => item.weekday !== weekday), { weekday, startMinute: 540, endMinute: 1020 }].sort((a, b) => a.weekday - b.weekday) : current.filter((item) => item.weekday !== weekday));
  const updateDay = (weekday: number, field: "startMinute" | "endMinute", value: number) => setSchedule((current) => current.map((item) => item.weekday === weekday ? { ...item, [field]: value } : item));
  const save = async () => { if (!specialistId) return; setMessage(""); try { await saveAdminSchedule(token, specialistId, schedule.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })), slotStepMin); setMessage(uk ? "Графік збережено." : "Schedule saved."); } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); } };
  return <div className="admin-schedule-panel"><label className="field"><span>{uk ? "Спеціаліст" : "Specialist"}</span><select value={specialistId} onChange={(event) => setSpecialistId(event.target.value)}><option value="">{uk ? "Оберіть спеціаліста" : "Choose a specialist"}</option>{specialists.map((item) => <option value={item.id} key={item.id}>{item.user.firstName} {item.user.lastName}</option>)}</select></label>{specialistId && <><label className="field compact-field"><span>{uk ? "Крок слотів, хв" : "Slot step, min"}</span><input type="number" min="5" max="120" step="5" value={slotStepMin} onChange={(event) => setSlotStepMin(Number(event.target.value))} /></label><div className="schedule-editor">{days.map((day, weekday) => { const interval = schedule.find((item) => item.weekday === weekday); return <div className="schedule-row" key={day}><label><input type="checkbox" checked={Boolean(interval)} onChange={(event) => setDay(weekday, event.target.checked)} /> {day}</label><input type="time" disabled={!interval} value={interval ? minutesToTime(interval.startMinute) : "09:00"} onChange={(event) => updateDay(weekday, "startMinute", timeToMinutes(event.target.value))} /><span>—</span><input type="time" disabled={!interval} value={interval ? minutesToTime(interval.endMinute) : "17:00"} onChange={(event) => updateDay(weekday, "endMinute", timeToMinutes(event.target.value))} /></div>; })}<button className="button" onClick={() => void save()}>{uk ? "Зберегти" : "Save"}</button></div></>}{message && <p className="admin-message">{message}</p>}</div>;
};
