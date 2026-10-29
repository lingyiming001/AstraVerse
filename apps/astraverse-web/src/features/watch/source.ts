export type WatchSource = { kind: "file" | "direct" | "bilibili" | "web"; url: string; title: string; original?: string; bvid?: string; part?: number };
export function parseVideoUrl(raw: string): WatchSource {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("请输入完整的 http 或 https 视频链接"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("仅支持不含账号密码的 HTTP(S) 链接");
  const host=url.hostname.toLowerCase();
  if (["www.bilibili.com","bilibili.com","m.bilibili.com","player.bilibili.com"].includes(host)) {
    const bvid=url.pathname.match(/\/video\/(BV[a-zA-Z0-9]{10})(?:\/|$)/)?.[1] || url.searchParams.get("bvid");
    const aid=url.pathname.match(/\/video\/av(\d+)(?:\/|$)/)?.[1] || url.searchParams.get("aid");
    if (!bvid && !aid) throw new Error("请粘贴 B 站视频详情页链接（含 BV 或 av 号）");
    if (bvid && !/^BV[a-zA-Z0-9]{10}$/.test(bvid) || aid && !/^\d{1,20}$/.test(aid)) throw new Error("视频编号无效");
    const embed=new URL("https://player.bilibili.com/player.html");
    if(bvid)embed.searchParams.set("bvid",bvid);else embed.searchParams.set("aid",aid!);
    const p=Number(url.searchParams.get("p") || 1);
    embed.searchParams.set("p",String(Number.isInteger(p)&&p>0&&p<=10000?p:1));
    embed.searchParams.set("autoplay","0");
    return {kind:"bilibili",url:embed.href,title:`B站视频 ${bvid || `av${aid}`}`,original:url.href,bvid:bvid||undefined,part:Number(embed.searchParams.get('p'))};
  }
  return {kind:/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(url.pathname)?"direct":"web",url:url.href,title:url.hostname,original:url.href};
}
