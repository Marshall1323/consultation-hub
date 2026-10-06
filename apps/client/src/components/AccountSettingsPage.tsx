import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, changeAccountPassword, requestPasswordReset, updateAccountProfile, type AuthUser } from "../lib/auth-api";
import { showToast } from "../lib/toast";

type Section = "personal" | "security" | "professional";
type Props = { token: string; user: AuthUser; locale: "uk" | "en"; onUserUpdated: (user: AuthUser) => void; children?: ReactNode };

export const AccountSettingsPage = ({ token, user, locale, onUserUpdated, children }: Props) => {
  const uk = locale === "uk";
  const inputRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<Section>(() => {
    const requested = new URLSearchParams(window.location.search).get("section");
    return requested === "security" || (requested === "professional" && user.role === "SPECIALIST") ? requested : "personal";
  });
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  useEffect(() => setAvatarUrl(user.avatarUrl), [user.avatarUrl]);
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const errorText = (error: unknown) => error instanceof ApiError ? error.message : uk ? "Не вдалося зберегти зміни." : "Could not save changes.";

  const chooseAvatar = (file?: File) => {
    if (!file) return;
    if (!/image\/(png|jpeg|webp)/.test(file.type) || file.size > 2_000_000) {
      showToast(uk ? "Оберіть PNG, JPG або WebP до 2 МБ." : "Choose a PNG, JPG or WebP image up to 2 MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setAvatarUrl(String(reader.result)); showToast(uk ? "Фото вибрано. Збережіть зміни." : "Photo selected. Save your changes.", "info"); };
    reader.readAsDataURL(file);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingProfile(true);
    const values = new FormData(event.currentTarget);
    try {
      const result = await updateAccountProfile(token, { firstName: String(values.get("firstName")), lastName: String(values.get("lastName")), email: String(values.get("email")), avatarUrl });
      onUserUpdated(result.user); showToast(uk ? "Особисті дані збережено." : "Personal details saved.", "success");
    } catch (error) { showToast(errorText(error), "error"); } finally { setSavingProfile(false); }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingPassword(true);
    const form = event.currentTarget; const values = new FormData(form);
    const newPassword = String(values.get("newPassword"));
    if (newPassword !== String(values.get("repeatPassword"))) { showToast(uk ? "Нові паролі не збігаються." : "New passwords do not match.", "error"); setSavingPassword(false); return; }
    try { await changeAccountPassword(token, { currentPassword: String(values.get("currentPassword")), newPassword }); form.reset(); showToast(uk ? "Пароль успішно змінено." : "Password changed successfully.", "success"); }
    catch (error) { showToast(errorText(error), "error"); } finally { setSavingPassword(false); }
  };

  const forgotPassword = async () => { try { const result = await requestPasswordReset(user.email); showToast(uk ? "Відновлення через код на пошту підключимо пізніше. Поки пароль можна змінити тут." : result.message, "info"); } catch (error) { showToast(errorText(error), "error"); } };
  const item = (id: Section, title: string, subtitle: string) => <button type="button" className={section === id ? "is-active" : ""} onClick={() => setSection(id)}><span>{title}</span><small>{subtitle}</small><b>›</b></button>;

  return <section className="account-settings">
    <header className="settings-heading"><div><p className="eyebrow">{uk ? "Налаштування" : "Settings"}</p><h1>{uk ? "Обліковий запис" : "Account"}</h1></div></header>
    <div className="settings-layout">
      <aside className="settings-nav" aria-label={uk ? "Розділи налаштувань" : "Settings sections"}>
        <div className="settings-nav__identity">{avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials}</span>}<div><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div></div>
        {item("personal", uk ? "Особисті дані" : "Personal details", uk ? "Ім’я, пошта та фото" : "Name, email and photo")}
        {item("security", uk ? "Пароль і безпека" : "Password and security", uk ? "Зміна та відновлення" : "Change and recovery")}
        {user.role === "SPECIALIST" && item("professional", uk ? "Дані консультанта" : "Consultant details", uk ? "Публічний профіль" : "Public profile")}
      </aside>
      <div className="settings-content">
        {section === "personal" && <form className="settings-card settings-profile" onSubmit={saveProfile}>
          <div className="settings-card__heading"><div><h2>{uk ? "Особисті дані" : "Personal details"}</h2><p>{uk ? "Інформація для записів і календаря." : "Information used in bookings and the calendar."}</p></div><div className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials}</span>}<button type="button" onClick={() => inputRef.current?.click()}>{uk ? "Змінити фото" : "Change photo"}</button><input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseAvatar(event.target.files?.[0])} /></div></div>
          <div className="settings-grid"><label><span>{uk ? "Ім’я" : "First name"}</span><input name="firstName" defaultValue={user.firstName} minLength={2} maxLength={50} required /></label><label><span>{uk ? "Прізвище" : "Last name"}</span><input name="lastName" defaultValue={user.lastName} minLength={2} maxLength={50} required /></label><label className="settings-wide"><span>{uk ? "Електронна пошта" : "Email"}</span><input name="email" type="email" defaultValue={user.email} required /></label></div>
          <div className="settings-actions"><button className="button" disabled={savingProfile}>{savingProfile ? (uk ? "Збереження…" : "Saving…") : (uk ? "Зберегти зміни" : "Save changes")}</button>{avatarUrl && <button className="button button--quiet" type="button" onClick={() => setAvatarUrl(null)}>{uk ? "Видалити фото" : "Remove photo"}</button>}</div>
        </form>}
        {section === "security" && <form className="settings-card" onSubmit={savePassword}>
          <div className="settings-card__heading"><div><h2>{uk ? "Пароль і безпека" : "Password and security"}</h2><p>{uk ? "Змініть пароль або скористайтеся майбутнім відновленням." : "Change your password or use the upcoming recovery option."}</p></div></div>
          <div className="settings-grid settings-grid--password"><label><span>{uk ? "Поточний пароль" : "Current password"}</span><input name="currentPassword" type="password" required /></label><label><span>{uk ? "Новий пароль" : "New password"}</span><input name="newPassword" type="password" minLength={8} required /></label><label><span>{uk ? "Повторіть новий пароль" : "Repeat new password"}</span><input name="repeatPassword" type="password" minLength={8} required /></label></div>
          <div className="settings-actions"><button className="button" disabled={savingPassword}>{savingPassword ? (uk ? "Збереження…" : "Saving…") : (uk ? "Змінити пароль" : "Change password")}</button><button type="button" className="text-button" onClick={() => void forgotPassword()}>{uk ? "Забули пароль?" : "Forgot password?"}</button></div>
        </form>}
        {section === "professional" && children}
      </div>
    </div>
  </section>;
};
