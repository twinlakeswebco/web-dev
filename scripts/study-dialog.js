const studyDialog = document.querySelector('#study-dialog');
const directLink = studyDialog.querySelector('a');
const studyLink = Array.from(document.querySelectorAll('.article-body a'))
  .find(link => link.href === directLink.href);

if (studyLink && typeof studyDialog.showModal === 'function') {
  const viewer = studyDialog.querySelector('iframe');
  studyLink.setAttribute('aria-haspopup', 'dialog');
  studyLink.setAttribute('aria-controls', studyDialog.id);
  studyLink.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!viewer.hasAttribute('src')) viewer.src = directLink.href;
    studyDialog.showModal();
  });
  studyDialog.addEventListener('close', () => studyLink.focus());
}
