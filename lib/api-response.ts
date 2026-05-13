export const readJsonResponse = async <T>(
  response: Response
): Promise<T | undefined> => {
  const body = await response.text();

  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined;
  }
};

export const getApiErrorMessage = (
  response: Response,
  data: { error?: string } | undefined,
  fallback: string
) => {
  return data?.error || response.statusText || fallback;
};
