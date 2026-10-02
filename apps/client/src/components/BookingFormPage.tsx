import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "../lib/auth-api";
import { createAppointment, getAvailability, getServices, getSpecialists, type Service, type Specialist } from "../lib/scheduling-api";

type Props = { token: string; user: AuthUser; locale: "uk" | "en"; onComplete: () => void; onViewProfile: (specialistId: string, serviceId: string) => void };
type Slot = { startsAt: string; endsAt: string };
type Step = 1 | 2 | 3 | 4 | 5;

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatTime = (value: string, locale: "uk" | "en") => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv",
}).format(new Date(value));

const formatMoney = (priceCents: number) => `${(priceCents / 100).toFixed(0)} ₴`;
const formatRange = (service: Service) => {
  const minimum = service.minPriceCents ?? service.priceCents;
  const maximum = service.maxPriceCents ?? service.priceCents;
  if (minimum == null || maximum == null) return "";
  return minimum === maximum ? formatMoney(minimum) : `${formatMoney(minimum).replace(" ₴", "")}–${formatMoney(maximum)}`;
};

export const BookingFormPage = ({ token, user, locale, onComplete, onViewProfile }: Props) => {
  const uk = locale === "uk";
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialServiceId = initialParams.get("serviceId") ?? "";
  const requestedSpecialistId = initialParams.get("specialistId") ?? "";
  const [services, setServices] = useState<Service[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [specialistId, setSpecialistId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [serviceQuery, setServiceQuery] = useState("");
  const [specialistQuery, setSpecialistQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [clientNote, setClientNote] = useState("");
  const [activeStep, setActiveStep] = useState<Step>(initialServiceId ? 2 : 1);
  const activeStepRef = useRef<HTMLElement>(null);
  const previousStepRef = useRef<Step>(1);

  const service = services.find((item) => item.id === serviceId);
  const specialist = specialists.find((item) => item.id === specialistId);
  const specialistPrice = specialist
    ? specialist.services.find((item) => item.service.id === serviceId)?.priceCents ?? service?.priceCents ?? null
    : null;
  const specialistDuration = specialist
    ? specialist.services.find((item) => item.service.id === serviceId)?.durationMin ?? service?.durationMin ?? null
    : null;
  const availableSpecialists = useMemo(() => specialists.filter((item) => item.user.id !== user.id), [specialists, user.id]);
  const visibleServices = useMemo(() => {
    const query = serviceQuery.trim().toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB");
    if (!query) return services.slice(0, 3);
    return services.filter((item) => `${uk ? item.nameUk : item.nameEn} ${uk ? item.descriptionUk ?? "" : item.descriptionEn ?? ""}`.toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB").includes(query));
  }, [locale, serviceQuery, services, uk]);
  const visibleSpecialists = useMemo(() => {
    const query = specialistQuery.trim().toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB");
    if (!query) return availableSpecialists;
    return availableSpecialists.filter((item) => `${item.user.firstName} ${item.user.lastName} ${uk ? item.specializationUk : item.specializationEn ?? ""}`.toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB").includes(query));
  }, [availableSpecialists, locale, specialistQuery, uk]);

  const text = uk ? {
    eyebrow: "Новий запис", title: "Запишіться на консультацію", subtitle: "П’ять коротких кроків — система покаже лише вільний час.",
    service: "Оберіть послугу", specialist: "Оберіть спеціаліста", date: "Оберіть дату", time: "Оберіть вільний час",
    noServices: "Адміністратор ще не додав активні послуги.", noSpecialists: "Для цієї послуги немає доступних спеціалістів.", noSlots: "На цю дату вільного часу немає.",
    summary: "Підтвердження", duration: "Тривалість", price: "Вартість", note: "Повідомлення спеціалісту", noteOptional: "необов’язково", notePlaceholder: "Наприклад, коротко опишіть питання, яке хочете обговорити", confirm: "Надіслати заявку", loading: "Перевіряємо…", searchServices: "Знайти серед усіх послуг", searchSpecialists: "Знайти спеціаліста", nothingFound: "Нічого не знайдено.", popular: "Три популярні послуги. Інші знайдіть через пошук.", previous: "Повернутися до попереднього кроку", change: "Змінити", continue: "Продовжити", noNote: "Без повідомлення",
  } : {
    eyebrow: "New appointment", title: "Book a consultation", subtitle: "Five short steps — the system only shows genuinely available times.",
    service: "Choose a service", specialist: "Choose a specialist", date: "Choose a date", time: "Choose an available time",
    noServices: "The administrator has not added active services yet.", noSpecialists: "No specialists are available for this service.", noSlots: "No available times on this date.",
    summary: "Confirmation", duration: "Duration", price: "Price", note: "Message to the specialist", noteOptional: "optional", notePlaceholder: "For example, briefly describe what you would like to discuss", confirm: "Send request", loading: "Checking…", searchServices: "Search all services", searchSpecialists: "Find a specialist", nothingFound: "Nothing found.", popular: "Three popular services. Use search to find the rest.", previous: "Return to the previous step", change: "Change", continue: "Continue", noNote: "No message",
  };

  useEffect(() => { void getServices().then((result) => setServices(result.services)).catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    setSpecialistId(""); setSpecialistQuery(""); setDate(""); setSlot(null); setSlots([]);
    if (!serviceId) { setSpecialists([]); return; }
    void getSpecialists(serviceId).then((result) => { setSpecialists(result.specialists); if (requestedSpecialistId && result.specialists.some((item) => item.id === requestedSpecialistId)) { setSpecialistId(requestedSpecialistId); setActiveStep(3); } }).catch((error) => setMessage(error.message));
  }, [serviceId]);
  useEffect(() => {
    setSlot(null); setSlots([]);
    if (!serviceId || !specialistId || !date) return;
    setLoading(true); setMessage("");
    void getAvailability(specialistId, serviceId, date)
      .then((result) => setSlots(result.slots))
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [date, serviceId, specialistId]);
  useEffect(() => {
    const previousStep = previousStepRef.current;
    previousStepRef.current = activeStep;
    if (previousStep === activeStep) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const element = activeStepRef.current;
        if (!element) return;
        const targetTop = window.scrollY + element.getBoundingClientRect().top - 94;
        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeStep]);

  const submit = async () => {
    if (!slot) return;
    setLoading(true); setMessage("");
    try {
      await createAppointment(token, { serviceId, specialistId, startsAt: slot.startsAt, clientNote: clientNote.trim() || undefined });
      onComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error");
      const refreshed = await getAvailability(specialistId, serviceId, date).catch(() => ({ slots: [] }));
      setSlots(refreshed.slots); setSlot(null); setLoading(false);
    }
  };

  const openStep = (step: Step) => {
    if (step < 4) setSlot(null);
    setActiveStep(step);
  };

  const dateLabel = date
    ? new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "long", timeZone: "Europe/Kyiv" }).format(new Date(`${date}T12:00:00.000Z`))
    : "—";

  const collapsedStep = (number: Step, label: string, value: string) => <button type="button" className="booking-step-summary" onClick={() => openStep(number)} aria-label={`${text.change}: ${label}`}>
    <span className="booking-step__number">0{number}</span><span><small>{label}</small><strong>{value}</strong></span><i aria-hidden="true">⌃</i>
  </button>;

  return <section className="booking-form-page">
    <header className="booking-form-heading"><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p>{text.subtitle}</p></header>
    <div className="booking-form-layout">
      <div className="booking-form-steps">
        {activeStep === 1 ? <section ref={activeStepRef} className="booking-step booking-step--reveal"><div className="booking-step__number">01</div><div className="booking-step__content"><h2>{text.service}</h2>{services.length === 0 ? <p className="booking-empty-copy">{text.noServices}</p> : <><label className="booking-search"><span>{text.searchServices}</span><input type="search" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder={text.searchServices} /></label>{!serviceQuery.trim() && services.length > 3 && <p className="booking-list-hint">{text.popular}</p>}<div className="booking-option-grid booking-option-grid--scroll">{visibleServices.map((item) => <button type="button" className={serviceId === item.id ? "booking-option is-selected" : "booking-option"} key={item.id} onClick={() => { setServiceId(item.id); setActiveStep(2); }}><strong>{uk ? item.nameUk : item.nameEn}</strong><span>{item.durationMin} min{formatRange(item) ? ` · ${formatRange(item)}` : ""}</span></button>)}{visibleServices.length === 0 && <p className="booking-empty-copy">{text.nothingFound}</p>}</div></>}</div></section> : service && collapsedStep(1, text.service, uk ? service.nameUk : service.nameEn)}
        {serviceId && (activeStep === 2 ? (
          <section ref={activeStepRef} className="booking-step booking-step--reveal">
            <div className="booking-step__number">02</div>
            <div className="booking-step__content">
              <div className="booking-step__heading">
                <h2>{text.specialist}</h2>
                <button type="button" className="booking-step__back" onClick={() => openStep(1)} aria-label={text.previous}>↑</button>
              </div>
              {availableSpecialists.length === 0 ? <p className="booking-empty-copy">{text.noSpecialists}</p> : <>
                <label className="booking-search"><span>{text.searchSpecialists}</span><input type="search" value={specialistQuery} onChange={(event) => setSpecialistQuery(event.target.value)} placeholder={text.searchSpecialists} /></label>
                <div className="booking-option-grid booking-option-grid--scroll specialist-choice-grid">
                  {visibleSpecialists.map((item) => {
                    const assignment = item.services.find((entry) => entry.service.id === serviceId);
                    const price = assignment?.priceCents ?? service?.priceCents;
                    const duration = assignment?.durationMin ?? service?.durationMin;
                    const selectSpecialist = () => {
                      if (item.id !== specialistId) { setSpecialistId(item.id); setDate(""); setSlot(null); }
                      setActiveStep(3);
                    };
                    return <article
                      className={specialistId === item.id ? "booking-option booking-option--person specialist-choice-card is-selected" : "booking-option booking-option--person specialist-choice-card"}
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${uk ? "Обрати спеціаліста" : "Choose specialist"}: ${item.user.firstName} ${item.user.lastName}`}
                      onClick={selectSpecialist}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectSpecialist(); } }}
                    >
                      <button
                        type="button"
                        className="specialist-choice-avatar"
                        onClick={(event) => { event.stopPropagation(); onViewProfile(item.id, serviceId); }}
                        aria-label={`${uk ? "Переглянути профіль" : "View profile"}: ${item.user.firstName} ${item.user.lastName}`}
                        title={uk ? "Переглянути профіль" : "View profile"}
                      >
                        {item.photoUrl ? <img src={item.photoUrl} alt="" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" /></svg>}
                      </button>
                      <span>
                        <strong>{item.user.firstName} {item.user.lastName}</strong>
                        <small>{uk ? item.specializationUk : item.specializationEn}{duration ? ` · ${duration} min` : ""}{price == null ? "" : ` · ${formatMoney(price)}`}</small>
                        <small className="specialist-card-rating">{item.averageRating == null ? (uk ? "Ще без відгуків" : "No reviews yet") : `★ ${item.averageRating.toFixed(1)} · ${item.reviewCount}`} · {item.completedConsultations} {uk ? "консультацій" : "consultations"}</small>
                      </span>
                    </article>;
                  })}
                  {visibleSpecialists.length === 0 && <p className="booking-empty-copy">{text.nothingFound}</p>}
                </div>
              </>}
            </div>
          </section>
        ) : specialist && activeStep > 2 ? collapsedStep(2, text.specialist, `${specialist.user.firstName} ${specialist.user.lastName}${specialistDuration ? ` · ${specialistDuration} min` : ""}${specialistPrice == null ? "" : ` · ${formatMoney(specialistPrice)}`}`) : null)}
        {serviceId && specialistId && (activeStep === 3 ? <section ref={activeStepRef} className="booking-step booking-step--reveal"><div className="booking-step__number">03</div><div className="booking-step__content"><div className="booking-step__heading"><h2>{text.date}</h2><button type="button" className="booking-step__back" onClick={() => openStep(2)} aria-label={text.previous}>↑</button></div><div className="booking-date-actions"><input className="booking-date-input" type="date" min={today()} value={date} onChange={(event) => { setDate(event.target.value); setSlot(null); setActiveStep(4); }} />{date && <button type="button" className="small-button" onClick={() => setActiveStep(4)}>{text.continue}</button>}</div></div></section> : date && activeStep > 3 ? collapsedStep(3, text.date, dateLabel) : null)}
        {serviceId && specialistId && date && (activeStep === 4 ? <section ref={activeStepRef} className="booking-step booking-step--reveal"><div className="booking-step__number">04</div><div className="booking-step__content"><div className="booking-step__heading"><h2>{text.time}</h2><button type="button" className="booking-step__back" onClick={() => openStep(3)} aria-label={text.previous}>↑</button></div><div className="booking-time-grid">{loading ? <span>{text.loading}</span> : slots.map((item) => <button type="button" className={slot?.startsAt === item.startsAt ? "is-selected" : ""} key={item.startsAt} onClick={() => { setSlot(item); setActiveStep(5); }}>{formatTime(item.startsAt, locale)}–{formatTime(item.endsAt, locale)}</button>)}{!loading && slots.length === 0 && <span>{text.noSlots}</span>}</div></div></section> : slot && activeStep > 4 ? collapsedStep(4, text.time, `${formatTime(slot.startsAt, locale)}–${formatTime(slot.endsAt, locale)}`) : null)}
        {slot && activeStep === 5 && <section ref={activeStepRef} className="booking-step booking-step--reveal"><div className="booking-step__number">05</div><div className="booking-step__content"><div className="booking-step__heading"><h2>{text.note} <small className="booking-step__optional">({text.noteOptional})</small></h2><button type="button" className="booking-step__back" onClick={() => openStep(4)} aria-label={text.previous}>↑</button></div><label className="booking-note-step"><span className="sr-only">{text.note}</span><textarea maxLength={500} rows={4} value={clientNote} onChange={(event) => setClientNote(event.target.value)} placeholder={text.notePlaceholder} /><small>{clientNote.length}/500 · {clientNote ? text.noteOptional : text.noNote}</small></label></div></section>}
      </div>
      <aside className="booking-confirm-card"><p className="eyebrow">{text.summary}</p><h2>{service ? (uk ? service.nameUk : service.nameEn) : "—"}</h2><dl><div><dt>{text.specialist}</dt><dd>{specialist ? `${specialist.user.firstName} ${specialist.user.lastName}` : "—"}</dd></div><div><dt>{text.date}</dt><dd>{slot ? new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", { dateStyle: "long", timeZone: "Europe/Kyiv" }).format(new Date(slot.startsAt)) : date || "—"}</dd></div><div><dt>{text.time}</dt><dd>{slot ? `${formatTime(slot.startsAt, locale)}–${formatTime(slot.endsAt, locale)}` : "—"}</dd></div><div><dt>{text.duration}</dt><dd>{specialistDuration ? `${specialistDuration} min` : service ? `${service.durationMin} min` : "—"}</dd></div><div><dt>{text.price}</dt><dd>{specialistPrice == null ? (service ? formatRange(service) || "—" : "—") : formatMoney(specialistPrice)}</dd></div></dl><button className="button button--wide" disabled={!slot || loading} onClick={() => void submit()}>{loading ? text.loading : text.confirm}</button>{message && <p className="booking-feedback">{message}</p>}</aside>
    </div>
  </section>;
};
