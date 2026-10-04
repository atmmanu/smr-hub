// Reusable isolation primitive; one account failing never skips the others in a batch.
export async function isolatedUsers<T>(users:string[],run:(user:string)=>Promise<T>){const results:{user:string;ok:boolean;value?:T}[]=[];for(const user of users){try{results.push({user,ok:true,value:await run(user)});}catch{results.push({user,ok:false});}}return results;}
