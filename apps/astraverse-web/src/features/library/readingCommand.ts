/** Explicit reading commands only; questions and quoted discussion stay in normal chat. */
export function readingNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = "零一二三四五六七八九";
  let total = 0, digit = 0;
  for (const char of value.replace(/两/g, "二")) {
    const unit = ({ 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[char];
    if (unit) { total += (digit || 1) * unit; digit = 0; }
    else digit = digits.indexOf(char);
  }
  return total + digit;
}
export function parseReadingCommand(message: string, titles: string[] = []): { action: "start" | "pause"; title?: string; toEnd?: boolean; fromBody?: boolean; page?: number; chapter?: number; page_delta?: number; restart?: boolean } | null {
  let text = message.trim().replace(/[。！!，,]+$/, "");
  if (/[？?]|怎么|如何|能否|不要跳|不要翻|别跳|别翻|不是|“|”|「|」/.test(text)) return null;
  if (/^(?:请|帮我)?(?:从头读|从头开始读|重新读|从头朗读)(?:吧)?$/.test(text)) return { action: "start", restart: true };
  const relative = text.match(/^(?:请|帮我)?(?:往|向)?(前|后)(?:翻|跳)?([一二三四五六七八九十百千零两\d]+)页(?:开始读|读|吧)?$/);
  if (relative) return { action: "start", page_delta: readingNumber(relative[2]) * (relative[1] === "前" ? -1 : 1) };
  if (/^(?:请)?(?:上|下)一页(?:开始读|读|吧)?$/.test(text)) return { action: "start", page_delta: text.includes("上") ? -1 : 1 };
  const location = text.match(/(?:从|跳到|跳至|翻到|读到)\s*(?:《[^》]+》\s*)?第?([一二三四五六七八九十百千零两\d]+)\s*(页|章|回|节)/);
  if (location && !/[？?]|怎么|如何|能否/.test(text)) {
    const title = text.match(/《([^》]+)》/)?.[1] || titles.find(t => t && text.includes(t));
    return { action: "start", title, [location[2] === "页" ? "page" : "chapter"]: readingNumber(location[1]) };
  }
  if (/从正文开始|跳过目录|不读目录|不要读目录/.test(text) && !/[？?]|怎么|如何|能否/.test(text)) {
    const title = text.match(/《([^》]+)》/)?.[1] || titles.find(t => t && text.includes(t));
    return { action: "start", title, fromBody: true };
  }
  if (/^(?:请|帮我|你)?(?:暂停|停止|先别|不要再)(?:朗读|阅读|读书|读了|读)$/.test(text)) return { action: "pause" };
  if (/^(?:请|帮我|你)?(?:继续|接着)(?:读|阅读|朗读|读书)(?:吧)?$/.test(text)) return { action: "start" };
  if (!text.includes("《")) {
    const title = [...titles].sort((a, b) => b.length - a.length).find(t => t && text.includes(t));
    if (title) text = text.replace(title, `《${title}》`);
  }
  const match = text.match(/^(?:请|帮我|你|请你)?(?:给我)?(?:开始)?(?:朗读|阅读|读)(?:一下|一段)?\s*《([^》]+)》(?:[，,]?\s*(读完|一直读到结束|只读一段|读一段就停))?(?:吧)?$/);
  if (!match) return null;
  const one = /只读一段|读一段就停/.test(text);
  return { action: "start", title: match[1].trim(), toEnd: one ? false : /读完|一直读到结束/.test(match[2] || "") ? true : undefined };
}
