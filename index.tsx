import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Button, ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ThemeProvider, useTheme } from "next-themes";
import PDFEditor, { PDFEditorMode, PDFEditorRef } from "./src/lib/PDFEditor";

// This is a plain dev-harness entry point (not a library module -- nothing
// under src/ imports it), so it has no exports for react-refresh to key off
// of. That's expected here; disable the rule rather than restructuring a
// file that exists only to run `yarn dev` locally.
// eslint-disable-next-line react-refresh/only-export-components
const App = () => {
  const [src, setSrc] = useState("/generated-form.pdf");
  const [mode, setMode] = useState("build");
  // The editor follows the host's colour mode via the `.dark` class that
  // next-themes puts on <html> (same as the Kera app); no theme prop.
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const ref = useRef<PDFEditorRef>(null);
  return (
    <div>
      <select value={src} onChange={(e) => setSrc(e.target.value)}>
        <option value="/generated-form.pdf">Generated Form</option>
        <option value="/form-saved.pdf">Saved Form</option>
        <option value="/form.pdf">Original Form</option>
      </select>
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="build">Build</option>
        <option value="edit">Edit</option>
        <option value="view">View</option>
      </select>
      <Button
        type="button"
        size="xs"
        variant="outline"
        aria-pressed={dark}
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        {dark ? "Light mode" : "Dark mode"}
      </Button>
      <PDFEditor
        participants={[
          { id: "1", label: "Landlord" },
          { id: "2", label: "Tenant" },
        ]}
        activeParticipantId="1"
        mode={mode as PDFEditorMode}
        src={src}
        allowedModes={["build", "edit", "view"]}
        onClose={() => {
          console.log("close");
        }}
        onBuildSave={(pdfBytes) => {
          // Create a download link for the PDF
          const blob = new Blob([pdfBytes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "form-saved.pdf";
          a.click();
          URL.revokeObjectURL(url);
        }}
        ref={ref}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChakraProvider value={defaultSystem}>
      <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
        <App />
      </ThemeProvider>
    </ChakraProvider>
  </React.StrictMode>
);
