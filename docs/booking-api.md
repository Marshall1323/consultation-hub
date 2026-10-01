# API розкладу та записів

Усі дати записів зберігаються й передаються у форматі ISO 8601 UTC. Системний часовий пояс за замовчуванням — `Europe/Kyiv`.

## Публічні маршрути

- `GET /api/services` — активні послуги.
- `GET /api/specialists?serviceId=...` — спеціалісти, які надають послугу.
- `GET /api/availability?specialistId=...&serviceId=...&date=YYYY-MM-DD` — фактично вільні слоти.

## Клієнт

- `GET /api/appointments/me` — власні записи.
- `POST /api/appointments` — створення запису з повторною перевіркою слота у serializable-транзакції.
- `PATCH /api/appointments/:id/cancel` — скасування з урахуванням допустимого терміну.

## Спеціаліст

- `GET /api/specialist/dashboard` — профіль, графік, винятки, записи та статистика.
- `PUT /api/specialist/schedule` — повна заміна регулярного тижневого графіка.
- `POST /api/specialist/exceptions` — перерва, вихідний або додатковий робочий інтервал.
- `DELETE /api/specialist/exceptions/:id` — видалення винятку.
- `PATCH /api/specialist/appointments/:id/status` — завершення або скасування консультації.

## Адміністратор

- `GET /api/admin/appointments` — усі записи та агрегована статистика.
- `PATCH /api/admin/appointments/:id/status` — зміна статусу.
- `GET /api/admin/specialists/:id/schedule` — графік спеціаліста.
- `PUT /api/admin/specialists/:id/schedule` — редагування графіка.

## Захист від конфліктів

Backend повторно формує доступні слоти всередині транзакції з рівнем ізоляції `Serializable`. Додатково PostgreSQL має exclusion constraints для активних записів спеціаліста та клієнта. Інтервали є напіввідкритими: `[startsAt, endsAt)`.

## Перевірка

- `pnpm test` — модульні тести алгоритму слотів.
- `pnpm test:integration` — сквозний тест API: формування слота, два одночасні запити, конфлікт, скасування і повторне бронювання. Тимчасові записи видаляються автоматично.
