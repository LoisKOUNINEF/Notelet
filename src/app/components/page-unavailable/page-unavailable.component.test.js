import { PageUnavailableComponent } from '#root/dist/src/app/components/page-unavailable/page-unavailable.component.js';

describe('PageUnavailableComponent', () => {
  it('says the page can\'t have notes, as a status', () => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    const notice = new PageUnavailableComponent(placeholder);
    notice.render();
    expect($('.page-unavailable').getAttribute('role')).toBe('status');
    expect($('.page-unavailable__title').textContent).toBe('Notes aren\'t available on this page.');
    notice.destroy();
    document.getElementById('app').innerHTML = '';
  });
});
