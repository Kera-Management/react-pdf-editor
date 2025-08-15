import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import PDFEditor, { PDFEditorMode, PDFEditorRef } from "./src/lib/PDFEditor";

const App = () => {
  const [src, setSrc] = useState("/generated-form.pdf");
  const [mode, setMode] = useState("build");
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
      <PDFEditor
        participants={[
          { id: "1", label: "Landlord" },
          { id: "2", label: "Tenant" },
        ]}
        activeParticipantId="1"
        mode={mode as PDFEditorMode}
        src={src}
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
    <App />
  </React.StrictMode>
);
