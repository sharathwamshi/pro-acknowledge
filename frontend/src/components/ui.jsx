import React from "react";
import { helpers } from "../api";

export function Avatar({ name, lg }) {
  return <div className={"avatar" + (lg ? " lg" : "")}>{helpers.initials(name)}</div>;
}

const STATUS = {
  present: ["b-present", "Present"], late: ["b-late", "Late"], half: ["b-half", "Half-day"],
  absent: ["b-absent", "Absent"], weekend: ["b-weekend", "Weekend"],
};
export function StatusBadge({ status }) {
  const [cls, txt] = STATUS[status] || ["b-recruiter", "—"];
  return <span className={"badge " + cls}>{txt}</span>;
}

export function Empty({ title, msg }) {
  return <div className="empty"><h4>{title}</h4><div>{msg}</div></div>;
}

export function SplitBar({ parts }) {
  const colors = { office: "var(--office)", remote: "var(--remote)", weekend: "var(--weekend)" };
  const total = parts.reduce((s, p) => s + p[1], 0) || 1;
  return (
    <div className="split">
      {parts.map((p, i) => (
        <div key={i} className="seg" style={{ width: `${(p[1] / total) * 100}%`, background: colors[p[0]] }} />
      ))}
    </div>
  );
}

export function Modal({ title, children, footer, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="x-btn" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}
