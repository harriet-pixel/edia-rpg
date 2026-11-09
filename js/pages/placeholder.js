export function renderPlaceholder(title) {
  const card = document.createElement('section'); card.className = 'paper placeholder-page';
  const heading = document.createElement('h1'); heading.textContent = title;
  const label = document.createElement('p'); label.className = 'construction'; label.textContent = '施工中';
  card.append(heading, label); return card;
}
