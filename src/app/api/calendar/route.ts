import { dashboardResponse } from "@/lib/dashboard-server";
import { calendarData, changeCalendar } from "@/lib/calendar-server";
import { readMoodleRequest } from "@/lib/moodle/request";
export const dynamic = "force-dynamic";
export const GET = (request:Request) => dashboardResponse(request,userId=>calendarData(userId,new URL(request.url).searchParams));
const change = (request:Request) => dashboardResponse(request,async userId=>changeCalendar(userId,request.method,await readMoodleRequest(request,24_000)));
export const POST=change;
export const PATCH=change;
export const DELETE=change;
