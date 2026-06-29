// ═══ State ═══
const S={proj:null,active:null,editCharId:null,aiMode:'润色',aiTemp:'mid',aiLen:'long',apiConfig:JSON.parse(localStorage.getItem('ww_api')||'{}'),autoSave:true,unsaved:false,wordGoal:2000,curFontSize:16,lastArpResult:'',selectedProvider:'claude',previewMode:false,projects:[],aiMemories:[]};


// ═══ Token Estimation & Context Limits ═══
const MODEL_CONTEXT_LIMITS={
  'claude-sonnet-4-20250514':200000,'claude-sonnet-4':200000,'claude-3-5-sonnet':200000,'claude-3-haiku':200000,
  'gpt-4o':128000,'gpt-4o-mini':128000,'gpt-4-turbo':128000,'gpt-4':8192,'gpt-3.5-turbo':16385,
  'deepseek-chat':65536,'deepseek-reasoner':65536,
  'mimo-v2.5-pro':131072,'mimo-v2.5':131072,
  'qwen-plus':131072,'qwen-turbo':131072,'qwen-max':32768,
  'glm-4-flash':128000,'glm-4':128000,
  'moonshot-v1-8k':8192,'moonshot-v1-32k':32768,'moonshot-v1-128k':131072,
  'deepseek-ai/DeepSeek-V3':65536,
  'anthropic/claude-sonnet-4':200000
};
function estimateTokens(text){
  if(!text)return 0;
  let count=0;
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);
    if(c>=0x4E00&&c<=0x9FFF||c>=0x3400&&c<=0x4DBF||c>=0x20000&&c<=0x2A6DF)count+=2;
    else if(c>=0x00&&c<=0x7F)count+=0.25;
    else count+=1.5;
  }
  return Math.ceil(count);
}
function getContextLimit(model){
  if(!model)return 200000;
  for(const[k,v]of Object.entries(MODEL_CONTEXT_LIMITS)){
    if(model.includes(k)||k.includes(model))return v;
  }
  return 200000;
}
function updateContextBar(){
  const ac=S.apiConfig;
  if(!ac.key)return;
  const ed=document.getElementById('mainEditor');
  const sel=ed.value.slice(ed.selectionStart,ed.selectionEnd).trim();
  const content=sel||ed.value.trim().slice(-1000);
  const extra=document.getElementById('aiPrompt')?.value.trim()||'';
  const md=AI_MODES[S.aiMode]||{p:''};
  let fullPrompt=md.p+'\n\n'+content;
  if(S.proj)fullPrompt+='\n\n'+buildCtx();
  if(extra)fullPrompt+='\n\n'+extra;
  const memCtx=buildMemoryContext();
  if(memCtx)fullPrompt+='\n\n'+memCtx;
  const promptTokens=estimateTokens(fullPrompt);
  const limit=getContextLimit(ac.model||'');
  const pct=Math.min(100,Math.round(promptTokens/limit*100));
  const bar=document.getElementById('ctxBar');
  const txt=document.getElementById('ctxText');
  if(bar){
    bar.style.width=pct+'%';
    if(pct>80){bar.style.background='var(--red)';}
    else if(pct>50){bar.style.background='var(--gold)';}
    else{bar.style.background='var(--accent)';}
  }
  if(txt){
    const kStr=promptTokens>1000?(promptTokens/1000).toFixed(1)+'k':promptTokens;
    const lStr=limit>1000?(limit/1000).toFixed(0)+'k':limit;
    txt.textContent=kStr+'/'+lStr+' tokens';
    if(pct>80)txt.style.color='var(--red)';
    else if(pct>50)txt.style.color='var(--gold)';
    else txt.style.color='var(--text-muted)';
  }
}
async function sha256(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
