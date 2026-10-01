import { FormEvent, useEffect, useState } from "react";
import { AdminDashboard } from "./components/AdminDashboard";
import { BookingFormPage } from "./components/BookingFormPage";
import { MySessionsCalendar } from "./components/MySessionsCalendar";
import { SpecialistDashboard } from "./components/RoleDashboards";
import {
  ApiError,
  getCurrentUser,
  login,
  register,
  type AuthUser,
} from "./lib/auth-api";

type AuthMode = "login" | "register";
type Locale = "uk" | "en";

const TOKEN_KEY = "consultation_access_token";
const LOCALE_KEY = "consultation_locale";

const translations = {
  uk: {
    languageLabel: "Змінити мову",
    howItWorks: "Як це працює",
    signIn: "Увійти",
    heroEyebrow: "Онлайн-запис на консультації",
    heroTitle: "Зручний час — без дзвінків та очікування",
    heroLead:
      "Оберіть спеціаліста, послугу та вільний час. Система перевірить розклад і одразу підтвердить запис.",
    book: "Записатися на консультацію",
    openAccount: "Відкрити особистий кабінет",
    seeHow: "Подивитися, як це працює →",
    available: "Запис доступний",
    benefitsTitle: "Усе необхідне — на одному екрані",
    benefits: [
      "Лише дійсно вільний час",
      "Усі майбутні записи в одному місці",
      "Скасування без дзвінка спеціалісту",
    ],
    stepsEyebrow: "Три прості кроки",
    stepsTitle: "Запис триватиме кілька хвилин",
    steps: [
      ["01", "Оберіть послугу", "Знайдіть потрібний напрям консультації."],
      ["02", "Оберіть спеціаліста", "Перегляньте опис і доступний час."],
      ["03", "Підтвердьте запис", "Зустріч одразу з’явиться в особистому кабінеті."],
    ],
    personalAccount: "Особистий кабінет",
    loginTitle: "Раді бачити вас знову",
    registerTitle: "Створіть обліковий запис",
    loginTab: "Вхід",
    registerTab: "Реєстрація",
    authChoice: "Спосіб авторизації",
    firstName: "Ім’я",
    lastName: "Прізвище",
    email: "Електронна пошта",
    password: "Пароль",
    passwordLoginPlaceholder: "Введіть пароль",
    passwordRegisterPlaceholder: "Щонайменше 8 символів",
    showPassword: "Показати",
    hidePassword: "Сховати",
    close: "Закрити",
    wait: "Зачекайте…",
    loginButton: "Увійти",
    registerButton: "Створити обліковий запис",
    newHere: "Вперше тут?",
    alreadyRegistered: "Вже маєте обліковий запис?",
    registerLink: "Зареєструватися",
    loginLink: "Увійти",
    accountTitle: (name: string) => `${name}, ви увійшли до системи`,
    accountDescription:
      "На наступному етапі тут з’являться вибір спеціаліста та ваші записи.",
    specialistDescription:
      "Тут з’являться ваш робочий графік, календар консультацій і керування записами.",
    logout: "Вийти",
    footer: "Простий запис на консультації",
    roles: { CLIENT: "Клієнт", SPECIALIST: "Спеціаліст", ADMIN: "Адміністратор" },
    errors: {
      AUTH_EMAIL_EXISTS: "Користувач із такою поштою вже існує.",
      AUTH_INVALID_CREDENTIALS: "Неправильна електронна пошта або пароль.",
      VALIDATION_ERROR: "Перевірте правильність введених даних.",
      REQUEST_FAILED: "Не вдалося зв’язатися із сервером. Спробуйте ще раз.",
    },
  },
  en: {
    languageLabel: "Change language",
    howItWorks: "How it works",
    signIn: "Sign in",
    heroEyebrow: "Online consultation booking",
    heroTitle: "A convenient time — no calls, no waiting",
    heroLead:
      "Choose a specialist, service and available time. The system will check the schedule and confirm your booking instantly.",
    book: "Book a consultation",
    openAccount: "Open my account",
    seeHow: "See how it works →",
    available: "Booking available",
    benefitsTitle: "Everything you need on one screen",
    benefits: [
      "Only genuinely available times",
      "All upcoming bookings in one place",
      "Cancel without calling the specialist",
    ],
    stepsEyebrow: "Three simple steps",
    stepsTitle: "Booking takes just a few minutes",
    steps: [
      ["01", "Choose a service", "Find the type of consultation you need."],
      ["02", "Choose a specialist", "View their profile and available times."],
      ["03", "Confirm your booking", "The appointment appears in your account instantly."],
    ],
    personalAccount: "My account",
    loginTitle: "Welcome back",
    registerTitle: "Create your account",
    loginTab: "Sign in",
    registerTab: "Register",
    authChoice: "Authentication method",
    firstName: "First name",
    lastName: "Last name",
    email: "Email address",
    password: "Password",
    passwordLoginPlaceholder: "Enter your password",
    passwordRegisterPlaceholder: "At least 8 characters",
    showPassword: "Show",
    hidePassword: "Hide",
    close: "Close",
    wait: "Please wait…",
    loginButton: "Sign in",
    registerButton: "Create account",
    newHere: "New here?",
    alreadyRegistered: "Already have an account?",
    registerLink: "Create an account",
    loginLink: "Sign in",
    accountTitle: (name: string) => `${name}, you are signed in`,
    accountDescription:
      "The specialist selector and your appointments will appear here in the next stage.",
    specialistDescription:
      "Your work schedule, consultation calendar and booking controls will appear here.",
    logout: "Sign out",
    footer: "Simple consultation booking",
    roles: { CLIENT: "Client", SPECIALIST: "Specialist", ADMIN: "Administrator" },
    errors: {
      AUTH_EMAIL_EXISTS: "An account with this email already exists.",
      AUTH_INVALID_CREDENTIALS: "Incorrect email or password.",
      VALIDATION_ERROR: "Please check the information you entered.",
      REQUEST_FAILED: "Could not reach the server. Please try again.",
    },
  },
} as const;

type Copy = (typeof translations)[Locale];

type AuthDialogProps = {
  initialMode: AuthMode;
  copy: Copy;
  locale: Locale;
  onClose: () => void;
  onAuthenticated: (user: AuthUser, token: string) => void;
};

const AuthDialog = ({
  initialMode,
  copy,
  locale,
  onClose,
  onAuthenticated,
}: AuthDialogProps) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);

    try {
      const result =
        mode === "login"
          ? await login({
              email: String(data.get("email")),
              password: String(data.get("password")),
            })
          : await register({
              firstName: String(data.get("firstName")),
              lastName: String(data.get("lastName")),
              email: String(data.get("email")),
              password: String(data.get("password")),
            });

      onAuthenticated(result.user, result.token);
    } catch (submitError) {
      const errorCode = submitError instanceof ApiError ? submitError.code : "REQUEST_FAILED";
      const localizedError = copy.errors[errorCode as keyof typeof copy.errors];
      setError(localizedError ?? copy.errors.REQUEST_FAILED);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        lang={locale}
      >
        <button className="icon-button close-button" onClick={onClose} aria-label={copy.close}>
          ×
        </button>

        <div className="auth-heading">
          <span className="logo-mark" aria-hidden="true">C</span>
          <div>
            <p className="eyebrow">{copy.personalAccount}</p>
            <h2 id="auth-title">
              {mode === "login" ? copy.loginTitle : copy.registerTitle}
            </h2>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label={copy.authChoice}>
          <button
            className={mode === "login" ? "auth-tab is-active" : "auth-tab"}
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => changeMode("login")}
          >
            {copy.loginTab}
          </button>
          <button
            className={mode === "register" ? "auth-tab is-active" : "auth-tab"}
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => changeMode("register")}
          >
            {copy.registerTab}
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <div className="field-row">
              <label className="field">
                <span>{copy.firstName}</span>
                <input name="firstName" autoComplete="given-name" minLength={2} required />
              </label>
              <label className="field">
                <span>{copy.lastName}</span>
                <input name="lastName" autoComplete="family-name" minLength={2} required />
              </label>
            </div>
          )}

          <label className="field">
            <span>{copy.email}</span>
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@example.com"
              required
            />
          </label>

          <label className="field">
            <span>{copy.password}</span>
            <span className="password-input">
              <input
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                placeholder={
                  mode === "login"
                    ? copy.passwordLoginPlaceholder
                    : copy.passwordRegisterPlaceholder
                }
                required
              />
              <button
                type="button"
                className="show-password"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? copy.hidePassword : copy.showPassword}
              >
                {passwordVisible ? copy.hidePassword : copy.showPassword}
              </button>
            </span>
          </label>

          {error && <p className="form-message form-message--error" role="alert">{error}</p>}

          <button className="button button--wide" type="submit" disabled={loading}>
            {loading
              ? copy.wait
              : mode === "login"
                ? copy.loginButton
                : copy.registerButton}
          </button>

          <p className="form-hint">
            {mode === "login" ? copy.newHere : copy.alreadyRegistered}{" "}
            <button
              className="text-button"
              type="button"
              onClick={() => changeMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? copy.registerLink : copy.loginLink}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
};

export const App = () => {
  const [locale, setLocale] = useState<Locale>(() => {
    const savedLocale = localStorage.getItem(LOCALE_KEY);
    return savedLocale === "en" ? "en" : "uk";
  });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [page, setPage] = useState<"home" | "booking" | "sessions">(() => window.location.pathname === "/booking" ? "booking" : window.location.pathname === "/sessions" ? "sessions" : "home");
  const [continueToPage, setContinueToPage] = useState<"booking" | "sessions" | null>(null);
  const copy = translations[locale];

  const navigate = (nextPage: "home" | "booking" | "sessions") => {
    window.history.pushState(null, "", nextPage === "home" ? "/" : `/${nextPage}`);
    setPage(nextPage);
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const goToTop = () => {
    if (page !== "home") {
      navigate("home");
      return;
    }
    window.history.replaceState(null, "", "/#top");
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const handleNavigation = () => setPage(window.location.pathname === "/booking" ? "booking" : window.location.pathname === "/sessions" ? "sessions" : "home");
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  useEffect(() => {
    if (window.location.hash !== "#top" && window.location.hash !== "") return;

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));

    return () => {
      window.cancelAnimationFrame(frame);
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "uk"
        ? "Consultation — онлайн-запис"
        : "Consultation — online booking";
    localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      setSessionLoading(false);
      return;
    }

    getCurrentUser(token)
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (sessionLoading || page === "home") return;
    if (!user) {
      setContinueToPage(page);
      setAuthMode("login");
    }
  }, [page, sessionLoading, user]);

  const handleAuthenticated = (authenticatedUser: AuthUser, token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    setAccessToken(token);
    setUser(authenticatedUser);
    setAuthMode(null);
    if (continueToPage) {
      const destination = continueToPage;
      setContinueToPage(null);
      navigate(destination);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
    if (page !== "home") navigate("home");
  };

  const openPrimaryArea = () => {
    if (!user) {
      setContinueToPage("booking");
      setAuthMode("register");
      return;
    }
    navigate("booking");
  };

  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="#top"
          aria-label="Consultation"
          onClick={(event) => {
            event.preventDefault();
            goToTop();
          }}
        >
          <span className="logo-mark" aria-hidden="true">C</span>
          <span>Consultation</span>
        </a>

        <nav
          className="header-actions"
          aria-label={locale === "uk" ? "Основна навігація" : "Main navigation"}
        >
          {page !== "home" ? (
            <a className="header-link" href="/" onClick={(event) => { event.preventDefault(); navigate("home"); }}>
              {locale === "uk" ? "На головну" : "Home"}
            </a>
          ) : (
            <a className="header-link" href="#how-it-works">{copy.howItWorks}</a>
          )}
          {!sessionLoading && user && (
            <>
              <a className="header-link header-link--action" href="/booking" onClick={(event) => { event.preventDefault(); navigate("booking"); }}>
                {locale === "uk" ? "Записатися" : "Book"}
              </a>
              <a className="header-link header-link--action" href="/sessions" onClick={(event) => { event.preventDefault(); navigate("sessions"); }}>
                {locale === "uk" ? "Мої сеанси" : "My sessions"}
              </a>
            </>
          )}
          <div className="language-switcher" aria-label={copy.languageLabel}>
            <button
              className={locale === "uk" ? "is-active" : ""}
              onClick={() => setLocale("uk")}
              aria-pressed={locale === "uk"}
            >
              UA
            </button>
            <span aria-hidden="true">/</span>
            <button
              className={locale === "en" ? "is-active" : ""}
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </div>
          {!sessionLoading &&
            (user ? (
              <details className="account-menu">
                <summary className="user-chip" aria-label={locale === "uk" ? "Меню облікового запису" : "Account menu"}>
                  <span className="user-chip__avatar">{user.firstName.slice(0, 1).toUpperCase()}</span>
                  <span className="user-chip__name">{user.firstName}</span>
                  <span className="user-chip__chevron" aria-hidden="true">⌄</span>
                </summary>
                <div className="account-menu__popover">
                  <div className="account-menu__identity"><strong>{user.firstName} {user.lastName}</strong><span>{user.email}</span></div>
                  <button type="button" disabled><span>{locale === "uk" ? "Профіль" : "Profile"}</span><small>{locale === "uk" ? "Незабаром" : "Soon"}</small></button>
                  <button type="button" disabled><span>{locale === "uk" ? "Налаштування" : "Settings"}</span><small>{locale === "uk" ? "Незабаром" : "Soon"}</small></button>
                  <button type="button" className="account-menu__logout" onClick={logout}>{locale === "uk" ? "Вийти" : "Sign out"}</button>
                </div>
              </details>
            ) : (
              <button className="button button--quiet" onClick={() => setAuthMode("login")}>
                {copy.signIn}
              </button>
            ))}
        </nav>
      </header>

      {page === "booking" && user && accessToken ? (
        <main id="top" className="booking-page-main">
          <BookingFormPage token={accessToken} user={user} locale={locale} onComplete={() => navigate("sessions")} />
        </main>
      ) : page === "sessions" && user && accessToken ? (
        <main id="top" className="booking-page-main">
          <MySessionsCalendar token={accessToken} user={user} locale={locale} />
        </main>
      ) : (
      <main id="top">
        <section className="hero">
          <div className="hero__content">
            <p className="eyebrow">{copy.heroEyebrow}</p>
            <h1>{copy.heroTitle}</h1>
            <p className="lead">{copy.heroLead}</p>
            <div className="hero-actions">
              <button
                className="button button--large"
                onClick={openPrimaryArea}
              >
                {user ? copy.openAccount : copy.book}
              </button>
              <a className="secondary-link" href="#how-it-works">{copy.seeHow}</a>
            </div>
          </div>

          <aside className="availability-card" aria-label={copy.benefitsTitle}>
            <div className="availability-card__top">
              <span className="status-dot" aria-hidden="true" />
              {copy.available}
            </div>
            <h2>{copy.benefitsTitle}</h2>
            <ul>
              {copy.benefits.map((benefit) => (
                <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>
              ))}
            </ul>
            <div className="mini-calendar" aria-hidden="true">
              <span>09:00</span><span className="is-selected">10:30</span><span>12:00</span>
            </div>
          </aside>
        </section>

        <section className="steps-section" id="how-it-works">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.stepsEyebrow}</p>
              <h2>{copy.stepsTitle}</h2>
            </div>
          </div>
          <div className="steps-grid">
            {copy.steps.map(([number, title, description]) => (
              <article className="step-card" key={number}>
                <span className="step-number">{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        {user?.role === "ADMIN" && accessToken && (
          <AdminDashboard token={accessToken} locale={locale} onLogout={logout} />
        )}

        {user?.role === "SPECIALIST" && accessToken && (
          <SpecialistDashboard token={accessToken} user={user} locale={locale} onLogout={logout} />
        )}
      </main>

      )}

      {page === "home" && <footer>
        <a
          className="brand brand--footer"
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            goToTop();
          }}
        >
          <span className="logo-mark" aria-hidden="true">C</span>
          Consultation
        </a>
        <p>{copy.footer}</p>
      </footer>}

      {authMode && (
        <AuthDialog
          initialMode={authMode}
          copy={copy}
          locale={locale}
          onClose={() => setAuthMode(null)}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </>
  );
};
