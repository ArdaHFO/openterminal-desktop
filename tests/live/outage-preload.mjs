// Opt-in fault injection for an ISOLATED test API only. Never import in production.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 const host=new URL(url).hostname;
 const blocked=host==='yahoo.com'||host.endsWith('.yahoo.com')||host==='yahooapis.com'||host.endsWith('.yahooapis.com')||host==='nasdaq.com'||host.endsWith('.nasdaq.com');
 if(blocked){console.log('SIMULATED_503 '+host+new URL(url).pathname);return new Response('simulated outage',{status:503});}
 return originalFetch(input,init);
};
