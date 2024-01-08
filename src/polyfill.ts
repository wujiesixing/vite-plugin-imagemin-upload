document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.remove("no-js");

  const img = new Image();

  img.onload = img.onerror = () => {
    const webp = img.height === 1;

    document.body.classList.add(webp ? "webp" : "no-webp");

    if (!webp) {
      const fallback = (node: Node) => {
        if (!(node instanceof HTMLImageElement)) return;

        try {
          const src = node.src;
          const reg =
            /^([^#?]+\.)webp(\?([^#]*&)?from-format=(jpe?g|png|gif|svg)([&#].*)?)$/i;

          if (reg.test(src)) {
            img.src = src.replace(
              reg,
              (match, p1, p2, p3, p4) => `${p1}${p4}${p2}`
            );
          }
        } catch (error) {
          console.log("[vite:imagemin-upload] " + error?.message);
        }
      };

      document.body.querySelectorAll("img").forEach(fallback);

      const observer = new MutationObserver((mutationsList) => {
        try {
          for (const mutation of mutationsList) {
            if (
              mutation.type === "attributes" &&
              ["src"].includes(mutation.attributeName || "")
            ) {
              fallback(mutation.target);
              continue;
            }
            if (mutation.type === "childList") {
              mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLImageElement) {
                  fallback(node);
                } else {
                  if (node instanceof Element) {
                    node.querySelectorAll("img").forEach(fallback);
                  }
                }
              });
            }
          }
        } catch (error) {
          console.log("[vite:imagemin-upload] " + error?.message);
        }
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src"],
        characterData: false,
      });
    }
  };

  img.src =
    "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
});
