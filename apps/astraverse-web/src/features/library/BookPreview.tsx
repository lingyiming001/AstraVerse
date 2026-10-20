import { useEffect, useState } from "react";
import type { Resource } from "@/features/library/resources";
export default function BookPreview({ resource }: { resource: Resource }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const extension = (resource.filename || "").split(".").pop()?.toLowerCase();
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setText("");
    setError("");
    setPage(0);
    if (extension === "txt" || extension === "md") {
      setLoading(true);
      void fetch(resource.url || "", { signal: controller.signal })
        .then((r) => r.blob())
        .then(async (blob) => {
          if (blob.size > 5 * 1024 * 1024)
            throw new Error("文本超过5MB，请下载后阅读");
          const buffer = await blob.arrayBuffer();
          let value: string;
          try {
            value = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
          } catch {
            value = new TextDecoder("gb18030").decode(buffer);
          }
          if (active) setText(value);
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : "读取失败");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [resource.url, extension]);
  return (
    <div className="book-reader">
      {extension === "pdf" ? (
        <iframe src={resource.url} title={`阅读${resource.name}`} />
      ) : extension === "epub" ? (
        <p>EPUB 已保存在书籍库，请下载后用电子书阅读器打开。</p>
      ) : (
        <>
          {loading ? (
            <p>正在打开书籍…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <pre>
              {text.slice(page * 10000, (page + 1) * 10000) || "暂无正文"}
            </pre>
          )}
          {text.length > 10000 && (
            <div className="book-pagination">
              <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                上一页
              </button>
              <span>
                {page + 1} / {Math.ceil(text.length / 10000)}
              </span>
              <button
                disabled={(page + 1) * 10000 >= text.length}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
      <a href={resource.url} download={resource.filename || resource.name}>
        下载原文件
      </a>
    </div>
  );
}
