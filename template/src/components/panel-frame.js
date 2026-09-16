const $ = (selector, root = document) => root.querySelector(selector);

const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const NS = 'http://www.w3.org/2000/svg';

export function drawFrames() {
  $$('.panel').forEach(panel => {
    let svg = $('.panel-frame', panel);
    if (!svg) { svg = document.createElementNS(NS,'svg');svg.classList.add('panel-frame');svg.setAttribute('aria-hidden','true');panel.append(svg); }
    const w = panel.offsetWidth, h = panel.offsetHeight;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');
    svg.innerHTML = `<path d="M10 .7H${w-10}L${w-.7} 10V${h-10}L${w-10} ${h-.7}H10L.7 ${h-10}V10Z" fill="none" stroke="#0d6ca0" stroke-opacity=".76" stroke-width=".8"/><path d="M1 23V10L10 1H40 M${w-27} 1H${w-10}L${w-1} 10V26 M1 ${h-26}V${h-10}L10 ${h-1}H35 M${w-34} ${h-1}H${w-10}L${w-1} ${h-10}V${h-24}" fill="none" stroke="#24bffc" stroke-width="1.1"/><path d="M12 2H57" stroke="#7ddfff" stroke-opacity=".3"/><path d="M${w-12} ${h-3}h-17" stroke="#138ad1" stroke-opacity=".45"/>`;
  });
}
