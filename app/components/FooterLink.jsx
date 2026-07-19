"use client";

// Reusable footer навигационен линк с водеща стрелка (декоративна, aria-hidden).
// Управлява вътрешни (<a href>) и action (<button onClick>) линкове еднакво.
// Стрелката наследява цвета, не мести текста, леко се измества надясно при hover.
// НЕ се ползва за select/имейл/copyright/обикновен текст.

import Icon from "./Icon.jsx";

export default function FooterLink({ href, onClick, external = false, children, className = "", ...rest }) {
  const arrow = <Icon name={external ? "external" : "arrowRight"} size={13} className="sf-link-arrow" aria-hidden="true" />;
  const cls = "sf-link sf-link-arrowed " + className;
  if (href) {
    const ext = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
    return (
      <a className={cls} href={href} {...ext} {...rest}>
        {arrow}<span className="sf-link-text">{children}</span>
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} {...rest}>
      {arrow}<span className="sf-link-text">{children}</span>
    </button>
  );
}
