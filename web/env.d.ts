interface ImportMeta { readonly env?: { readonly VITE_RPC_URL?: string; readonly DEPUMP_NETWORK?: string } }
declare module '*.generated.json' { const content: Record<string,string>; export default content; }
declare module '*.png' { const url: string; export default url; }
