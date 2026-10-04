import {timingSafeEqual} from "node:crypto";
import {MoodleError} from "./moodle/types.ts";
export function assertCron(request:Request,secret:string|undefined){
 if(!secret||secret.length<32)throw new MoodleError("configuration","La ejecución automática no está configurada.",503);
 const given=Buffer.from(request.headers.get("authorization")||"");const expected=Buffer.from(`Bearer ${secret}`);
 if(given.length!==expected.length||!timingSafeEqual(given,expected))throw new MoodleError("unauthenticated","Acceso no autorizado.",401);
}
