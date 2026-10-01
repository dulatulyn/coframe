const KEY = "coframe:last-workspace";

export function rememberWorkspace(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
  }
}

export function lastWorkspace(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
