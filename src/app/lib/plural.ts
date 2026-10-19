// "1 note", "2 notes", "3 done to-dos": every word the panel counts takes a plain "s".
export function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

// "2 notes and 1 to-do": the counts that aren't zero, joined; '' when they all are.
export function countList(counts: [count: number, word: string][], joiner: string = ' and '): string {
  return counts.filter(([count]) => count > 0).map(([count, word]) => plural(count, word)).join(joiner);
}
