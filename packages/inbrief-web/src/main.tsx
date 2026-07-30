// Entry point. Nothing but mounting: everything testable lives in App.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppFromUrl } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <AppFromUrl />
    </StrictMode>,
  );
