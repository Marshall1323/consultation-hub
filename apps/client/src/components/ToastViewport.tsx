import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT, type ToastPayload } from "../lib/toast";

const lifetimeMs = 4500;

export const ToastViewport = () => {
  const [items, setItems] = useState<ToastPayload[]>([]);
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    const remove = (id: number) => {
      setItems((current) => current.filter((item) => item.id !== id));
      const timer = timers.current.get(id);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(id);
    };
    const receive = (event: Event) => {
      const item = (event as CustomEvent<ToastPayload>).detail;
      setItems((current) => [...current.slice(-2), item]);
      timers.current.set(item.id, window.setTimeout(() => remove(item.id), lifetimeMs));
    };
    window.addEventListener(TOAST_EVENT, receive);
    return () => {
      window.removeEventListener(TOAST_EVENT, receive);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  if (!items.length) return null;

  return <div className="toast-viewport" aria-live="polite" aria-atomic="false">
    {items.map((item) => <div className={`app-toast app-toast--${item.kind}`} role={item.kind === "error" ? "alert" : "status"} key={item.id}>
      <span aria-hidden="true">{item.kind === "success" ? "✓" : item.kind === "error" ? "!" : "i"}</span>
      <p>{item.message}</p>
    </div>)}
  </div>;
};
