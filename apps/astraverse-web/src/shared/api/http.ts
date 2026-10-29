export function friendlyError(detail: unknown, status = 0): string {
  if (typeof detail === "string") {
    try { return friendlyError(JSON.parse(detail), status); } catch { /* plain text */ }
  }
  const value = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
  if (value.detail) return friendlyError(value.detail, status);
  const attempts = Array.isArray(value.attempts) ? value.attempts : [];
  const codes = attempts.map(a => Number(a?.status));
  if (attempts.some(a => a?.code === 'Arrearage')) return "模型服务账户余额不足或已欠费，请前往阿里云百炼控制台检查余额与账单，补足后重试。";
  if (attempts.some(a => a?.code === 'AccessDenied.Unpurchased')) return "当前账户尚未开通这个模型，请在供应商控制台开通权限，或切换已开通的模型。";
  const code = codes.length ? codes[codes.length - 1] : status;
  if (code === 401 || code === 403) return "模型服务暂时无法使用：访问授权未通过。请在「设置 → 智能与模型」检查密钥及模型使用权限，再重试。";
  if (code === 429) return "模型服务当前请求过多或可用额度不足。请稍后重试；如果持续出现，请检查模型服务账户的额度。";
  if (code === 400 || code === 404 || code === 422) return "模型服务未能接受这次请求，可能是模型名称、服务地址或能力配置不匹配。请在「设置 → 智能与模型」测试当前聊天模型，或切换其他模型后重试。";
  if (code === 408 || code === 504) return "回复等待超时，请稍后重试，或切换其他聊天模型。";
  if (attempts.length || code >= 500) return "暂时无法连接模型服务。请稍后重试；如果持续出现，请在「设置 → 智能与模型」测试当前聊天模型。";
  const message = typeof detail === "string" ? detail : typeof value.message === "string" ? value.message : "";
  if (/failed to fetch|network|load failed/i.test(message)) return "连接中断，请检查网络和本地服务是否正在运行，然后重试。";
  if (/timeout|timed out/i.test(message)) return "回复等待超时，请稍后重试。";
  if (message && /[\u4e00-\u9fff]/.test(message) && !/[{}<>]|traceback|https?:\/\//i.test(message)) return message;
  return "这次操作未能完成，请稍后重试。如果持续出现，请检查服务连接与模型设置。";
}

export async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "服务不可用，请检查后端连接" }));
    const detail = error.detail;
    throw new Error(friendlyError(detail || error, response.status));
  }
  return response.json() as Promise<T>;
}
