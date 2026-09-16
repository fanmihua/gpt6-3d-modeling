const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Each teaching explorer owns its tabs; nested explorers never share selection.
export function explorer(id, label, items) {
  return `<div class="teaching-explorer" data-explorer="${id}"><div class="explorer-tabs" role="tablist" aria-label="${escape(label)}">${items.map((item,i)=>`<button type="button" role="tab" id="${id}-tab-${i}" aria-controls="${id}-panel-${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-choice="${i}">${escape(item.label)}</button>`).join('')}</div>${items.map((item,i)=>`<div class="explorer-panel" role="tabpanel" id="${id}-panel-${i}" aria-labelledby="${id}-tab-${i}" data-choice-panel="${i}" ${i===0?'':'hidden'}>${item.html}</div>`).join('')}</div>`;
}

export function initializeExplorers(scope = document) {
  scope.querySelectorAll('[data-explorer]').forEach(group => {
    if (group.dataset.bound) return;
    group.dataset.bound = 'true';
    const owned = selector => [...group.querySelectorAll(selector)].filter(node=>node.closest('[data-explorer]')===group);
    const buttons=owned('[data-choice]'), panels=owned('[data-choice-panel]');
    function select(index, focus=false) {
      buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
      panels.forEach((panel,i)=>{panel.hidden=i!==index;});
      if(focus) buttons[index].focus();
    }
    buttons.forEach((button,index)=>{
      button.addEventListener('click',()=>select(index));
      button.addEventListener('keydown',event=>{
        const move=['ArrowRight','ArrowDown'].includes(event.key)?1:['ArrowLeft','ArrowUp'].includes(event.key)?-1:0;
        if(move){event.preventDefault();select((index+move+buttons.length)%buttons.length,true);}
        if(event.key==='Home'||event.key==='End'){event.preventDefault();select(event.key==='Home'?0:buttons.length-1,true);}
      });
    });
  });
}
