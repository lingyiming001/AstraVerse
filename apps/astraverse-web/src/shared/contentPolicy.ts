export const CONTENT_NOTICE = "请换一种说法，消息中不能包含脏话或辱骂。";
export function inputProblem(text: string): string | null {
  if (text.length > 4000) return "消息不能超过4000字。";
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\p{Cf}/gu, "");
  const compact = normalized.replace(/[\p{P}\p{Z}\s_]+/gu, "");
  const english = normalized.replace(/(?<=[a-z])[.*_\-]+(?=[a-z])/g, "");
  const zh = /傻[逼比屄]|煞笔|傻叉|蠢货|白痴|智障|废物|垃圾人|贱人|婊子|狗东西|狗杂种|去死|滚蛋|王八蛋|混蛋|他妈的|你妈的|妈的|操你|草你|艹你|肏|狗屎|死全家|脑残|神经病/;
  const en = /\b(?:fuck(?:ing|ed|er|ers)?|motherfucker|shit(?:ty)?|bullshit|bitch(?:es)?|asshole|bastard|dickhead|idiot|moron|stupid)\b/i;
  return zh.test(compact) || en.test(english) ? CONTENT_NOTICE : null;
}
