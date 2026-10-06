import { useEffect, useRef, useState } from "react";
import { decideRescheduleRequest, getSpecialistRequests, updateSpecialistAppointment, type SpecialistRequest, type SpecialistRescheduleRequest } from "../lib/scheduling-api";
import { showToast } from "../lib/toast";

type Props = { token: string; locale: "uk" | "en"; onOpenSession: (id: string) => void; onChanged: () => void };
type Tab = "new" | "reschedule" | "processed";
const initials = (item: SpecialistRequest) => `${item.client.firstName[0] ?? ""}${item.client.lastName[0] ?? ""}`.toUpperCase();
const requestsPerPage = 10;

export const SpecialistRequestsPage = ({ token, locale, onOpenSession, onChanged }: Props) => {
  const uk = locale === "uk";
  const [tab, setTab] = useState<Tab>(new URLSearchParams(window.location.search).get("tab") === "reschedule" ? "reschedule" : "new");
  const [pending, setPending] = useState<SpecialistRequest[]>([]);
  const [processed, setProcessed] = useState<SpecialistRequest[]>([]);
  const [reschedulePending, setReschedulePending] = useState<SpecialistRescheduleRequest[]>([]);
  const [rescheduleProcessed, setRescheduleProcessed] = useState<SpecialistRescheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<Record<Tab, number>>({ new: 1, reschedule: 1, processed: 1 });
  const listRef = useRef<HTMLElement>(null);
  const load = () => getSpecialistRequests(token).then((data) => {
    setPending(data.pending); setProcessed(data.processed);
    setReschedulePending(data.reschedulePending); setRescheduleProcessed(data.rescheduleProcessed);
  }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, [token]);

  const decideBooking = async (id: string, status: "CONFIRMED" | "CANCELLED") => {
    setBusyId(id); setError("");
    try { await updateSpecialistAppointment(token, id, status); await load(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusyId(null); }
  };
  const decideReschedule = async (id: string, status: "ACCEPTED" | "REJECTED") => {
    setBusyId(id); setError("");
    try {
      await decideRescheduleRequest(token, id, status); await load(); onChanged();
      showToast(status === "ACCEPTED" ? (uk ? "Новий час підтверджено." : "New time confirmed.") : (uk ? "Перенесення відхилено. Старий час збережено." : "Reschedule declined. The original time is kept."), "success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusyId(null); }
  };

  const bookingList = tab === "new" ? pending : processed;
  const rescheduleList = [...reschedulePending, ...rescheduleProcessed];
  const listLength = tab === "reschedule" ? rescheduleList.length : bookingList.length;
  const pageCount = Math.max(1, Math.ceil(listLength / requestsPerPage));
  const currentPage = Math.min(pages[tab], pageCount);
  const pageStart = (currentPage - 1) * requestsPerPage;
  const bookingItems = bookingList.slice(pageStart, pageStart + requestsPerPage);
  const rescheduleItems = rescheduleList.slice(pageStart, pageStart + requestsPerPage);
  const openPage = (page: number) => {
    setPages((current) => ({ ...current, [tab]: Math.max(1, Math.min(page, pageCount)) }));
    window.requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };
  const f = (date: string) => new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(new Date(date));
  const emptyCopy = tab === "new" ? (uk ? "Нові запити з’являться в цьому списку." : "New requests will appear here.") : tab === "reschedule" ? (uk ? "Запити на перенесення з’являться тут." : "Reschedule requests will appear here.") : (uk ? "Опрацьовані заявки з’являться тут." : "Processed requests will appear here.");
  const person = (item: SpecialistRequest) => <div className="request-card__person"><span>{item.client.avatarUrl ? <img src={item.client.avatarUrl} alt="" /> : initials(item)}</span><div><strong>{item.client.firstName} {item.client.lastName}</strong><small>{item.client.email}</small></div></div>;

  return <main className="requests-page" id="top">
    <div className="requests-page__heading"><p className="eyebrow">{uk ? "Кабінет спеціаліста" : "Specialist workspace"}</p><h1>{uk ? "Заявки" : "Requests"}</h1><p>{uk ? "Підтверджуйте нові записи та запропонований клієнтом час." : "Confirm new bookings and times proposed by clients."}</p></div>
    <div className="requests-tabs" role="tablist">
      <button className={tab === "new" ? "is-active" : ""} onClick={() => setTab("new")}>{uk ? "Нові" : "New"}<b>{pending.length}</b></button>
      <button className={tab === "reschedule" ? "is-active" : ""} onClick={() => setTab("reschedule")}>{uk ? "Перенесення" : "Rescheduling"}{reschedulePending.length > 0 && <b>{reschedulePending.length}</b>}</button>
      <button className={tab === "processed" ? "is-active" : ""} onClick={() => setTab("processed")}>{uk ? "Опрацьовані" : "Processed"}</button>
    </div>
    {error && <p className="form-message form-message--error">{error}</p>}
    <section ref={listRef} className="requests-list" aria-live="polite">
      {loading ? <p className="requests-empty">{uk ? "Завантаження…" : "Loading…"}</p> : listLength === 0 ? <div className="requests-empty"><span>✓</span><strong>{uk ? "Тут поки порожньо" : "Nothing here yet"}</strong><p>{emptyCopy}</p></div> : tab === "reschedule" ? rescheduleItems.map((item) => <article className="request-card request-card--reschedule" key={item.id}>
        {person(item.appointment)}
        <div className="request-card__main"><strong>{uk ? item.appointment.service.nameUk : item.appointment.service.nameEn}</strong><div className="reschedule-time-change"><span><small>{uk ? "Було" : "Original"}</small>{f(item.appointment.startsAt)}</span><b>→</b><span><small>{uk ? "Запропоновано" : "Proposed"}</small>{f(item.proposedStartsAt)}</span></div></div>
        <div className="request-card__actions">{item.status === "PENDING" ? <><button className="button request-confirm" disabled={busyId === item.id} onClick={() => void decideReschedule(item.id, "ACCEPTED")}>{uk ? "Підтвердити" : "Confirm"}</button><button className="button button--quiet" disabled={busyId === item.id} onClick={() => void decideReschedule(item.id, "REJECTED")}>{uk ? "Відхилити" : "Decline"}</button></> : <span className={`request-status request-status--${item.status.toLowerCase()}`}>{item.status === "ACCEPTED" ? (uk ? "Підтверджено" : "Accepted") : (uk ? "Відхилено" : "Declined")}</span>}<button className="text-button" onClick={() => onOpenSession(item.appointment.id)}>{uk ? "Переглянути сеанс" : "View session"}</button></div>
      </article>) : bookingItems.map((item) => <article className="request-card" key={item.id}>
        {person(item)}
        <div className="request-card__main"><strong>{uk ? item.service.nameUk : item.service.nameEn}</strong><span>{f(item.startsAt)} · {Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000)} {uk ? "хв" : "min"}</span>{item.clientNote && <small>“{item.clientNote}”</small>}</div>
        <div className="request-card__actions">{tab === "new" ? <><button className="button request-confirm" disabled={busyId === item.id} onClick={() => void decideBooking(item.id, "CONFIRMED")}>{uk ? "Підтвердити" : "Confirm"}</button><button className="button button--quiet" disabled={busyId === item.id} onClick={() => void decideBooking(item.id, "CANCELLED")}>{uk ? "Відхилити" : "Decline"}</button></> : <span className={`request-status request-status--${item.status.toLowerCase()}`}>{item.status === "CONFIRMED" ? (uk ? "Підтверджено" : "Confirmed") : item.status === "COMPLETED" ? (uk ? "Завершено" : "Completed") : (uk ? "Відхилено / скасовано" : "Declined / cancelled")}</span>}<button className="text-button" onClick={() => onOpenSession(item.id)}>{uk ? "Переглянути сеанс" : "View session"}</button></div>
      </article>)}
    </section>
    {!loading && pageCount > 1 && <nav className="review-pagination requests-pagination" aria-label={uk ? "Сторінки заявок" : "Request pages"}><button type="button" disabled={currentPage === 1} onClick={() => openPage(currentPage - 1)}>← <span>{uk ? "Попередня" : "Previous"}</span></button><div>{Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button type="button" className={page === currentPage ? "is-active" : ""} aria-current={page === currentPage ? "page" : undefined} onClick={() => openPage(page)} key={page}>{page}</button>)}</div><button type="button" disabled={currentPage === pageCount} onClick={() => openPage(currentPage + 1)}><span>{uk ? "Наступна" : "Next"}</span> →</button></nav>}
  </main>;
};
