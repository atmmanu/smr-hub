import test from "node:test";
import assert from "node:assert/strict";
import {displayDate,filterCalendar,madridDate,madridInput,madridInstant,monthCells,occursOn,relativeDay,upcomingCalendar,validateCalendarInput,validDate,type CalendarEvent} from "../src/lib/calendar.ts";
const event:CalendarEvent={id:"1",source:"moodle",title:"IPv6",description:"",subject:"Redes Locales",start_at:"2026-10-10T21:59:00Z",end_at:null,start_date:null,end_date:null,all_day:false,event_type:"assignment",completed:false,read:false,hidden:false,favourite:false,external_url:null};
test("Calendario: filtros por fuente/asignatura y orden cronológico sin eventos ocultos",()=>{
 const events=[event,{...event,id:"2",source:"personal" as const,start_at:"2026-10-09T08:00:00Z"},{...event,id:"3",hidden:true},{...event,id:"4",subject:"Programación en Python"}];
 assert.deepEqual(filterCalendar(events).map(e=>e.id),["2","1","4"]);
 assert.deepEqual(filterCalendar(events,"moodle","Redes Locales").map(e=>e.id),["1"]);
 assert.deepEqual(filterCalendar(events,"personal").map(e=>e.id),["2"]);
 assert.deepEqual(upcomingCalendar(events,new Date("2026-10-10T00:00:00Z")).map(e=>e.id),["1","4"]);
});
test("Calendario: Madrid independiente del navegador, horario de verano/invierno",()=>{
 assert.equal(madridInstant("2026-07-10T23:59"),"2026-07-10T21:59:00.000Z");
 assert.equal(madridInstant("2026-12-10T23:59"),"2026-12-10T22:59:00.000Z");
 assert.equal(madridDate("2026-10-10T22:30:00Z"),"2026-10-11");
 assert.equal(madridInput("2026-10-10T21:59:00Z"),"2026-10-10T23:59");
 assert.match(displayDate(event),/23:59/);
 assert.throws(()=>madridInstant("2026-03-29T02:30"),/no existe/);
 assert.equal(madridInstant("2026-10-25T02:30"),"2026-10-25T00:30:00.000Z");
 assert.equal(madridInput(madridInstant("1900-01-01T12:00")),"1900-01-01T12:00");
});
test("Calendario: hoy/mañana y días completos conservan fechas al cambiar hora",()=>{
 const now=new Date("2026-10-24T23:00:00Z");assert.equal(relativeDay("2026-10-25",now),"Hoy");assert.equal(relativeDay("2026-10-26",now),"Mañana");assert.equal(relativeDay("2026-10-28",now),"En 3 días");
 const fields=validateCalendarInput({title:"Todo el día",subject:null,event_type:"activity",all_day:true,start:"2026-10-25",end:""});
 assert.equal(fields.start_at,"2026-10-24T22:00:00.000Z");assert.equal(fields.end_at,"2026-10-25T23:00:00.000Z");assert.equal(fields.start_date,"2026-10-25");
 const day={...event,...fields};assert.ok(occursOn(day,"2026-10-25"));assert.ok(!occursOn(day,"2026-10-26"));
 assert.equal(upcomingCalendar([day],new Date("2026-10-25T12:00:00Z")).length,1);
});
test("Calendario: validación rechaza IDs implícitos, fechas imposibles, campos y asignaturas",()=>{
 const body={title:"Estudiar",description:"",subject:null,event_type:"activity",all_day:false,start:"2026-10-10T12:00",end:""};
 assert.equal(validateCalendarInput({...body,user_id:"otro",role:"admin"}).title,"Estudiar");
 assert.ok(!Object.hasOwn(validateCalendarInput({...body,user_id:"otro"}),"user_id"));
 for(const values of [{title:" "},{title:"x".repeat(161)},{description:"x".repeat(4001)},{subject:"Otra"},{start:"2026-02-30T12:00"},{start:"2026-13-01T12:00"},{end:"2026-10-09T12:00"},{event_type:"moodle"},{all_day:"true"}])assert.throws(()=>validateCalendarInput({...body,...values}));
 assert.equal(validDate("2026-13-01"),false);assert.equal(validDate("2026-02-30"),false);
});
test("Calendario: cuadrícula empieza lunes, cubre el mes y spans multiday",()=>{
 const cells=monthCells("2026-10");assert.equal(cells.length,42);assert.equal(new Date(`${cells[0]}T12:00Z`).getUTCDay(),1);assert.ok(cells.includes("2026-10-31"));
 assert.ok(occursOn({...event,end_at:"2026-10-12T10:00:00Z"},"2026-10-11"));
});
