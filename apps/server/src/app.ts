import cors from "cors";
import express from "express";
import helmet from "helmet";
import { adminSchedulingRouter } from "./modules/admin/admin-scheduling.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { appointmentRouter } from "./modules/appointments/appointment.routes.js";
import { specialistRouter } from "./modules/appointments/specialist.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL ?? "http://localhost:5173",
    }),
  );
  app.use(express.json({ limit: "3mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "consultation-booking-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter, adminSchedulingRouter);
  app.use("/api/specialist", specialistRouter);
  app.use("/api", appointmentRouter);
  app.use("/api", catalogRouter);
  app.use("/api", reviewRouter);
  app.use("/api", notificationRouter);

  app.use((_request, response) => {
    response.status(404).json({ code: "ROUTE_NOT_FOUND", message: "Маршрут не знайдено" });
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(error);
      response.status(500).json({ code: "INTERNAL_ERROR", message: "Внутрішня помилка сервера" });
    },
  );

  return app;
};
