import { useEffect, useRef, useState } from "react";
import { getSpecialistRequests, updateSpecialistAppointment, type SpecialistRequest } from "../lib/scheduling-api";

type Props = { token: string; locale: "uk" | "en"; onOpenSession: (id: string) => void; onChanged: () => void };

const initials = (item: SpecialistRequest) => `${item.client.firstName[0] ?? ""}${item.client.lastName[0] ?? ""}`.toUpperCase();
const requestsPerPage = 10;

export const SpecialistRequestsPage = ({ token, locale, onOpenSession, onChanged }: Props) => {
  const [tab, setTab] = useState<"new" | "processed">("new");
  const [pending, setPending] = useState<SpecialistRequest[]>([]);
  const [processed, setProcessed] = useState<SpecialistRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState({ new: 1, processed: 1 });
  const listRef = useRef<HTMLElement>(null);
  const load = () => getSpecialistRequests(token).then((data) => { setPending(data.pending); setProcessed(data.processed); }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, [token]);

  const decide = async (id: string, status: "CONFIRMED" | "CANCELLED") => {
    setBusyId(id); setError("");
    try { await updateSpecialistAppointment(token, id, status); await load(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusyId(null); }
  };
  const list = tab === "new" ? pending : processed;
  const pageCount = Math.max(1, Math.ceil(list.length / requestsPerPage));
  const currentPage = Math.min(pages[tab], pageCount);
  const pageItems = list.slice((currentPage - 1) * requestsPerPage, currentPage * requestsPerPage);
  const openPage = (page: number) => {
    setPages((current) => ({ ...current, [tab]: Math.max(1, Math.min(page, pageCount)) }));
    window.requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };
  const f = (date: string) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

  return <main className="requests-page" id="top">
    <div className="requests-page__heading"><p className="eyebrow">{locale === "uk" ? "Кабінет спеціаліста" : "Specialist workspace"}</p><h1>{locale === "uk" ? "Заявки" : "Requests"}</h1><p>{locale === "uk" ? "Підтвердьте час або відхиліть запит. Інших зайвих дій тут немає." : "Confirm the time or decline the request. Nothing extra."}</p></div>
    <div className="requests-tabs" role="tablist">
      <button className={tab === "new" ? "is-active" : ""} onClick={() => setTab("new")}>{locale === "uk" ? "Нові" : "New"}<b>{pending.length}</b></button>
      <button className={tab === "processed" ? "is-active" : ""} onClick={() => setTab("processed")}>{locale === "uk" ? "Опрацьовані" : "Processed"}</button>
    </div>
    {error && <p className="form-message form-message--error">{error}</p>}
    <section ref={listRef} className="requests-list" aria-live="polite">
      {loading ? <p className="requests-empty">{locale === "uk" ? "Завантаження…" : "Loading…"}</p> : list.length === 0 ? <div className="requests-empty"><span>✓</span><strong>{locale === "uk" ? "Тут поки порожньо" : "Nothing here yet"}</strong><p>{tab === "new" ? (locale === "uk" ? "Нові запити з’являться в цьому списку." : "New requests will appear here.") : (locale === "uk" ? "Опрацьовані заявки з’являться тут." : "Processed requests will appear here.")}</p></div> : pageItems.map((item) => <article className="request-card" key={item.id}>
        <div className="request-card__person"><span>{item.client.avatarUrl ? <img src={item.client.avatarUrl} alt="" /> : initials(item)}</span><div><strong>{item.client.firstName} {item.client.lastName}</strong><small>{item.client.email}</small></div></div>
        <div className="request-card__main"><strong>{locale === "uk" ? item.service.nameUk : item.service.nameEn}</strong><span>{f(item.startsAt)} · {Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000)} {locale === "uk" ? "хв" : "min"}</span>{item.clientNote && <small>“{item.clientNote}”</small>}</div>
        <div className="request-card__actions">
          {tab === "new" ? <><button className="button request-confirm" disabled={busyId === item.id} onClick={() => void decide(item.id, "CONFIRMED")}>{locale === "uk" ? "Підтвердити" : "Confirm"}</button><button className="button button--quiet" disabled={busyId === item.id} onClick={() => void decide(item.id, "CANCELLED")}>{locale === "uk" ? "Відхилити" : "Decline"}</button></> : <span className={`request-status request-status--${item.status.toLowerCase()}`}>{item.status === "CONFIRMED" ? (locale === "uk" ? "Підтверджено" : "Confirmed") : item.status === "COMPLETED" ? (locale === "uk" ? "Завершено" : "Completed") : (locale === "uk" ? "Відхилено / скасовано" : "Declined / cancelled")}</span>}
          <button className="text-button" onClick={() => onOpenSession(item.id)}>{locale === "uk" ? "Переглянути сеанс" : "View session"}</button>
        </div>
      </article>)}
    </section>
    {!loading && pageCount > 1 && <nav className="review-pagination requests-pagination" aria-label={locale === "uk" ? "Сторінки заявок" : "Request pages"}><button type="button" disabled={currentPage === 1} onClick={() => openPage(currentPage - 1)}>← <span>{locale === "uk" ? "Попередня" : "Previous"}</span></button><div>{Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button type="button" className={page === currentPage ? "is-active" : ""} aria-current={page === currentPage ? "page" : undefined} onClick={() => openPage(page)} key={page}>{page}</button>)}</div><button type="button" disabled={currentPage === pageCount} onClick={() => openPage(currentPage + 1)}><span>{locale === "uk" ? "Наступна" : "Next"}</span> →</button></nav>}
  </main>;
};
