import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve,dirname} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

const root=fileURLToPath(new URL("../",import.meta.url));
const require=createRequire(import.meta.url);const urls=new Map<string,string>();
const dataUrl=(code:string)=>`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
function componentModule(path:string):string{
 const full=resolve(root,path);if(urls.has(full))return urls.get(full)!;
 let code=ts.transpileModule(readFileSync(full,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
 code=code.replace(/from\s+["']([^"']+)["']/g,(_match,name:string)=>{
  let url:string;
  if(name==="next/navigation")url=dataUrl('export const useRouter=()=>({push(){},refresh(){}});export const usePathname=()=>"/dashboard";');
  else if(name==="next/link")url=dataUrl(`import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children);}`);
  else if(name.startsWith("@/")||name.startsWith(".")){
   const base=name.startsWith("@/")?resolve(root,"src",name.slice(2)):resolve(dirname(full),name);
   const target=[base,`${base}.ts`,`${base}.tsx`].find(existsSync);assert.ok(target,`Cannot resolve ${name}`);url=componentModule(target);
  }else url=pathToFileURL(require.resolve(name)).href;
  return `from ${JSON.stringify(url)}`;
 });
 const url=dataUrl(code);urls.set(full,url);return url;
}
test("Dashboard: componentes reales renderizan Inicio, calendario y campana sin romper secciones existentes",async()=>{
 // Only Next's navigation/link adapters are mocked; actual React components and helpers are rendered.
 const {NotificationProvider,NotificationCenter}=await import(componentModule("src/components/notification-center.tsx"));
 const {Workspace}=await import(componentModule("src/components/workspace.tsx"));
 const {CalendarPanel}=await import(componentModule("src/components/calendar-panel.tsx"));
 const props={section:"inicio",userId:"test",email:"test@example.invalid",name:"Test",role:"user",initialTasks:[],initialExams:[],initialLinks:[],loadError:false};
 const html=renderToStaticMarkup(React.createElement(NotificationProvider,null,React.createElement(NotificationCenter),React.createElement(Workspace,props)));
 for(const text of ["Aula Virtual","Sincronizar ahora","Próximos eventos","Próximas tareas","Lo que se viene","Tus accesos rápidos","Notificaciones"])assert.ok(html.includes(text),text);
 const calendar=renderToStaticMarkup(React.createElement(CalendarPanel));
 for(const text of ["Nuevo evento","Europe/Madrid","calendar-month","calendar-agenda","Personales","Generales"])assert.ok(calendar.includes(text),text);
 for(const section of ["tareas","examenes","enlaces","herramientas","asignaturas","configuracion"])assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(NotificationProvider,null,React.createElement(Workspace,{...props,section}))));
 const configuration=renderToStaticMarkup(React.createElement(NotificationProvider,null,React.createElement(Workspace,{...props,section:"configuracion"})));
 for(const text of ["Preferencias de avisos","El mismo día","Email de recordatorios","Mi perfil"])assert.ok(configuration.includes(text),text);
});
