import { createImage } from './placeholder.js';
import { presentGrant } from './reward-feedback.js';
export function mountCardPicker(container, { engine, store, cardBackSrc } ) {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('../../css/card-picker.css', import.meta.url).href; container.append(style);
  const host = document.createElement('div'); host.className = 'card-picker'; host.setAttribute('aria-label', '三選一獎勵'); container.append(host);
  function render() {
    const pending = engine.restore(); host.replaceChildren();
    if (!pending) return;
    if (pending.resolved) {
      const result = document.createElement('p'); result.setAttribute('role', 'status');
      result.textContent = `已領取${pending.pickedIndex === null ? '' : `第 ${pending.pickedIndex + 1} 張`}：${pending.result.map(item => item.itemId ?? `${item.type} ×${item.amount}`).join('、')}`;
      host.append(result); return;
    }
    pending.cards.forEach((card, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'reward-card';
      button.setAttribute('aria-label', `選擇第 ${index + 1} 張${card.kind ? `：${card.kind}` : '配件背面卡'}`);
      button.append(createImage({ src: card.image ?? cardBackSrc, alt: card.kind ?? '✧ 配件卡', className: 'card-back' }));
      if (card.bundle) { const amount = document.createElement('span'); amount.textContent = `×${card.bundle.items[0].amount}`; button.append(amount); }
      button.addEventListener('click', () => { const result = engine.pickCard(pending.drawId, index); presentGrant(result); render(); });
      host.append(button);
    });
  }
  render(); const stop = store.subscribe(render);
  return () => { stop(); host.remove(); style.remove(); };
}
