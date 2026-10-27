export const DB_URL: string | undefined;
export function sql(
  query: string,
  params?: unknown[]
): Promise<any[]>;
export function ensureTables(): Promise<void>;
