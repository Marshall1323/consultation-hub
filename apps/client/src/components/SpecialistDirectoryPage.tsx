import { useEffect, useMemo, useState } from "react";
import { getSpecialists, type Specialist } from "../lib/scheduling-api";

type Locale = "uk" | "en";

type Props = {
  locale: Locale;
  onViewProfile: (specialistId: string) => void;
  onBook: (specialistId: string, serviceId: string) => void;
};

const initials = (item: Specialist) => `${item.user.firstName[0] ?? ""}${item.user.lastName[0] ?? ""}`.toUpperCase();
const priceRange = (item: Specialist, locale: Locale) => {
  const values = item.services.map(({ priceCents, service }) => priceCents ?? service.priceCents).filter((value): value is number => value != null);
  if (!values.length) return locale === "uk" ? "Ціна уточнюється" : "Price on request";
  const min = Math.min(...values) / 100;
  const max = Math.max(...values) / 100;
  return `${min === max ? min : `${min}–${max}`} ₴`;
};

export const SpecialistDirectoryPage = ({ locale, onViewProfile, onBook }: Props) => {
  const [items, setItems] = useState<Specialist[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const copy = locale === "uk" ? {
    eyebrow: "КАТАЛОГ СПЕЦІАЛІСТІВ", title: "Знайдіть свого консультанта", lead: "Перегляньте досвід, напрямки роботи та відгуки перед записом.",
    search: "Ім’я, спеціалізація або послуга", found: "Знайдено", specialists: "спеціалістів", profile: "Переглянути профіль", book: "Записатися",
    consultations: "консультацій", reviews: "відгуків", noReviews: "Новий спеціаліст", directions: "Напрями роботи", more: "ще", empty: "За вашим запитом нікого не знайдено.", error: "Не вдалося завантажити спеціалістів.",
  } : {
    eyebrow: "SPECIALIST DIRECTORY", title: "Find your consultant", lead: "Review experience, services and feedback before booking.",
    search: "Name, specialization or service", found: "Found", specialists: "specialists", profile: "View profile", book: "Book",
    consultations: "consultations", reviews: "reviews", noReviews: "New specialist", directions: "Areas of work", more: "more", empty: "No specialists match your search.", error: "Could not load specialists.",
  };

  useEffect(() => {
    let active = true;
    getSpecialists()
      .then(({ specialists }) => { if (active) setItems(specialists); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale === "uk" ? "uk" : "en");
    if (!needle) return items;
    return items.filter((item) => [
      item.user.firstName, item.user.lastName, item.specializationUk, item.specializationEn ?? "", ...item.languages,
      ...item.services.flatMap(({ service }) => [service.nameUk, service.nameEn]),
    ].join(" ").toLocaleLowerCase(locale === "uk" ? "uk" : "en").includes(needle));
  }, [items, locale, query]);

  return <main className="specialists-directory" id="top">
    <section className="specialists-directory__content">
      <div className="specialists-directory__heading"><p>{copy.eyebrow}</p><h1>{copy.title}</h1><span>{copy.lead}</span></div>
      <label className="specialists-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} /></label>
      {!loading && !error && <p className="specialists-count">{copy.found}: <strong>{filtered.length}</strong> {copy.specialists}</p>}
      {error ? <div className="specialists-empty">{copy.error}</div> : loading ? <div className="specialists-grid">{[0,1,2,3,4,5].map((key) => <div className="specialist-directory-card is-loading" key={key} />)}</div> : filtered.length ? <div className="specialists-grid">
        {filtered.map((item) => {
          const specialization = locale === "uk" ? item.specializationUk : item.specializationEn ?? item.specializationUk;
          return <article className="specialist-directory-card" key={item.id} onClick={() => onViewProfile(item.id)}>
            <div className="specialist-directory-card__top">
              <span className="specialist-directory-card__avatar">{item.photoUrl ? <img src={item.photoUrl} alt="" /> : initials(item)}</span>
              <div><h2>{item.user.firstName} {item.user.lastName}</h2><p>{specialization}</p></div>
            </div>
            <div className="specialist-directory-card__stats">
              <span><strong>{item.averageRating ? `★ ${item.averageRating.toFixed(1)}` : "—"}</strong>{item.reviewCount ? `${item.reviewCount} ${copy.reviews}` : copy.noReviews}</span>
              <span><strong>{item.completedConsultations}</strong>{copy.consultations}</span>
              <span><strong>{priceRange(item, locale)}</strong>{item.services.length ? `${item.services.length} ${locale === "uk" ? "послуг" : "services"}` : ""}</span>
            </div>
            <div className="specialist-directory-card__services"><small>{copy.directions}</small><div>{item.services.slice(0, 2).map(({ service }) => <span key={service.id}>{locale === "uk" ? service.nameUk : service.nameEn}</span>)}{item.services.length > 2 && <b>+{item.services.length - 2} {copy.more}</b>}</div></div>
            <div className="specialist-directory-card__actions">
              <button type="button" onClick={(event) => { event.stopPropagation(); onViewProfile(item.id); }}>{copy.profile}</button>
              <button className="is-primary" type="button" disabled={!item.services[0]} onClick={(event) => { event.stopPropagation(); const serviceId = item.services[0]?.service.id; if (serviceId) onBook(item.id, serviceId); }}>{copy.book}</button>
            </div>
          </article>;
        })}
      </div> : <div className="specialists-empty">{copy.empty}</div>}
    </section>
  </main>;
};
