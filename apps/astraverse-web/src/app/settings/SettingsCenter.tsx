import type { Resource } from "@/features/library/resources";
import ModelSettingsPanel from "@/features/models/ModelSettingsPanel";
import type { AgentOption } from "@/features/agents/agentApi";
import { Activity, Radio, Sparkles, Server, GitBranch, ShieldCheck, Settings2, Code2, BookOpen } from "lucide-react";
import CharacterControls from "@/features/stage/CharacterControls";
import AgentSettings from "@/features/agents/AgentSettings";
import GeneralSettings from "@/features/settings/GeneralSettings";
import McpPanel from "@/features/mcp/McpPanel";
import PluginSettings from "@/features/plugins/PluginSettings";
import LiveSettings from "@/features/live/LiveSettings";
import HelpCenter from "@/features/settings/HelpCenter";
const sections = [
  { id: "agents", name: "角色设置", icon: Sparkles, group: "智能与模型" },
  { id: "general", name: "外观与体验", icon: Settings2, group: "偏好设置" },
  { id: "providers", name: "平台模型", icon: Server, group: "智能与模型" },
  { id: "routing", name: "能力路由", icon: GitBranch, group: "智能与模型" },
  {
    id: "playground",
    name: "多模态实验室",
    icon: Sparkles,
    group: "智能与模型",
  },
  { id: "character", name: "角色表现", icon: Activity, group: "偏好设置" },
  { id: "live", name: "直播平台", icon: Radio, group: "连接与支持" },
  { id: "plugins", name: "插件中心", icon: ShieldCheck, group: "连接与支持" },
  { id: "mcp", name: "MCP 与工具", icon: Code2, group: "连接与支持" },
  { id: "help", name: "帮助中心", icon: BookOpen, group: "连接与支持" },
];

interface Props {
  resources?: Resource[];
  initialTab?: string;
  agentSection?: string;
  agentId?: string;
  agentOptions?: AgentOption[];
  onAgentActivate?: (id: string) => void;
}

/** Compose feature settings here; feature modules never import the app shell. */
export default function SettingsCenter({ agentSection = "persona", resources = [], initialTab = "general", agentId = "character-0", agentOptions = [], onAgentActivate }: Props) {
  return <ModelSettingsPanel initialTab={initialTab} tabs={sections} renderSection={(tab, models) => {
    switch (tab) {
      case "agents": return <AgentSettings initialSection={agentSection} resources={resources} activeId={agentId} options={agentOptions} models={models} onActivate={onAgentActivate} />;
      case "general": return <GeneralSettings />;
      case "character": return <CharacterControls />;
      case "live": return <LiveSettings />;
      case "plugins": return <PluginSettings />;
      case "mcp": return <McpPanel />;
      case "help": return <HelpCenter />;
      default: return null;
    }
  }} />;
}
