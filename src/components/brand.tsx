import Link from "next/link";
import { Icon } from "./icon";
export function Brand() {
  return <Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-xl"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-[#0a101c]"><Icon name="chip"/></span>SMR <span className="text-brand -ml-1">HUB</span></Link>;
}
