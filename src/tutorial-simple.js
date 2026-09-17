import { courseLinks } from './course-links.js';
import './tutorial-simple.css';
import './tutorial-article.css';
import './tutorial-diagrams.css';
import './tutorial-presenter.css';
import './tutorial-code-notes.css';
import { createCourse, createPreparation } from './tutorial-content.js';
import { appendCodeNotes } from './tutorial-code-notes.js';
import { initializeExplorers } from './tutorial-widgets.js';
import { initializeNarrator, narrationTitles } from './tutorial-narrator.js';

const image = name => window.__COURSE_IMAGES__?.[name] || `./tutorial/${name.replace(/\.(png|jpg)$/, '.webp')}`;
const course=createCourse(image);
const root=document.querySelector('#tutorial-root');
const phaseNames={practice:'先实操 · 两类建模案例',theory:'再回看 · 解释模型与执行原理'};
root.innerHTML=`<a class="skip-link" href="#main">跳到正文</a>
<header class="site-header"><h1 class="header-title"><a href="#top">GPT6 3D建模测评</a></h1><a class="author" href="#top" aria-label="范米花儿，回到开头"><img src="${image('avatar.png')}" alt="范米花儿的头像" width="42" height="42"><strong>范米花儿</strong></a></header>
<aside class="contents"><nav aria-label="内容目录"></nav></aside>
<main id="main"><div id="top"></div><div class="course-preview" id="preview"><div class="preview-heading"><h2>效果预览</h2><nav class="course-links" aria-label="效果与源码"><a href="${courseLinks.preview}" target="_blank" rel="noopener">交互预览 <span aria-hidden="true">↗</span></a><a href="${courseLinks.repository}" target="_blank" rel="noopener">GitHub 仓库 <span aria-hidden="true">↗</span></a></nav></div><video class="preview-video" src="${window.__COURSE_VIDEO__ || './tutorial/preview-pump.mp4'}" poster="${image('preview-pump-poster.jpg')}" autoplay muted loop playsinline controls preload="metadata" aria-label="厂区与泵房效果预览"></video></div>
${createPreparation(image, courseLinks.template)}
${course.map((item,i)=>`<section id="${item.id}" aria-labelledby="title-${item.id}"><div class="section-heading"><span class="section-number">${String(i+1).padStart(2,'0')}</span><div><h2 id="title-${item.id}">${item.title}</h2>${item.lead?`<p class="section-lead">${item.lead}</p>`:''}</div></div>${item.body}${item.takeaway?`<div class="section-close"><p>${item.takeaway}</p></div>`:''}</section>`).join('')}
<footer class="page-footer"><span>范米花儿 · GPT6 3D建模测评</span><a href="#top">回到开头 ↑</a></footer></main>
<dialog class="image-dialog" aria-label="查看案例图片"><button class="close-image" type="button" aria-label="关闭大图">×</button><img alt=""><p></p></dialog>`;

// Use the same anchors for the sidebar and manuscript so their order cannot diverge.
const anchors=[document.getElementById('top'),document.getElementById('warmup')];
const menu=course.map((item,i)=>{
  const section=document.getElementById(item.id);anchors.push(section);
  const topics=[...section.querySelectorAll('.course-topic, .course-block')];
  const children=topics.map((topic,j)=>{
    topic.id=`${item.id}-part-${j+1}`;anchors.push(topic);
    const title=topic.dataset.topic||topic.querySelector('h3')?.textContent||narrationTitles.get(topic.id);
    return `<li><a href="#${topic.id}">${title}</a></li>`;
  }).join('');
  const group=i===0||course[i-1].phase!==item.phase?`<span class="nav-group">${phaseNames[item.phase]}</span>`:'';
  return `${group}<div class="nav-chapter"><a class="chapter-link" href="#${item.id}"><span>${String(i+1).padStart(2,'0')}</span>${item.nav}</a><ul class="subnav">${children}</ul></div>`;
}).join('');
root.querySelector('.contents nav').innerHTML=`<div class="nav-chapter"><a class="chapter-link" href="#warmup">前置实操 · 口述需求</a></div>${menu}`;
const previewVideo=root.querySelector('.preview-video');
previewVideo.muted=true;
if(matchMedia('(prefers-reduced-motion: reduce)').matches){previewVideo.autoplay=false;previewVideo.pause();}
appendCodeNotes(root);
initializeExplorers();
// Only request illustrations when their panel is near the viewport.
const pendingImages=[...root.querySelectorAll('img[data-src]')];
const revealImage=img=>{img.src=img.dataset.src;delete img.dataset.src;};
if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){revealImage(entry.target);observer.unobserve(entry.target);}},{rootMargin:'300px'});
  pendingImages.forEach(img=>observer.observe(img));
}else pendingImages.forEach(revealImage);
function navigate(id){
  if(location.hash!==`#${id}`)location.hash=id;
  document.getElementById(id)?.scrollIntoView();
  queueMark();
}
const narrator=initializeNarrator(root,navigate);
const links=[...root.querySelectorAll('.contents a')],contents=root.querySelector('.contents');
let pending=false,lastActive;
function markSection(){
  pending=false;
  const threshold=(parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||118)+12;
  const active=anchors.filter(node=>node.getBoundingClientRect().top<=threshold).at(-1)||anchors[0];
  const chapter=active.closest('main section')?.id;
  links.forEach(link=>{
    const on=link.hash===`#${active.id}`;
    link.classList.toggle('active',on);
    link.classList.toggle('chapter-active',link.classList.contains('chapter-link')&&link.hash===`#${chapter}`);
    if(on)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
  });
  narrator.sync(active.id);
  if(lastActive!==active.id&&innerWidth>700&&!contents.matches(':hover, :focus-within')){
    const link=links.find(item=>item.hash===`#${active.id}`);
    if(link){const r=link.getBoundingClientRect(),c=contents.getBoundingClientRect();if(r.top<c.top+16)contents.scrollTop+=r.top-c.top-16;else if(r.bottom>c.bottom-16)contents.scrollTop+=r.bottom-c.bottom+16;}
  }
  lastActive=active.id;
}
function queueMark(){if(!pending){pending=true;requestAnimationFrame(markSection);}}
addEventListener('scroll',queueMark,{passive:true});
addEventListener('resize',queueMark);
addEventListener('hashchange',queueMark);
const aliases={'workflow-part-2':'workflow-part-1','photo-part-2':'script-part-6',inputs:'cad',ai:'workflow',blender:'script',glb:'dashboard',render:'dashboard',execution:'methods',terminal:'script',handoff:'dashboard','cad-reading':'cad','cad-check':'cad','photo-material':'photo','photo-check':'photo'};
if(aliases[location.hash.slice(1)])history.replaceState(null,'',`#${aliases[location.hash.slice(1)]}`);
requestAnimationFrame(()=>{const target=document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView();markSection();});

const dialog=root.querySelector('.image-dialog');let lastImage;
root.addEventListener('click',event=>{
  const button=event.target.closest('[data-image]');if(!button)return;
  lastImage=button;dialog.querySelector('img').src=image(button.dataset.image);
  dialog.querySelector('img').alt=button.querySelector('img').alt;
  dialog.querySelector('p').textContent=button.closest('figure').querySelector('figcaption')?.textContent || button.querySelector('img').alt;dialog.showModal();
});
root.querySelector('.close-image').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>lastImage?.focus());
