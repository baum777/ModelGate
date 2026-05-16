import React from "react";
import { PublicPreview, ReadmeLandingPage } from "./components/landing/LandingPage.js";
import { ConsoleShell } from "./components/shell/ConsoleShell.js";
import {
  resolveAppSurface,
  shouldConfirmGitHubReviewNavigation,
} from "./lib/shell-routing.js";

export { resolveAppSurface, shouldConfirmGitHubReviewNavigation };

export default function App() {
  const surface = resolveAppSurface();

  if (surface === "console") {
    return <ConsoleShell />;
  }

  return surface === "readme" ? <ReadmeLandingPage /> : <PublicPreview />;
}
