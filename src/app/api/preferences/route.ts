import {dashboardResponse} from "@/lib/dashboard-server";
import {getPreferences,savePreferences} from "@/lib/preferences-server";
import {readMoodleRequest} from "@/lib/moodle/request";
export const dynamic="force-dynamic";
export const GET=(request:Request)=>dashboardResponse(request,getPreferences);
export const PATCH=(request:Request)=>dashboardResponse(request,async userId=>savePreferences(userId,await readMoodleRequest(request)));
