import "dotenv/config";
import { createApp } from "./app.js";
import { completeExpiredAppointments } from "./modules/appointments/appointment-lifecycle.service.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`API is running at http://localhost:${port}`);
});

void completeExpiredAppointments().catch(console.error);
const lifecycleTimer = setInterval(() => void completeExpiredAppointments().catch(console.error), 60_000);
lifecycleTimer.unref();
