const PREFIX = "coframe:";

export function localCopyName(diagramId: string, generation: number): string {
  return `${PREFIX}${diagramId}:${generation}`;
}

async function databaseNames(): Promise<string[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];
  try {
    return (await indexedDB.databases()).map((d) => d.name ?? "").filter((name) => name.startsWith(PREFIX));
  } catch {
    return [];
  }
}

function remove(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

export async function dropOtherGenerations(diagramId: string, generation: number): Promise<void> {
  const keep = localCopyName(diagramId, generation);
  const names = await databaseNames();
  await Promise.all(names.filter((n) => n.startsWith(`${PREFIX}${diagramId}:`) && n !== keep).map(remove));
}

export async function clearLocalCopies(): Promise<void> {
  await Promise.all((await databaseNames()).map(remove));
}
