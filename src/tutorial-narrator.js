import { narration } from './tutorial-narration.js';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const narrationTitles = new Map(narration.map(item => [item.id, item.title]));

export function initializeNarrator(root, navigate) {
  root.insertAdjacentHTML('beforeend', `
    <button class="speaker-launch" type="button" aria-expanded="false" aria-controls="speaker-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></svg>逐字稿</button>
    <aside class="speaker-panel" id="speaker-panel" role="dialog" aria-modal="false" aria-labelledby="speaker-title" hidden>
      <div class="speaker-head"><h2 id="speaker-title">逐字讲稿</h2><button type="button" class="speaker-close" aria-label="收起逐字稿">×</button></div>
      <div class="speaker-controls"><label class="speaker-select-label" for="speaker-select">讲述段落</label><select id="speaker-select">${narration.map((item,i)=>`<option value="${i}">${escape(item.title)}</option>`).join('')}</select><div class="speaker-options"><label><input type="checkbox" class="speaker-follow" checked>跟随页面</label><div class="speaker-mode"><button type="button" data-speaker-mode="part" aria-pressed="true">当前段</button><button type="button" data-speaker-mode="all" aria-pressed="false">全文</button></div><div class="speaker-font"><button type="button" aria-label="缩小讲稿字号">A−</button><button type="button" aria-label="放大讲稿字号">A＋</button></div></div></div>
      <div class="speaker-body" tabindex="0" aria-label="逐字稿正文"></div>
      <div class="speaker-foot"><button type="button" class="speaker-prev">← 上一段</button><span class="speaker-count"></span><button type="button" class="speaker-next">下一段 →</button></div>
    </aside>`);
  const panel=root.querySelector('.speaker-panel'),launch=root.querySelector('.speaker-launch');
  const select=panel.querySelector('select'),follow=panel.querySelector('.speaker-follow');
  const body=panel.querySelector('.speaker-body'),prev=panel.querySelector('.speaker-prev'),next=panel.querySelector('.speaker-next');
  const positions=new Map();let index=0, pageId='top', mode='part', fontSize=16;
  const markup=item=>`<article class="speaker-passage"><h3>${escape(item.title)}</h3>${item.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</article>`;
  function key(){return mode==='all'?'all':narration[index].id;}
  function render(){
    body.innerHTML=mode==='all'?narration.map(markup).join(''):markup(narration[index]);
    body.scrollTop=positions.get(key())||0;
    select.value=String(index);select.disabled=mode==='all';
    follow.disabled=mode==='all';
    prev.disabled=mode==='all'||index===0;next.disabled=mode==='all'||index===narration.length-1;
    panel.querySelector('.speaker-count').textContent=mode==='all'?`全文 · ${narration.length} 段`:`${index+1} / ${narration.length}`;
    panel.querySelectorAll('[data-speaker-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.speakerMode===mode)));
  }
  function remember(){positions.set(key(),body.scrollTop);}
  function setIndex(value){if(value===index)return;remember();index=value;render();}
  function sync(id){
    pageId=id;
    if(follow.checked&&mode==='part'){
      const found=narration.findIndex(item=>item.id===id);
      if(found>=0)setIndex(found);
    }
  }
  function setOpen(open){
    if(open){sync(pageId);panel.hidden=false;launch.setAttribute('aria-expanded','true');(select.disabled?body:select).focus({preventScroll:true});}
    else {remember();panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus({preventScroll:true});}
  }
  launch.addEventListener('click',()=>setOpen(panel.hidden));
  panel.querySelector('.speaker-close').addEventListener('click',()=>setOpen(false));
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);}});
  function choose(value){setIndex(value);if(follow.checked)navigate(narration[index].id);}
  select.addEventListener('change',()=>choose(Number(select.value)));
  prev.addEventListener('click',()=>choose(Math.max(0,index-1)));
  next.addEventListener('click',()=>choose(Math.min(narration.length-1,index+1)));
  follow.addEventListener('change',()=>{if(follow.checked)sync(pageId);});
  panel.querySelectorAll('[data-speaker-mode]').forEach(button=>button.addEventListener('click',()=>{
    remember();mode=button.dataset.speakerMode;
    if(mode==='part'&&follow.checked){const found=narration.findIndex(item=>item.id===pageId);if(found>=0)index=found;}
    render();
  }));
  const fontButtons=panel.querySelectorAll('.speaker-font button');
  function resizeFont(delta){fontSize=Math.max(14,Math.min(22,fontSize+delta));body.style.fontSize=`${fontSize}px`;fontButtons[0].disabled=fontSize===14;fontButtons[1].disabled=fontSize===22;}
  fontButtons[0].addEventListener('click',()=>resizeFont(-1));fontButtons[1].addEventListener('click',()=>resizeFont(1));
  render();return {sync};
}
