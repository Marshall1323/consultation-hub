import { useEffect, useRef, useState } from "react";
import { getNotifications, readAllNotifications, readNotification, type Notification } from "../lib/scheduling-api";

type Props = { token: string; locale: "uk" | "en"; onOpen: (href: string) => void };

export const NotificationBell = ({ token, locale, onOpen }: Props) => {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const load = () => getNotifications(token).then((result) => { setItems(result.notifications); setUnread(result.unreadCount); }).catch(() => undefined);

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", load); };
  }, [token]);

  const openItem = async (item: Notification) => {
    if (!item.readAt) { await readNotification(token, item.id).catch(() => undefined); setUnread((value) => Math.max(0, value - 1)); }
    if (detailsRef.current) detailsRef.current.open = false;
    onOpen(item.href);
  };

  return <details className="notification-menu" ref={detailsRef}>
    <summary className="notification-bell" aria-label={locale === "uk" ? "Повідомлення" : "Notifications"}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
    </summary>
    <div className="notification-popover">
      <div className="notification-popover__head">
        <strong>{locale === "uk" ? "Повідомлення" : "Notifications"}</strong>
        {unread > 0 && <button type="button" onClick={async () => { await readAllNotifications(token); setUnread(0); setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); }}>{locale === "uk" ? "Прочитати всі" : "Read all"}</button>}
      </div>
      <div className="notification-list">
        {items.length === 0 ? <p className="notification-empty">{locale === "uk" ? "Нових повідомлень немає" : "No notifications yet"}</p> : items.map((item) => <button type="button" className={item.readAt ? "notification-item" : "notification-item is-unread"} key={item.id} onClick={() => void openItem(item)}>
          <span className="notification-item__dot" aria-hidden="true" />
          <span><strong>{locale === "uk" ? item.titleUk : item.titleEn}</strong><small>{locale === "uk" ? item.bodyUk : item.bodyEn}</small><time>{new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time></span>
        </button>)}
      </div>
    </div>
  </details>;
};
