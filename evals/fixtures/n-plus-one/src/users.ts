export async function loadUsers(ids: string[]): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const id of ids) {
    const response = await fetch(`https://api.example.com/users/${id}`);
    results.push(await response.json());
  }
  return results;
}
