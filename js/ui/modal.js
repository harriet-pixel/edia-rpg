let nextId = 0;
export function modal({ title, message, confirmLabel = '確定', cancelLabel = '取消' }) {
  return new Promise(resolve => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    const heading = document.createElement('h2'); heading.id = `modal-title-${++nextId}`; heading.textContent = title;
    dialog.setAttribute('aria-labelledby', heading.id);
    const body = document.createElement('p'); body.textContent = message;
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    let settled = false;
    function finish(result) { if (settled) return; settled = true; dialog.close(); dialog.remove(); previous?.focus(); resolve(result); }
    if (cancelLabel) { const cancel = document.createElement('button'); cancel.className = 'button secondary'; cancel.textContent = cancelLabel; cancel.onclick = () => finish(false); actions.append(cancel); }
    const confirm = document.createElement('button'); confirm.className = 'button'; confirm.textContent = confirmLabel; confirm.onclick = () => finish(true); actions.append(confirm);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.append(heading, body, actions); document.body.append(dialog); dialog.showModal();
  });
}
