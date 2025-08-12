import React, { useRef } from "react";
import ReactDOM from "react-dom/client";
import PDFEditor, { PDFEditorRef } from "./src/lib/PDFEditor";

const App = () => {
  const ref = useRef<PDFEditorRef>(null);
  return (
    <PDFEditor
      participants={[
        { id: "1", label: "Landlord" },
        { id: "2", label: "Tenant" },
      ]}
      activeParticipantId="1"
      mode="build"
      src="/form.pdf"
      onBuildSave={(pdfBytes) => {
        // Create a download link for the PDF
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "form-with-assignments.pdf";
        a.click();
        URL.revokeObjectURL(url);
      }}
      ref={ref}
    />
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
