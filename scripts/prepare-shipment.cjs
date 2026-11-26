// Explicitly invoked preparation runner. Never imported by test discovery.
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
async function main(){
 if(process.argv[3]!=='--authorized-prepare')throw Error('Explicit authorized preparation scope required');
 require('../src/config/environment.ts').loadEnvironment();
 const {createEpicorClient,readEpicorSettings}=require('../src/api/baseClient.ts');
 const {prepareCustomerShipment}=require('../src/flows/customerShipment.ts');
 const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const settings=readEpicorSettings();
 if(input.company!==settings.company || input.confirmedBaseUrl!==settings.baseUrl || input.plant!=='MfgSys' || input.fromWhse!=='CHI')throw Error('Target/template confirmation mismatch');
 for(const k of ['customerId','employeeId','plant','fromWhse','fromBin','toWhse','toBin','shipVia','packageCode','tariff','workstation'])if(typeof input[k]!=='string'||!input[k].trim())throw Error('Missing input '+k);
 for(const k of ['stockQty','quantity','weight'])if(!Number.isFinite(input[k])||input[k]<=0)throw Error('Invalid '+k);
 if(input.stockQty<input.quantity || !Number.isFinite(input.unitPrice) || input.unitPrice<0 || typeof input.blindShipping!=='boolean' || !input.partExtras || typeof input.partExtras!=='object')throw Error('Invalid preparation input');
 fs.mkdirSync('captures',{recursive:true});const output='captures/preparation-'+Date.now()+'.json';
 const progress={stage:'authorized preparation intent'};const save=()=>fs.writeFileSync(output,JSON.stringify(progress,null,2));save();
 const release=await require('../src/support/liveLock.ts').acquireLiveLock(process.env.LIVE_LOCK_DIRECTORY?.trim()||'.runtime/locks',settings.baseUrl+'|'+settings.company);
 let session;
 try { session=await createEpicorClient(); } catch(error) { await release(); throw error; }
 try{await prepareCustomerShipment(session.client,input,async(name,action)=>{progress.stage='started: '+name;save();const result=await action();progress.stage='completed: '+name;save();return result;},progress);}finally{try{save();}finally{try{await session.dispose();}finally{await release();}}}
}
main().catch(()=>{console.error('Preparation stopped; inspect retained local checkpoints. Do not blindly retry.');process.exitCode=1;});
