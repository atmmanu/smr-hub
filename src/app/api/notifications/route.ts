import { dashboardResponse } from "@/lib/dashboard-server";
import { listNotifications, readNotifications } from "@/lib/notifications-server";
import { readMoodleRequest } from "@/lib/moodle/request";
import { MoodleError } from "@/lib/moodle/types";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => dashboardResponse(request, listNotifications);
export const PATCH = (request: Request) => dashboardResponse(request, async userId => {
 const body = await readMoodleRequest(request);
 if (typeof body.id !== "string" || typeof body.read !== "boolean") throw new MoodleError("input", "Selecciona una notificación válida.");
 return readNotifications(userId, body.id, body.read);
});
