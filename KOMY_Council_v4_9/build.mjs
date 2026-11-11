import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
mkdirSync('dist/server',{recursive:true});
const timeline=readFileSync('timeline-layout.mjs','utf8').replace('export function','function');
const brief=readFileSync('review-brief.mjs','utf8').replaceAll('export function','function');
const ui=brief+'\n'+readFileSync('credential-ui.mjs','utf8').replaceAll('export function','function')+'\n'+timeline+'\n'+readFileSync('morning-brief.mjs','utf8').replace('export function','function')+'\n'+readFileSync('connection-flow.mjs','utf8').replace('export async function','async function')+'\n'+readFileSync('project-ui.js','utf8')+'\n'+readFileSync('debate-ui.js','utf8')+'\n'+readFileSync('jobs-ui.js','utf8');
const html=readFileSync('app.html','utf8').replace('/*DISCUSSION_CSS*/',()=>readFileSync('discussion.css','utf8')).replace('</body>',()=>'<script>'+ui+'\n'+readFileSync('bridge-ui.js','utf8')+'\n'+readFileSync('workspace-simple.js','utf8')+'</script></body>');
writeFileSync('dist/server/index.js',readFileSync('worker.mjs','utf8').replace('/*HTML*/',()=>JSON.stringify(html)));
// .openai/hosting.json은 각 설치 환경의 호스팅 설정(Site ID)이며 저장소에 포함하지 않습니다.
// 파일이 있으면 배포 산출물에 복사하고, 없으면 로컬 실행용 Worker만 생성합니다.
if(existsSync('.openai/hosting.json')){mkdirSync('dist/.openai',{recursive:true});copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');console.log('Built council Worker and manifest');}
else console.log('Built council Worker (.openai/hosting.json 없음: 호스팅 설정 복사를 생략했습니다)');
