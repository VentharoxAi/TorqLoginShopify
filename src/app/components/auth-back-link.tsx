"use client";

import type { MouseEvent } from "react";

export function AuthBackLink() {
  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  }

  return (
    <a className="auth-back-link" href="/" onClick={goBack}>
      <span aria-hidden="true">←</span> Back
    </a>
  );
}
