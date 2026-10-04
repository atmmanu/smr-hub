import {CalendarPanel} from "@/components/calendar-panel";
export default async function CalendarPage({searchParams}:{searchParams:Promise<{source?:string;event?:string}>}){
 const params=await searchParams;
 return <CalendarPanel deepLink={params.event?{id:params.event,source:params.source||"moodle"}:undefined}/>;
}
