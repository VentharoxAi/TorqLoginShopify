"use client";

import type { FormEvent } from "react";

const CONTACT_EMAIL = "Ahmad.Ajam18@hotmail.com";

export function ContactForm() {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const subject = `Website contact from ${name}`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      "",
      message,
    ].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <label htmlFor="contact-name">Name<span>*</span></label>
      <input id="contact-name" name="name" autoComplete="name" required />

      <label htmlFor="contact-email">Email<span>*</span></label>
      <input id="contact-email" name="email" type="email" autoComplete="email" required />

      <label htmlFor="contact-phone">Phone (optional)</label>
      <input id="contact-phone" name="phone" type="tel" autoComplete="tel" />

      <label htmlFor="contact-message">Message<span>*</span></label>
      <textarea id="contact-message" name="message" rows={6} required />

      <button type="submit">Send message</button>
      <p>Your email app will open to send this message.</p>
    </form>
  );
}
