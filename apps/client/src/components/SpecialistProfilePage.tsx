import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "../lib/auth-api";
import { createReview, deleteReview, getMyAppointments, getNearestAvailability, getSpecialistProfile, updateReview, type Appointment, type Review, type SpecialistProfile } from "../lib/scheduling-api";

type Props = {
  specialistId: string;
  locale: "uk" | "en";
  token: string | null;
  user: AuthUser | null;
  onBack: () => void;
  onBook: (serviceId: string, specialistId: string) => void;
  onRequireAuth: () => void;
};

const money = (value: number | null) => value == null ? "—" : `${(value / 100).toFixed(0)} ₴`;
const initials = (profile: SpecialistProfile) => `${profile.user.firstName[0] ?? ""}${profile.user.lastName[0] ?? ""}`;
const reviewsPerPage = 10;

export const SpecialistProfilePage = ({ specialistId, locale, token, user, onBack, onBook, onRequireAuth }: Props) => {
  const uk = locale === "uk";
  const [profile, setProfile] = useState<SpecialistProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [nearest, setNearest] = useState<Record<string, { startsAt: string; endsAt: string } | null | undefined>>({});
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [editing, setEditing] = useState<Review | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewPage, setReviewPage] = useState(1);
  const reviewsRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const result = await getSpecialistProfile(specialistId);
      setProfile(result.profile);
      const entries = await Promise.all(result.profile.services.map(async (assignment) => {
        try { return [assignment.service.id, (await getNearestAvailability(specialistId, assignment.service.id)).slot] as const; }
        catch { return [assignment.service.id, null] as const; }
      }));
      setNearest(Object.fromEntries(entries));
      if (token) setAppointments((await getMyAppointments(token)).appointments);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setLoading(false); }
  }, [specialistId, token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setReviewPage(1); }, [specialistId]);

  const reviewedIds = new Set(profile?.reviews.map((item) => item.appointmentId) ?? []);
  const eligible = useMemo(() => appointments.filter((item) => item.specialist.id === specialistId && item.status === "COMPLETED" && !reviewedIds.has(item.id)), [appointments, profile, specialistId]);
  useEffect(() => { if (!appointmentId && eligible[0]) setAppointmentId(eligible[0].id); }, [appointmentId, eligible]);

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || (!editing && !appointmentId)) return;
    setLoading(true); setMessage("");
    try {
      if (editing) await updateReview(token, editing.id, { rating, comment });
      else await createReview(token, specialistId, { appointmentId, rating, comment });
      setEditing(null); setComment(""); setRating(5); setAppointmentId("");
      await load();
      setMessage(uk ? "Відгук збережено." : "Review saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); setLoading(false); }
  };

  const removeReview = async (reviewId: string) => {
    if (!token) return;
    setLoading(true);
    try { await deleteReview(token, reviewId); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Error"); setLoading(false); }
  };

  if (loading && !profile) return <main className="specialist-profile-page"><div className="profile-loading"><span /><p>{uk ? "Завантажуємо профіль…" : "Loading profile…"}</p></div></main>;
  if (!profile) return <main className="specialist-profile-page"><button className="profile-back" onClick={onBack}>← {uk ? "Повернутися" : "Go back"}</button><p>{message || (uk ? "Профіль не знайдено." : "Profile not found.")}</p></main>;

  const experience = profile.experienceStartYear ? Math.max(0, new Date().getFullYear() - profile.experienceStartYear) : null;
  const experienceLabel = experience == null ? (uk ? "Не вказано" : "Not specified") : uk ? `${experience} ${experience % 10 === 1 && experience % 100 !== 11 ? "рік" : [2, 3, 4].includes(experience % 10) && ![12, 13, 14].includes(experience % 100) ? "роки" : "років"}` : `${experience} ${experience === 1 ? "year" : "years"}`;
  const fullName = `${profile.user.firstName} ${profile.user.lastName}`;
  const isOwnProfile = user?.id === profile.user.id;
  const dateTime = (value: string) => new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(new Date(value));
  const reviewPageCount = Math.max(1, Math.ceil(profile.reviews.length / reviewsPerPage));
  const currentReviewPage = Math.min(reviewPage, reviewPageCount);
  const visibleReviews = profile.reviews.slice((currentReviewPage - 1) * reviewsPerPage, currentReviewPage * reviewsPerPage);
  const openReviewPage = (page: number) => {
    setReviewPage(Math.min(reviewPageCount, Math.max(1, page)));
    window.requestAnimationFrame(() => reviewsRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };

  return <main className="specialist-profile-page">
    <button className="profile-back" onClick={onBack}>← {uk ? "До вибору спеціаліста" : "Back to specialists"}</button>
    <section className="profile-hero">
      <div className="profile-avatar">{profile.photoUrl ? <img src={profile.photoUrl} alt={fullName} /> : <span>{initials(profile)}</span>}</div>
      <div className="profile-identity"><p className="eyebrow">{uk ? "Профіль спеціаліста" : "Specialist profile"}</p><h1>{fullName}</h1><p className="profile-specialization">{uk ? profile.specializationUk : profile.specializationEn || profile.specializationUk}</p><div className="profile-tags">{profile.languages.map((language) => <span key={language}>{language}</span>)}</div></div>
      <div className="profile-stats"><div><strong>{profile.averageRating == null ? "—" : `★ ${profile.averageRating.toFixed(1)}`}</strong><span>{profile.reviewCount} {uk ? "відгуків" : "reviews"}</span></div><div><strong>{profile.completedConsultations}</strong><span>{uk ? "проведених консультацій" : "completed consultations"}</span></div><div><strong>{experienceLabel}</strong><span>{uk ? "професійного досвіду" : "professional experience"}</span></div></div>
    </section>

    <div className="profile-content-grid">
      <div className="profile-main-column">
        <section className="profile-about"><p className="eyebrow">{uk ? "Про спеціаліста" : "About"}</p><h2>{uk ? "Досвід і підхід" : "Experience and approach"}</h2><p>{uk ? profile.descriptionUk : profile.descriptionEn || profile.descriptionUk}</p></section>
        <section className="profile-services"><div className="profile-section-heading"><div><p className="eyebrow">{uk ? "Послуги" : "Services"}</p><h2>{uk ? "Оберіть формат консультації" : "Choose a consultation"}</h2></div><span>{profile.services.length}</span></div><div className="profile-service-list">{profile.services.map((assignment) => { const service = assignment.service; const price = assignment.priceCents ?? service.priceCents; const duration = assignment.durationMin ?? service.durationMin; const slot = nearest[service.id]; return <article key={service.id}><div><h3>{uk ? service.nameUk : service.nameEn}</h3><p>{uk ? service.descriptionUk : service.descriptionEn}</p></div><div className="profile-service-meta"><strong>{duration} min · {money(price)}</strong><span>{slot === undefined ? (uk ? "Шукаємо вільний час…" : "Finding availability…") : slot ? `${uk ? "Найближче" : "Next"}: ${dateTime(slot.startsAt)}` : (uk ? "Немає часу на 30 днів" : "No availability for 30 days")}</span></div><button className="button" onClick={() => onBook(service.id, profile.id)}>{uk ? "Записатися" : "Book"}</button></article>; })}</div></section>

        <section ref={reviewsRef} className="profile-reviews" id="reviews"><div className="profile-section-heading"><div><p className="eyebrow">{uk ? "Відгуки" : "Reviews"}</p><h2>{uk ? "Враження після консультацій" : "After the consultation"}</h2></div><span>{profile.reviewCount}</span></div>
          {!isOwnProfile && (!token ? <div className="review-invitation"><p>{uk ? "Увійдіть, щоб залишити відгук після завершеної консультації." : "Sign in to review a completed consultation."}</p><button className="small-button" onClick={onRequireAuth}>{uk ? "Увійти" : "Sign in"}</button></div> : (eligible.length > 0 || editing) && <form className="review-form" onSubmit={submitReview}><h3>{editing ? (uk ? "Редагувати відгук" : "Edit review") : (uk ? "Залишити відгук" : "Leave a review")}</h3>{!editing && <label><span>{uk ? "Консультація" : "Consultation"}</span><select value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>{eligible.map((item) => <option value={item.id} key={item.id}>{new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "medium", timeZone: "Europe/Kyiv" }).format(new Date(item.startsAt))} · {uk ? item.service.nameUk : item.service.nameEn}</option>)}</select></label>}<fieldset><legend>{uk ? "Оцінка" : "Rating"}</legend><div className="rating-input">{[1, 2, 3, 4, 5].map((value) => <button type="button" className={value <= rating ? "is-selected" : ""} onClick={() => setRating(value)} key={value} aria-label={`${value}/5`}>★</button>)}</div></fieldset><label><span>{uk ? "Коментар" : "Comment"}</span><textarea minLength={10} maxLength={1200} required value={comment} onChange={(event) => setComment(event.target.value)} placeholder={uk ? "Розкажіть, що було корисним…" : "Tell others what was helpful…"} /></label><div><button className="button" disabled={loading}>{uk ? "Опублікувати" : "Publish"}</button>{editing && <button type="button" className="small-button" onClick={() => { setEditing(null); setComment(""); setRating(5); }}>{uk ? "Скасувати" : "Cancel"}</button>}</div></form>)}
          {message && <p className="profile-message">{message}</p>}
          <div className="review-list">{profile.reviews.length === 0 ? <div className="profile-empty"><span>☆</span><h3>{uk ? "Відгуків поки немає" : "No reviews yet"}</h3><p>{uk ? "Перший відгук з’явиться після завершеної консультації." : "The first review will appear after a completed consultation."}</p></div> : visibleReviews.map((review) => <article key={review.id}><header><div className="review-author"><span>{review.client.avatarUrl ? <img src={review.client.avatarUrl} alt="" /> : <>{review.client.firstName[0]}{review.client.lastName[0]}</>}</span><div><strong>{review.client.firstName} {review.client.lastName}</strong><small>{uk ? "Підтверджений відгук" : "Verified review"}</small></div></div><div><strong>{"★".repeat(review.rating)}<i>{"★".repeat(5 - review.rating)}</i></strong><small>{new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "medium", timeZone: "Europe/Kyiv" }).format(new Date(review.createdAt))}</small></div></header><p>{review.comment}</p>{!isOwnProfile && user?.id === review.client.id && <footer><button onClick={() => { setEditing(review); setRating(review.rating); setComment(review.comment); document.querySelector(".review-form")?.scrollIntoView({ behavior: "smooth" }); }}>{uk ? "Редагувати" : "Edit"}</button><button onClick={() => void removeReview(review.id)}>{uk ? "Видалити" : "Delete"}</button></footer>}</article>)}</div>
          {reviewPageCount > 1 && <nav className="review-pagination" aria-label={uk ? "Сторінки відгуків" : "Review pages"}><button type="button" disabled={currentReviewPage === 1} onClick={() => openReviewPage(currentReviewPage - 1)}>← <span>{uk ? "Попередня" : "Previous"}</span></button><div>{Array.from({ length: reviewPageCount }, (_, index) => index + 1).map((page) => <button type="button" className={page === currentReviewPage ? "is-active" : ""} aria-current={page === currentReviewPage ? "page" : undefined} onClick={() => openReviewPage(page)} key={page}>{page}</button>)}</div><button type="button" disabled={currentReviewPage === reviewPageCount} onClick={() => openReviewPage(currentReviewPage + 1)}><span>{uk ? "Наступна" : "Next"}</span> →</button></nav>}
        </section>
      </div>
      <aside className="profile-book-card"><p className="eyebrow">{uk ? "Онлайн-запис" : "Online booking"}</p><h2>{uk ? "Оберіть послугу" : "Choose a service"}</h2><p>{uk ? "Ціна, тривалість і вільний час залежать від обраної послуги." : "Price, duration and availability depend on the selected service."}</p>{profile.services.slice(0, 3).map((assignment) => <button key={assignment.service.id} onClick={() => onBook(assignment.service.id, profile.id)}><span>{uk ? assignment.service.nameUk : assignment.service.nameEn}</span><strong>{assignment.durationMin ?? assignment.service.durationMin} min · {money(assignment.priceCents ?? assignment.service.priceCents)}</strong></button>)}</aside>
    </div>
  </main>;
};
