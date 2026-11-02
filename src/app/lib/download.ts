// Saves `text` as a file the browser downloads (to its downloads folder, or where the user picks):
// a link to it, clicked. Needs no `downloads` permission.
export function downloadFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Once the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
