if (location.protocol === "file:") {
  addEventListener("DOMContentLoaded", () => {
    const warning = document.createElement("aside");
    warning.setAttribute("role", "alert");
    warning.style.cssText = "position:fixed;z-index:2147483647;inset:0 0 auto;padding:14px 20px;background:#7c2d12;color:#fff;font:600 16px/1.4 system-ui;text-align:center;box-shadow:0 2px 12px #0005";
    warning.textContent = "Helium examples use browser modules and cannot run from a file:// URL. From the repository root, run ‘npm run examples’, then open the URL printed in the terminal.";
    document.body.prepend(warning);
  });
}
