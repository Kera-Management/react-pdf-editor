import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import react from "@vitejs/plugin-react-swc";

// Peer dependencies (and their subpaths) stay out of the bundle; the host
// provides them. Chakra and Emotion must be singletons so the editor reads
// the host's ChakraProvider context and theme.
const EXTERNAL_PACKAGES = [
  "react",
  "react-dom",
  "react-to-print",
  "pdfjs-dist",
  "pdf-lib",
  "@chakra-ui/react",
  "@emotion/react",
  "@phosphor-icons/react",
];

const isExternal = (id: string) =>
  EXTERNAL_PACKAGES.some((pkg) => id === pkg || id.startsWith(`${pkg}/`));

export default defineConfig({
  plugins: [
    dts({ rollupTypes: true }),
    react()
  ],
  esbuild: {
    target: "esnext"
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext"
    },
  },
  build: {
    target: "esnext",
    lib: {
      entry: "src/index.ts",
      fileName: "index",
      formats: ["es"]
    },
    rollupOptions: {
      external: isExternal,
    },
    // Keep emitting a single dist/style.css (canvas CSS) for hosts to import.
    cssCodeSplit: false,
  }
});
