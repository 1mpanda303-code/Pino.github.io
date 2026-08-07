export function downloadTextFile(content: string, type: string, filename: string) {
  if (!content.trim()) throw new Error('download_empty');
  const url = URL.createObjectURL(new Blob([content], { type }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
