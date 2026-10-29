import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import ReaderWindow from '@/features/library/ReaderWindow';
import BroadcastView, { publishBroadcastStage } from "@/features/live/BroadcastView";
import "@/app/styles/style.css";
import "@/app/styles/refinement.css";
import "@/app/styles/companion.css";
import "@/app/styles/palette.css";
import "@/app/styles/studioRefresh.css";
import "@/features/agents/agent.css";
import "@/features/chat/chatComposer.css";
const broadcast = new URLSearchParams(location.search).get("view") === "broadcast";
const reader = new URLSearchParams(location.search).get('view') === 'reader';
if (!broadcast && !reader) publishBroadcastStage();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {reader ? <ReaderWindow /> : broadcast ? <BroadcastView /> : <App />}
  </React.StrictMode>,
);

import "@/app/styles/broadcastStudio.css";
import "@/app/styles/productUI.css";
