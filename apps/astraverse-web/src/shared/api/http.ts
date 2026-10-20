export async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "服务不可用，请检查后端连接" }));
    const detail = error.detail;
    throw new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail || error),
    );
  }
  return response.json() as Promise<T>;
}
