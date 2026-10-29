import { create } from "zustand";
import type { Resource } from "@/features/library/resources";
export interface ViewingContext { title: string; current_time?: number; subtitle?: string; subtitle_source?: "platform" | "file"; frame?: {mime:"image/jpeg";data:string} }
export const useWatch = create<{open:boolean;resource:Resource|null;context:ViewingContext|null}>(()=>({open:false,resource:null,context:null}));
