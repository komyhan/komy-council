import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function protect(action,value){
 if(process.platform!=='win32')return Promise.reject(Error('Windows 보안 저장은 Windows에서만 사용할 수 있어.'));
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',readFileSync(fileURLToPath(new URL('./vault.ps1',import.meta.url)),'utf8')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let out='';const timer=setTimeout(()=>{child.kill();reject(Error('보안 저장 시간 초과'));},15000);
  child.stdout.on('data',b=>out+=b.toString('utf8'));child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(Error('Windows 보안 저장을 실행하지 못했어.'));});
  child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(out);else reject(Error('Windows 계정으로 키를 복원하지 못했어. 키를 다시 입력해 줘.'));});
  child.stdin.on('error',()=>{});child.stdin.end(action+'\n'+value);
 });
}
export class KeyVault{
 constructor(path='.local/credentials.dpapi',crypt=protect){this.path=path;this.crypt=crypt;}
 get exists(){return existsSync(this.path);}
 async save(config){const encrypted=await this.crypt('protect',JSON.stringify(config));writeFileSync(this.path+'.tmp',encrypted,{mode:0o600});renameSync(this.path+'.tmp',this.path);}
 async load(){if(!this.exists)return null;return JSON.parse(await this.crypt('unprotect',readFileSync(this.path,'utf8')));}
 forget(){if(this.exists)unlinkSync(this.path);}
}
