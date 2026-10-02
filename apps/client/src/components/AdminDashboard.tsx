import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserRole } from "../lib/auth-api";
import { AdminAppointmentsPanel, AdminSchedulePanel } from "./AdminSchedulingPanels";
import {
  assignService,
  createService,
  createSpecialist,
  getAdminServices,
  getAdminSpecialists,
  getAdminUsers,
  updateService,
  updateSpecialist,
  updateUserRole,
  updateUserStatus,
  type AdminSpecialist,
  type AdminUser,
  type CatalogService,
} from "../lib/admin-api";

type AdminTab = "users" | "services" | "specialists" | "schedule" | "appointments";

type Props = {
  token: string;
  locale: "uk" | "en";
  onLogout: () => void;
};

export const AdminDashboard = ({ token, locale, onLogout }: Props) => {
  const uk = locale === "uk";
  const [tab, setTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [specialists, setSpecialists] = useState<AdminSpecialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const labels = uk
    ? {
        title: "Керування системою",
        subtitle: "Користувачі, спеціалісти та послуги в одному місці.",
        users: "Користувачі",
        services: "Послуги",
        specialists: "Спеціалісти",
        schedule: "Графіки",
        appointments: "Записи",
        totalUsers: "Усього користувачів",
        activeServices: "Активних послуг",
        activeSpecialists: "Активних спеціалістів",
        role: "Роль",
        status: "Статус",
        active: "Активний",
        inactive: "Неактивний",
        promoteAdmin: "Зробити адміністратором",
        makeClient: "Зробити клієнтом",
        newService: "Нова послуга",
        nameUk: "Назва українською",
        nameEn: "Назва англійською",
        descriptionUk: "Опис українською",
        descriptionEn: "Опис англійською",
        duration: "Тривалість, хв",
        price: "Вартість, грн",
        addService: "Додати послугу",
        noServices: "Послуг поки немає.",
        newSpecialist: "Новий спеціаліст",
        chooseUser: "Оберіть користувача",
        specializationUk: "Спеціалізація українською",
        specializationEn: "Спеціалізація англійською",
        addSpecialist: "Створити профіль спеціаліста",
        assign: "Призначити послугу",
        chooseService: "Оберіть послугу",
        assignmentPrice: "Ціна, грн",
        noSpecialists: "Спеціалістів поки немає.",
        saved: "Зміни збережено.",
        error: "Не вдалося виконати дію.",
        logout: "Вийти",
        activate: "Активувати",
        deactivate: "Деактивувати",
      }
    : {
        title: "System management",
        subtitle: "Users, specialists and services in one place.",
        users: "Users",
        services: "Services",
        specialists: "Specialists",
        schedule: "Schedules",
        appointments: "Appointments",
        totalUsers: "Total users",
        activeServices: "Active services",
        activeSpecialists: "Active specialists",
        role: "Role",
        status: "Status",
        active: "Active",
        inactive: "Inactive",
        promoteAdmin: "Make administrator",
        makeClient: "Make client",
        newService: "New service",
        nameUk: "Ukrainian name",
        nameEn: "English name",
        descriptionUk: "Ukrainian description",
        descriptionEn: "English description",
        duration: "Duration, min",
        price: "Price, UAH",
        addService: "Add service",
        noServices: "No services yet.",
        newSpecialist: "New specialist",
        chooseUser: "Choose a user",
        specializationUk: "Ukrainian specialization",
        specializationEn: "English specialization",
        addSpecialist: "Create specialist profile",
        assign: "Assign service",
        chooseService: "Choose a service",
        assignmentPrice: "Price, UAH",
        noSpecialists: "No specialists yet.",
        saved: "Changes saved.",
        error: "Could not complete the action.",
        logout: "Sign out",
        activate: "Activate",
        deactivate: "Deactivate",
      };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersResult, servicesResult, specialistsResult] = await Promise.all([
        getAdminUsers(token),
        getAdminServices(token),
        getAdminSpecialists(token),
      ]);
      setUsers(usersResult.users);
      setServices(servicesResult.services);
      setSpecialists(specialistsResult.specialists);
    } catch {
      setMessage(labels.error);
    } finally {
      setLoading(false);
    }
  }, [token, labels.error]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const availableUsers = useMemo(
    () => users.filter((user) => user.role === "CLIENT" && !user.specialist),
    [users],
  );

  const runAction = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setMessage("");
    try {
      await action();
      setMessage(labels.saved);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.error);
    } finally {
      setSaving(false);
    }
  };

  const handleService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const price = Number(data.get("price"));

    void runAction(async () => {
      await createService(token, {
        nameUk: String(data.get("nameUk")),
        nameEn: String(data.get("nameEn")),
        descriptionUk: String(data.get("descriptionUk")) || null,
        descriptionEn: String(data.get("descriptionEn")) || null,
        durationMin: Number(data.get("durationMin")),
        priceCents: Number.isFinite(price) ? Math.round(price * 100) : null,
      });
      form.reset();
    });
  };

  const handleSpecialist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runAction(async () => {
      await createSpecialist(token, {
        userId: String(data.get("userId")),
        specializationUk: String(data.get("specializationUk")),
        specializationEn: String(data.get("specializationEn")) || undefined,
        descriptionUk: String(data.get("descriptionUk")) || undefined,
        descriptionEn: String(data.get("descriptionEn")) || undefined,
      });
      form.reset();
    });
  };

  const changeRole = (userId: string, role: UserRole) =>
    void runAction(() => updateUserRole(token, userId, role));

  return (
    <section className="admin-dashboard" id="account">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>{labels.title}</h2>
          <p>{labels.subtitle}</p>
        </div>
        <div className="admin-heading-actions">
          <div className="admin-stats">
            <span><strong>{users.length}</strong>{labels.totalUsers}</span>
            <span><strong>{services.filter((service) => service.isActive).length}</strong>{labels.activeServices}</span>
            <span><strong>{specialists.filter((specialist) => specialist.isActive).length}</strong>{labels.activeSpecialists}</span>
          </div>
          <button className="button button--quiet" onClick={onLogout}>{labels.logout}</button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        {(["users", "services", "specialists", "schedule", "appointments"] as AdminTab[]).map((item) => (
          <button
            key={item}
            className={tab === item ? "is-active" : ""}
            onClick={() => setTab(item)}
            role="tab"
            aria-selected={tab === item}
          >
            {labels[item]}
          </button>
        ))}
      </div>

      {message && <p className="admin-message" role="status">{message}</p>}
      {loading ? <p className="admin-loading">Loading…</p> : null}

      {!loading && tab === "users" && (
        <div className="admin-list">
          {users.map((item) => (
            <article className="admin-list-item" key={item.id}>
              <span className="account-avatar">{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : item.firstName.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{item.firstName} {item.lastName}</strong>
                <span>{item.email}</span>
              </div>
              <span className="role-badge">{item.role}</span>
              <span className={item.isActive ? "status-badge" : "status-badge is-inactive"}>
                {item.isActive ? labels.active : labels.inactive}
              </span>
              {item.role === "CLIENT" && (
                <button className="small-button" disabled={saving} onClick={() => changeRole(item.id, "ADMIN")}>
                  {labels.promoteAdmin}
                </button>
              )}
              {item.role === "ADMIN" && (
                <button className="small-button" disabled={saving} onClick={() => changeRole(item.id, "CLIENT")}>
                  {labels.makeClient}
                </button>
              )}
              <button
                className="small-button"
                disabled={saving}
                onClick={() => void runAction(() => updateUserStatus(token, item.id, !item.isActive))}
              >
                {item.isActive ? labels.deactivate : labels.activate}
              </button>
            </article>
          ))}
        </div>
      )}

      {!loading && tab === "services" && (
        <div className="admin-workspace">
          <form className="admin-form" onSubmit={handleService}>
            <h3>{labels.newService}</h3>
            <label className="field"><span>{labels.nameUk}</span><input name="nameUk" required minLength={2} /></label>
            <label className="field"><span>{labels.nameEn}</span><input name="nameEn" required minLength={2} /></label>
            <label className="field"><span>{labels.descriptionUk}</span><textarea name="descriptionUk" /></label>
            <label className="field"><span>{labels.descriptionEn}</span><textarea name="descriptionEn" /></label>
            <div className="field-row">
              <label className="field"><span>{labels.duration}</span><input name="durationMin" type="number" min="15" step="15" defaultValue="60" required /></label>
              <label className="field"><span>{labels.price}</span><input name="price" type="number" min="0" step="0.01" /></label>
            </div>
            <button className="button" disabled={saving}>{labels.addService}</button>
          </form>
          <div className="catalog-list">
            {services.length === 0 ? <p>{labels.noServices}</p> : services.map((service) => (
              <article key={service.id}>
                <div><strong>{uk ? service.nameUk : service.nameEn}</strong><span>{service.durationMin} min</span></div>
                <p>{uk ? service.descriptionUk : service.descriptionEn}</p>
                <b>{service.priceCents == null ? "—" : `${(service.priceCents / 100).toFixed(2)} ₴`}</b>
                <button
                  className="small-button"
                  disabled={saving}
                  onClick={() => void runAction(() => updateService(token, service.id, { isActive: !service.isActive }))}
                >
                  {service.isActive ? labels.deactivate : labels.activate}
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === "specialists" && (
        <div className="admin-workspace">
          <form className="admin-form" onSubmit={handleSpecialist}>
            <h3>{labels.newSpecialist}</h3>
            <label className="field">
              <span>{labels.chooseUser}</span>
              <select name="userId" required defaultValue="">
                <option value="" disabled>{labels.chooseUser}</option>
                {availableUsers.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} — {item.email}</option>)}
              </select>
            </label>
            <label className="field"><span>{labels.specializationUk}</span><input name="specializationUk" required minLength={2} /></label>
            <label className="field"><span>{labels.specializationEn}</span><input name="specializationEn" /></label>
            <label className="field"><span>{labels.descriptionUk}</span><textarea name="descriptionUk" /></label>
            <label className="field"><span>{labels.descriptionEn}</span><textarea name="descriptionEn" /></label>
            <button className="button" disabled={saving || availableUsers.length === 0}>{labels.addSpecialist}</button>
          </form>
          <div className="catalog-list">
            {specialists.length === 0 ? <p>{labels.noSpecialists}</p> : specialists.map((specialist) => (
              <article key={specialist.id}>
                <div><strong>{specialist.user.firstName} {specialist.user.lastName}</strong><span>{uk ? specialist.specializationUk : specialist.specializationEn}</span></div>
                <p>{uk ? specialist.descriptionUk : specialist.descriptionEn}</p>
                <form
                  className="assign-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = new FormData(event.currentTarget);
                    const serviceId = String(values.get("serviceId"));
                    const priceCents = Math.round(Number(values.get("price")) * 100);
                    void runAction(() => assignService(token, specialist.id, serviceId, priceCents));
                  }}
                >
                  <select name="serviceId" required defaultValue="">
                    <option value="" disabled>{labels.chooseService}</option>
                    {services.filter((service) => !specialist.services.some((item) => item.service.id === service.id)).map((service) => (
                      <option key={service.id} value={service.id}>{uk ? service.nameUk : service.nameEn}</option>
                    ))}
                  </select>
                  <input name="price" type="number" min="0" step="1" placeholder={labels.assignmentPrice} required />
                  <button className="small-button" disabled={saving}>{labels.assign}</button>
                </form>
                <div className="service-tags">
                  {specialist.services.map(({ service, priceCents }) => <span key={service.id}>{uk ? service.nameUk : service.nameEn} · {((priceCents ?? service.priceCents ?? 0) / 100).toFixed(0)} ₴</span>)}
                </div>
                <button
                  className="small-button"
                  disabled={saving}
                  onClick={() => void runAction(() => updateSpecialist(token, specialist.id, { isActive: !specialist.isActive }))}
                >
                  {specialist.isActive ? labels.deactivate : labels.activate}
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === "schedule" && (
        <AdminSchedulePanel token={token} locale={locale} specialists={specialists} />
      )}

      {!loading && tab === "appointments" && (
        <AdminAppointmentsPanel token={token} locale={locale} />
      )}
    </section>
  );
};
