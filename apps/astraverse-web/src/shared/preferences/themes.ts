import type { CSSProperties } from "react";

export type ThemeId = "mint" | "light" | "sky" | "peach" | "dark" | "ocean";
interface Palette {
  background: string;
  surface: string;
  surfaceSoft: string;
  surfaceRaised: string;
  sidebar: string;
  text: string;
  secondary: string;
  muted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  accentContrast: string;
  wash: string;
  stage: string;
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
  shadow: string;
  shadowElevated: string;
  overlay: string;
}
interface Theme extends Palette {
  id: ThemeId;
  name: string;
  desc: string;
  light: boolean;
}
const lightPalette: Palette = {
  background: "#f3f4f5",
  surface: "#ffffff",
  surfaceSoft: "#f3f4f6",
  surfaceRaised: "#fafbfc",
  sidebar: "#eceff1",
  text: "#252c34",
  secondary: "#515c68",
  muted: "#626d78",
  border: "#e1e5e9",
  borderStrong: "#c7cfd7",
  accent: "#46586d",
  accentHover: "#35475b",
  accentContrast: "#ffffff",
  wash: "#e9edf2",
  stage: "#f8f9fa",
  success: "#326449",
  successBg: "#eaf1eb",
  danger: "#94473f",
  dangerBg: "#f8eeeb",
  warning: "#7a5c2d",
  warningBg: "#f5f0e5",
  info: "#43617d",
  infoBg: "#eaf0f5",
  shadow: "0 1px 2px #19263804, 0 8px 28px #19263804",
  shadowElevated: "0 28px 90px #16233429, 0 0 0 1px #16233408",
  overlay: "#1b25336b",
};
const darkPalette: Palette = {
  background: "#14171b",
  surface: "#1b1f25",
  surfaceSoft: "#20252c",
  surfaceRaised: "#252b33",
  sidebar: "#171a1f",
  text: "#edf0f4",
  secondary: "#bfc6d0",
  muted: "#9aa4b1",
  border: "#303741",
  borderStrong: "#46515f",
  accent: "#c5cdd6",
  accentHover: "#e0e5eb",
  accentContrast: "#202730",
  wash: "#2b343e",
  stage: "#1c2027",
  success: "#a3c7af",
  successBg: "#25372c",
  danger: "#deb0a9",
  dangerBg: "#3e2b2a",
  warning: "#d0bd96",
  warningBg: "#393325",
  info: "#aac2d6",
  infoBg: "#273542",
  shadow: "0 1px 2px #0000001a, 0 12px 32px #00000014",
  shadowElevated: "0 28px 100px #00000075, 0 0 0 1px #ffffff08",
  overlay: "#07090dc2",
};
export const themes = [
  {
    ...lightPalette,
    id: "mint",
    name: "青瓷",
    desc: "雾白与松绿 · 清新克制",
    light: true,
    background: "#f2f4f1",
    surfaceSoft: "#f1f4f0",
    surfaceRaised: "#fafbf9",
    sidebar: "#ecefeb",
    text: "#28322c",
    secondary: "#536158",
    muted: "#606d63",
    border: "#dfe5dd",
    borderStrong: "#c3cec2",
    accent: "#3e6250",
    accentHover: "#2f503e",
    accentContrast: "#ffffff",
    wash: "#e7ede5",
    stage: "#f8faf6",
  },
  {
    ...lightPalette,
    id: "light",
    name: "云铂",
    desc: "铂灰与冷白 · 清晰专注",
    light: true,
  },
  {
    ...lightPalette,
    id: "sky",
    name: "雾蓝",
    desc: "浅灰与钢蓝 · 理性通透",
    light: true,
    background: "#f1f4f7",
    surfaceSoft: "#eff3f7",
    surfaceRaised: "#f9fbfd",
    sidebar: "#eaf0f4",
    accent: "#42617d",
    accentHover: "#304c68",
    wash: "#e5edf4",
    stage: "#f7fafc",
    border: "#dde5ed",
    borderStrong: "#c0cedc",
  },
  {
    ...lightPalette,
    id: "peach",
    name: "暖砂",
    desc: "暖灰与浅褐 · 温润安静",
    light: true,
    background: "#f4f1ec",
    surface: "#fefdfb",
    surfaceSoft: "#f4f0e9",
    surfaceRaised: "#fbf9f5",
    sidebar: "#ede8df",
    text: "#332f29",
    secondary: "#625a4f",
    muted: "#70665a",
    border: "#e4ddd2",
    borderStrong: "#cfc2b2",
    accent: "#786044",
    accentHover: "#624c33",
    wash: "#ede5d9",
    stage: "#faf8f3",
  },
  {
    ...darkPalette,
    id: "dark",
    name: "曜石",
    desc: "石墨与银白 · 沉静深邃",
    light: false,
  },
  {
    ...darkPalette,
    id: "ocean",
    name: "深海",
    desc: "墨蓝与灰青 · 夜间灵感",
    light: false,
    background: "#141e26",
    surface: "#1a2731",
    surfaceSoft: "#202f3a",
    surfaceRaised: "#263845",
    sidebar: "#17232c",
    text: "#e7eef1",
    secondary: "#bdcbd3",
    muted: "#a1b3bf",
    border: "#304450",
    borderStrong: "#486170",
    accent: "#a4c4c1",
    accentHover: "#c3ddda",
    accentContrast: "#1a2c2c",
    wash: "#2b4148",
    stage: "#1a2a34",
  },
] as const satisfies readonly Theme[];
export const getTheme = (id: ThemeId) =>
  themes.find((theme) => theme.id === id) || themes[0];
/** Every surface and semantic state derives from the selected palette. */
export function themeVariables(theme: Theme): CSSProperties {
  return {
    colorScheme: theme.light ? "light" : "dark",
    "--page": theme.background,
    "--surface": theme.surface,
    "--surface-soft": theme.surfaceSoft,
    "--surface-raised": theme.surfaceRaised,
    "--sidebar": theme.sidebar,
    "--text": theme.text,
    "--text-secondary": theme.secondary,
    "--muted": theme.muted,
    "--border": theme.border,
    "--border-strong": theme.borderStrong,
    "--accent": theme.accent,
    "--accent-hover": theme.accentHover,
    "--accent-contrast": theme.accentContrast,
    "--wash": theme.wash,
    "--stage": theme.stage,
    "--success": theme.success,
    "--success-bg": theme.successBg,
    "--danger": theme.danger,
    "--danger-bg": theme.dangerBg,
    "--warning": theme.warning,
    "--warning-bg": theme.warningBg,
    "--info": theme.info,
    "--info-bg": theme.infoBg,
    "--shadow": theme.shadow,
    "--shadow-elevated": theme.shadowElevated,
    "--overlay": theme.overlay,
  } as CSSProperties;
}
