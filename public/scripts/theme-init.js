(() => {
  try {
    if (localStorage.getItem("kai-theme") === "dark") {
      document.documentElement.dataset.theme = "dark";
    }
  } catch {
    // Theme preference is optional and must not block page rendering.
  }
})();
