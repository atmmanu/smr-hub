import { dashboardResponse } from "@/lib/dashboard-server";
import { readNotifications } from "@/lib/notifications-server";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => dashboardResponse(request, userId => readNotifications(userId));
