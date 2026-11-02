import { editOnClick } from '#root/dist/src/app/lib/card-click.js';

describe('editOnClick', () => {
  let card;
  let edited;
  let binding;

  beforeEach(() => {
    card = document.getElementById('app').appendChild(document.createElement('article'));
    card.innerHTML = '<p class="text">Some text</p><button type="button">Delete</button><label><input type="checkbox"></label>';
    edited = [];
    binding = editOnClick(card, (target) => edited.push(target));
  });

  afterEach(() => {
    card.removeEventListener('click', binding[2]);
    card.remove();
    document.getSelection().removeAllRanges();
  });

  it('opens the editor from a click on the card, handing over what was clicked', () => {
    card.querySelector('.text').click();
    expect(edited).toEqual([card.querySelector('.text')]);
  });

  it('leaves the card\'s own controls alone', () => {
    card.querySelector('button').click();
    card.querySelector('input').click();
    expect(edited).toEqual([]);
  });

  it('leaves a click that ends a text selection inside the card', () => {
    const range = document.createRange();
    range.selectNodeContents(card.querySelector('.text'));
    document.getSelection().addRange(range);
    card.querySelector('.text').click();
    expect(edited).toEqual([]);
  });

  it('returns its binding for the component\'s eventListeners', () => {
    expect(binding[0]).toBe(card);
    expect(binding[1]).toBe('click');
  });
});
