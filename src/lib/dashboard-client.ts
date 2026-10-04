export async function dashboardFetch<T>(url: string, method = "GET", body?: Record<string,unknown>, signal?: AbortSignal): Promise<T> {
 const response = await fetch(url, { method, credentials:"same-origin", cache:"no-store", headers:body ? {"Content-Type":"application/json"} : {}, body:body ? JSON.stringify(body):undefined, signal:signal || AbortSignal.timeout(65_000) });
 const data = await response.json();
 if (!response.ok) throw new Error(data.error || "No se ha podido completar la operación.");
 return data as T;
}
export function academicUpdated() { window.dispatchEvent(new Event("smr:academic-updated")); }
