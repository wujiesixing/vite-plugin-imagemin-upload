document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.remove("no-js");
    const img = new Image();
    img.onload = img.onerror = () => {
        const webp = img.height === 1;
        document.body.classList.add(webp ? "webp" : "no-webp");
        if (!webp) {
            const fallback = (node) => {
                if (!(node instanceof HTMLImageElement))
                    return;
                try {
                    const reg = "[^#?]+\\.)webp(\\?([^#]*&)?from-format=(jpe?g|png|gif|svg)([&#].*)?";
                    const srcset = node.srcset;
                    const regSrcset = new RegExp(`^(\\s*${reg}(\\s+\\S+)?\\s*)$`, "i");
                    if (srcset && regSrcset.test(srcset)) {
                        node.srcset = srcset
                            .split(",")
                            .map((src) => {
                            return src.replace(regSrcset, (match, p1, p2, p3, p4) => `${p1}${p4}${p2}`);
                        })
                            .join(",");
                    }
                    const src = node.src;
                    const regSrc = new RegExp(`^(${reg})$`, "i");
                    if (src && regSrc.test(src)) {
                        node.src = src.replace(regSrc, (match, p1, p2, p3, p4) => `${p1}${p4}${p2}`);
                    }
                }
                catch (error) {
                    console.log("[vite:imagemin-upload] " + error?.message);
                }
            };
            document.body.querySelectorAll("img").forEach(fallback);
            const observer = new MutationObserver((mutationsList) => {
                try {
                    for (const mutation of mutationsList) {
                        if (mutation.type === "attributes" &&
                            ["src", "srcset"].includes(mutation.attributeName || "")) {
                            fallback(mutation.target);
                            continue;
                        }
                        if (mutation.type === "childList") {
                            mutation.addedNodes.forEach((node) => {
                                if (node instanceof HTMLImageElement) {
                                    fallback(node);
                                }
                                else {
                                    if (node instanceof Element) {
                                        node.querySelectorAll("img").forEach(fallback);
                                    }
                                }
                            });
                        }
                    }
                }
                catch (error) {
                    console.log("[vite:imagemin-upload] " + error?.message);
                }
            });
            observer.observe(document.body, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ["src", "srcset"],
                characterData: false,
            });
        }
    };
    img.src =
        "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
});
