interface ImportMeta { readonly env?: { readonly VITE_RPC_URL?: string } }
declare module '*.generated.json' { const content: Record<string,string>; export default content; }
